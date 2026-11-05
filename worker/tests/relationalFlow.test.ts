// Negocio real + SQL real PostgreSQL 17 aislado. Auth y R2 son dobles de prueba.
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import worker,{type Env} from '../src/index';
import {RelationalRuntime} from '../src/relationalRuntime';
import {techCenterSections,optionValue} from '../../shared/techCenterForm';
import {defaultCaptureForm} from '../../shared/captureFormSchema';
const admin='40000000-0000-4000-8000-000000000001';
const trainer='40000000-0000-4000-8000-000000000002';
const other='40000000-0000-4000-8000-000000000003';
let db:any,campaignId:string,personId:string,groupId:string;
let failNextCaptureCommit=false;
const objects=new Map<string,Uint8Array>();
const registrationAnswers={age:'25',contactCenterExperience:'No',workedAtTechCenter:'No',education:'Secundaria completa',reentry:'No',birthDate:'2001-01-01',addressReference:'Lima',contractType:'PLANILLA MICRO',workOrStudy:'No',workday:'Full time',availability:'Turno tarde',commitments:'No',modality:'Presencial',privacyAcknowledged:true};
const captureConfiguration={minAge:18,maxAge:null,workdays:['Full time','Semi full'],schedules:['Turno mañana','Turno tarde'],modality:'Presencial'};
const authUsers=new Map<string,any>();
const env={DATA_PROVIDER:'supabase',SUPABASE_URL:'https://sql-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',ALLOWED_ORIGIN:'http://localhost:3000',PRODUCTION_ORIGIN:'https://example.test',MAX_UPLOAD_BYTES:'10485760',ATTENDANCE_TIME_ZONE_OFFSET:'-05:00',CAPTURE_HASH_SECRET:'test-only-key',DOCUMENTS:{put:async(k:string,v:any)=>{objects.set(k,new Uint8Array(await new Response(v).arrayBuffer()))},get:async(k:string)=>objects.has(k)?{body:objects.get(k),httpMetadata:{contentType:'application/pdf'}}:null,delete:async(k:string)=>{objects.delete(k)}}} as unknown as Env;
async function call(path:string,method='GET',body?:any,actor=admin,company?:string){
 const r=await worker.fetch(new Request('https://worker.test'+path,{method,headers:{Origin:'http://localhost:3000',Authorization:'Bearer '+actor,...(company?{'X-Talent-Company':company}:{}),...(!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}),env);
 const data:any=await r.json().catch(()=>({}));
 if(!r.ok)console.log('FLOW ERROR',method,path,r.status,data);
 return {status:r.status,data};
}

async function signGroup(group:string){
 const created=await call('/api/offers/templates','POST',{campaignId,title:'CI Propuesta',content:'Condiciones CI para {{nombre}}. Bonos y políticas de capacitación.'});expect(created.status).toBe(200);
 expect((await call('/api/offers/assign','POST',{groupId:group,templateId:created.data})).status).toBe(200);
 const docs=(await db.query('select * from talent_offers.documents where group_id=$1 and revoked_at is null',[group])).rows;
 for(const d of docs){const signed=await call('/api/public/offers/'+d.token,'POST',{dni:d.snapshot.dni,accepted:true,contentHash:d.content_hash,signature:[Array.from({length:12},(_,i)=>[i*10,30+i])]});expect(signed.status).toBe(200);expect(signed.data.signedAt).toBeTruthy();}
}

describe('Transición relacional PostgreSQL 17',()=>{
 beforeAll(async()=>{
  db=new PGlite();
  await db.exec(readFileSync(resolve('../supabase/tests/bootstrap.sql'),'utf8'));
  for(const f of readdirSync(resolve('../supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(resolve('../supabase/migrations',f),'utf8'));
  await db.exec(`insert into auth.users values ('${admin}'),('${trainer}'),('${other}');
   insert into talent.companies(id,name) values ('tenant','CI'),('other','CI');
   insert into talent.profiles(company_id,id,auth_user_id,username,display_name,role,status) values
   ('tenant','${admin}','${admin}','ci.admin','CI Admin','ADMIN','ACTIVO'),
   ('tenant','${trainer}','${trainer}','ci.trainer','CI Trainer','FORMADOR','ACTIVO'),
   ('other','${other}','${other}','ci.other','CI Other','ADMIN','ACTIVO');
   insert into talent.user_modules(company_id,id,user_id,module) select 'tenant','${admin}:'||code,'${admin}',code from talent.modules;
   insert into talent.user_modules(company_id,id,user_id,module) values ('tenant','trainer-module','${trainer}','FORMACION');
   insert into talent.tenant_revisions(company_id) values ('tenant'),('other') on conflict(company_id) do nothing;`);
  authUsers.set(admin,{id:admin,email:'ci.admin@auth.talentcc.invalid'});authUsers.set(trainer,{id:trainer,email:'ci.trainer@auth.talentcc.invalid'});authUsers.set(other,{id:other,email:'ci.other@auth.talentcc.invalid'});
  vi.stubGlobal('fetch',vi.fn(async(input:any,init?:RequestInit)=>{
   const url=new URL(String(input));if(url.hostname==='challenges.cloudflare.com')return Response.json({success:true,hostname:'example.test',action:'capture'});if(url.hostname!=='sql-test.supabase.co')throw new Error('UNEXPECTED_PROVIDER '+url.hostname);
   const body=typeof init?.body==='string'?JSON.parse(init.body):{};
   if(url.pathname==='/auth/v1/user'){const uid=new Headers(init?.headers).get('Authorization')?.replace('Bearer ','');const user=authUsers.get(uid||'');return user?Response.json(user):Response.json({},{status:401});}
   if(url.pathname.startsWith('/auth/v1/admin/users')){
    const id=url.pathname.split('/')[5];
    if(!id&&(!init?.method||init.method==='GET'))return Response.json({users:Array.from(authUsers.values())});
    if(init?.method==='POST'){const uid=crypto.randomUUID();await db.query('insert into auth.users(id) values ($1)',[uid]);const user={id:uid,...body};authUsers.set(uid,user);return Response.json(user);}
    if(init?.method==='PUT'){const user={...authUsers.get(id),...body,id};authUsers.set(id,user);return Response.json(user);}
   }
   const fn=url.pathname.split('/').at(-1);
   try{
    await db.exec('begin; set local role service_role;');
    let result:any;
    if(fn==='talent_capture_catalog')result=await db.query('select public.talent_capture_catalog($1) as result',[body.p_hash]);
    else if(fn==='talent_session_profile')result=await db.query('select public.talent_session_profile($1::uuid) as result',[body.p_auth]);
    else if(fn==='talent_runtime_snapshot')result=await db.query('select public.talent_runtime_snapshot($1::uuid,$2) as result',[body.p_actor,body.p_public_hash]);
    else if(fn==='talent_runtime_commit'){if(failNextCaptureCommit){failNextCaptureCommit=false;throw new Error('SIMULATED_COMMIT_FAILURE');}result=await db.query('select public.talent_runtime_commit($1::uuid,$2,$3,$4,$5::jsonb,$6::text[]) as result',[body.p_actor,body.p_public_hash,body.p_company,body.p_revision,JSON.stringify(body.p_rows),body.p_resets||[]]);}
    else if(fn?.startsWith('talent_offer_')||fn?.startsWith('talent_org_')||fn?.startsWith('talent_survey_')||fn?.startsWith('talent_unlock_')){const keys=Object.keys(body);result=await db.query('select public.'+fn+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') as result',keys.map(k=>['p_rows','p_grants'].includes(k)?JSON.stringify(body[k]):Array.isArray(body[k])?'{'+body[k].join(',')+'}':body[k]&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]));}
    else throw new Error('UNKNOWN_RPC '+fn);
    await db.exec('commit');return fn==='talent_runtime_commit'?new Response(null,{status:204}):Response.json(result.rows[0].result??null);
   }catch(e:any){await db.exec('rollback');console.log('SQL ERROR',e.code,e.message);return Response.json({code:e.code,message:e.message},{status:e.code==='PT409'?409:400});}
  }));
 },30000);
 afterAll(async()=>{vi.unstubAllGlobals();await db?.close()});
 it('bootstrap lee datos reales de tenant sin usuarios ajenos',async()=>{const r=await call('/api/bootstrap');expect(r.status).toBe(200);expect(r.data.users).toHaveLength(2);expect(r.data.candidates).toEqual([])});
 it('crea y edita convocatoria con responsables y CAS',async()=>{
  const r=await call('/api/campaigns','POST',{code:'CI-CALL',title:'CI ventas',company:'CI',area:'Ventas',vacancies:2,status:'EN_PROCESO',responsibles:[{userId:admin,target:2}],sources:[],processType:'EXTERNO',managementType:'PRESENCIAL',location:'Lima',shift:'09:00-16:00'});
  expect(r.status).toBe(201);campaignId=r.data.id;
  expect((await call('/api/campaigns/'+campaignId,'PATCH',{title:'CI editado'})).status).toBe(200);
  expect((await call('/api/bootstrap')).data.campaigns[0].title).toBe('CI editado');
  expect((await call('/api/campaigns/'+campaignId,'PATCH',{code:'CI-CALL',company:'CI',client:'CI',title:'CI editado',area:'Operaciones Contact Center',serviceType:'VENTAS_OUTBOUND',salaryBase:1200,variableBonus:100,adminBonus:0,mobilityBonus:0,additionalConditions:'Editado',requestDate:'2026-10-12',processType:'EXTERNO',managementType:'PRESENCIAL',vacancies:2,location:'Lima',shift:'09:00-16:00',observations:'',status:'EN_PROCESO',assignedAnalystId:admin,assignedAnalystName:'CI Admin',requirements:['CI requisito']})).status).toBe(200);
 });
 it('edición inválida conserva convocatoria y explica cuotas, fechas e importes',async()=>{
  for(const [body,code] of [[{vacancies:1},'TARGET_EXCEEDS_VACANCIES'],[{vacancies:1.5},'INVALID_CAMPAIGN_AMOUNT'],[{salaryBase:-1},'INVALID_CAMPAIGN_AMOUNT'],[{startDate:'2026-10-12',endDate:'2026-10-11'},'INVALID_CAMPAIGN_DATES'],[{requestDate:'2026-02-30'},'INVALID_CAMPAIGN_DATES']] as const){
   const r=await call('/api/campaigns/'+campaignId,'PATCH',body);expect(r.status).toBe(400);expect(r.data.message).toBe(code);
  }
  const c=(await call('/api/bootstrap')).data.campaigns[0];expect(c.vacancies).toBe(2);expect(c.salaryBase).toBe(1200);
  expect((await call('/api/campaigns/'+campaignId,'PATCH',{salaryBase:0,observations:'Corrección administrativa'})).status).toBe(200);
  const edited=(await call('/api/bootstrap')).data.campaigns[0];expect(edited.salaryBase).toBe(0);expect(edited.title).toBe('CI editado');expect(edited.responsibles).toHaveLength(1);
 });
 it('crea candidato, datos personales y resultados de selección',async()=>{
  const r=await call('/api/candidates','POST',{dni:'99900001',fullName:'CI Persona',age:28,campaignId,recruiterId:admin,campaignName:'CI editado',phone:'999000001',source:'Otro',workModality:'Remoto',workSchedule:'Semifull',applicationDate:new Date().toISOString().slice(0,10)});
  expect(r.status).toBe(201);personId=r.data.id;
  expect((await call('/api/bootstrap')).data.candidates[0]).toMatchObject({age:28,workModality:'Remoto',workSchedule:'Semifull'});
  for(const age of [0,121,25.5,'25']){
   const invalid=await call('/api/candidates','POST',{dni:'99900999',fullName:'Edad inválida',age,campaignId,recruiterId:admin});
   expect(invalid.status).toBe(400);expect(invalid.data.message).toBe('INVALID_CANDIDATE_AGE');
  }
  expect((await call('/api/candidates/'+personId+'/personal-data','PATCH',{fullName:'CI Persona editada',phone:'999000002',workModality:'Presencial',workSchedule:'Fulltime'})).status).toBe(200);
  expect((await call('/api/candidates/'+personId+'/personal-data','PATCH',{workSchedule:'INVALIDO'})).status).toBe(400);
  expect((await call('/api/bootstrap')).data.candidates[0]).toMatchObject({workModality:'Presencial',workSchedule:'Fulltime'});
  const r2=await call('/api/candidates/'+personId+'/selection-record','PATCH',{kind:'INTERVIEW',value:{status:'APTO',notes:'CI',date:new Date().toISOString().slice(0,10)}});
  expect(r2.status).toBe(200);
  const data=(await call('/api/bootstrap')).data.candidates[0];expect(data.fullName).toBe('CI Persona editada');expect(data.selection.interviewResult.status).toBe('APTO');
 });
 it('conflicto no sobrescribe datos: snapshots simultáneos',async()=>{
  const a=await new RelationalRuntime(env,admin).load(),b=await new RelationalRuntime(env,admin).load();
  await a.write('campaigns/'+campaignId,{title:'Ganador'});await b.write('campaigns/'+campaignId,{title:'Perdedor'});
  await a.commit();await expect(b.commit()).rejects.toMatchObject({status:409});
  expect((await call('/api/bootstrap')).data.campaigns[0].title).toBe('Ganador');
 });
 it('otro tenant no puede consultar ni modificar candidato',async()=>{
  const r=await call('/api/bootstrap','GET',undefined,other);expect(r.status).toBe(200);expect(r.data.candidates).toEqual([]);expect(r.data.campaigns).toEqual([]);
  expect((await call('/api/candidates/'+personId+'/personal-data','PATCH',{fullName:'Intruso'},other)).status).not.toBe(200);
 });
 it('configuración se guarda y vuelve a leer de SQL',async()=>{
  const config={companyName:'CI',minPassGrade:80,minAttendancePct:85,slaSelectionDays:5,ojtDurationDays:5};
  expect((await call('/api/settings','PATCH',config)).status).toBe(200);
  expect((await call('/api/settings')).data).toMatchObject(config);
 });
 it('pipeline completo crea grupo y asigna formador sin guardados parciales',async()=>{
  expect((await call('/api/candidates/'+personId+'/selection-record','PATCH',{kind:'TECHNICAL',value:{status:'APRUEBA',notes:'CI',date:new Date().toISOString().slice(0,10)}})).status).toBe(200);
  expect((await call('/api/candidates/'+personId+'/evaluations','POST',{title:'CI evaluación',score:100,maxScore:100,result:'APTO',passed:true,date:new Date().toISOString().slice(0,10),comments:'CI'})).status).toBe(201);
  for(const stage of ['CONTACTADO','ENTREVISTA','VERIFICACION_TECNICA','EVALUACIONES','APTO_CAPACITACION'])expect((await call('/api/candidates/'+personId+'/stage','POST',{stage})).status).toBe(200);
  const date=new Date().toISOString().slice(0,10);
  const r=await call('/api/trainings/from-selection','POST',{campaignId,candidateIds:[personId],name:'CI Grupo',code:'CI-GROUP',startDate:date,endDate:date,totalDays:5,modality:'PRESENCIAL',schedule:'09:00-16:00'});expect(r.status).toBe(201);groupId=r.data.id;
  const duplicate=await call('/api/trainings/from-selection','POST',{campaignId,candidateIds:[personId],name:'CI Grupo duplicado',code:'CI-GROUP-2',startDate:date,totalDays:5,modality:'PRESENCIAL',schedule:'09:00-16:00'});
  expect(duplicate).toMatchObject({status:409,data:{message:'CANDIDATE_ALREADY_IN_TRAINING'}});
  expect((await db.query('select count(*)::integer as n from talent.training_groups')).rows[0].n).toBe(1);
  expect((await call('/api/trainings/'+groupId+'/trainer','POST',{trainerId:trainer,notes:'CI'})).status).toBe(200);
  const bootstrap=await call('/api/bootstrap','GET',undefined,trainer);expect(bootstrap.status).toBe(200);expect(bootstrap.data.cohorts).toHaveLength(1);expect(bootstrap.data.candidates).toHaveLength(1);
  const denied=await call('/api/trainings/'+groupId+'/trainer','POST',{trainerId:other},other);expect(denied.status).not.toBe(200);
  // El inicio grupal funciona sin ninguna definición de evaluación.
  expect(bootstrap.data.cohorts[0].evaluationsConfig).toHaveLength(0);
  expect((await call('/api/trainings/'+groupId+'/theory/start','POST',{},trainer)).data).toMatchObject({status:'EN_CAPACITACION',count:1});
  expect((await call('/api/trainings/'+groupId+'/theory/finish','POST',{grades:[{candidateId:personId,score:17}]},trainer)).data.message).toBe('OFFER_SIGNATURES_PENDING');
  await signGroup(groupId);
  expect((await call('/api/trainings/'+groupId+'/theory/finish','POST',{grades:[{candidateId:'uc.other.'+personId,score:17}]},trainer)).status).toBe(403);
  expect((await call('/api/trainings/'+groupId+'/theory/finish','POST',{grades:[{candidateId:'uc.tenant.'+personId,score:17}]},trainer)).data.status).toBe('PENDIENTE_OJT');
  // Restablecer únicamente el fixture para probar también las rutas heredadas.
  await db.query("update talent.training_groups set status='PROGRAMADA' where id=$1",[groupId]);
  await db.query("update talent.participants set status='PENDIENTE_INICIO',training_approved=false,annotations=annotations-'finalGrade'-'theoryCompletedAt' where group_id=$1",[groupId]);
 });
 it('formación: estado, evaluación, OJT y resultado persisten en relaciones',async()=>{
  const base='/api/trainings/'+groupId+'/participants/'+personId;
  expect((await call(base+'/ojt/result','POST',{status:'OJT_APROBADO'},trainer)).status).not.toBe(201);
  expect((await call(base+'/ojt/daily','POST',{date:'2026-11-03',hoursManaged:4,sales:8},trainer)).status).not.toBe(201);
  expect((await call(base+'/status','POST',{status:'EN_CAPACITACION'},trainer)).status).not.toBe(201);
  expect((await call('/api/trainings/'+groupId+'/management','PATCH',{operation:'STATUS',status:'EN_CAPACITACION'},trainer)).status).toBe(403);
  await db.query("update talent.training_groups set trainer_id=$1 where id=$2",[admin,groupId]);
  try {
   expect((await call('/api/trainings/'+groupId+'/management','PATCH',{operation:'EVALUATION_CONFIG',config:{name:'Grupo ajeno',maxScore:20,minScore:16}},trainer)).status).toBe(403);
  } finally { await db.query("update talent.training_groups set trainer_id=$1 where id=$2",[trainer,groupId]); }
  await db.query("update talent.training_groups set status='CANCELADA' where id=$1",[groupId]);
  try {
   expect((await call('/api/trainings/'+groupId+'/management','PATCH',{operation:'EVALUATION_CONFIG',config:{name:'Grupo cerrado',maxScore:20,minScore:16}},trainer)).status).toBe(400);
  } finally { await db.query("update talent.training_groups set status='PROGRAMADA' where id=$1",[groupId]); }
  for(const name of ['CI módulo','CI segundo módulo'])
    expect((await call('/api/trainings/'+groupId+'/management','PATCH',{operation:'EVALUATION_CONFIG',config:{name,maxScore:100,minScore:80}},trainer)).status).toBe(200);
  const configs=(await call('/api/bootstrap')).data.cohorts.find((g:any)=>g.id===groupId).evaluationsConfig;
  const evalId=configs[0].id;
  expect((await call('/api/trainings/'+groupId+'/management','PATCH',{operation:'STATUS',status:'EN_CAPACITACION'})).status).toBe(200);
  expect((await call('/api/trainings/'+groupId+'/participants/'+personId+'/status','POST',{status:'EN_CAPACITACION'},trainer)).status).toBe(201);
  expect((await call(base+'/evaluations','POST',{evaluationId:'inventada',name:'Falsa',score:0,maxScore:20,minRequired:0,result:'APROBADO'},trainer)).status).toBe(400);
  const evaluated=await call('/api/trainings/'+groupId+'/participants/'+personId+'/evaluations','POST',{evaluationId:evalId,name:'CI módulo',moduleName:'CI módulo',score:95,maxScore:100,minRequired:80,result:'APROBADO',date:new Date().toISOString().slice(0,10)},trainer);expect(evaluated.status).toBe(201);
  expect((await call(base+'/ojt/start','POST',{},trainer)).status).not.toBe(201);
  // Server ignores forged result/thresholds; configured minimum still controls approval.
  expect((await call(base+'/evaluations','POST',{evaluationId:configs[1].id,score:90,maxScore:1,minRequired:0,result:'NO_APROBADO',definitionSnapshot:{id:'fake',maxScore:1}},trainer)).status).toBe(201);
  const grades=(await call('/api/bootstrap')).data.candidates.find((p:any)=>p.id===personId).training.evaluations;
  expect(grades.find((e:any)=>e.evaluationId===configs[1].id)).toMatchObject({score:90,maxScore:100,minRequired:80,result:'APROBADO'});
  expect((await call('/api/trainings/'+groupId+'/theory/finish','POST',{grades:[{candidateId:personId,score:18}]},trainer)).status).toBe(200);
  expect((await call('/api/trainings/'+groupId+'/participants/'+personId+'/ojt/start','POST',{reason:'CI'},trainer)).status).toBe(201);
  expect((await call('/api/trainings/'+groupId+'/participants/'+personId+'/ojt/daily','POST',{date:new Date().toISOString().slice(0,10),hoursManaged:4,sales:8,attendance:'PRESENTE',ahtSeconds:240,qaScore:90},trainer)).status).toBe(201);
  expect((await call('/api/trainings/'+groupId+'/participants/'+personId+'/ojt/result','POST',{status:'OJT_APROBADO'},trainer)).status).toBe(201);
  const candidate=(await call('/api/bootstrap')).data.candidates[0];expect(candidate.ojt.status).toBe('OJT_APROBADO');expect(candidate.ojt.dailyMetrics[0]).toMatchObject({sph:2,ahtSeconds:240,qaScore:90});expect(candidate.training.evaluations.some((e:any)=>e.score===95)).toBe(true);
  const pending=await call('/api/candidates/'+personId+'/alta','POST',{},trainer);expect(pending.status).toBe(409);
 });
 it('asistencia masiva es atómica y la ventana utiliza hora de servidor',async()=>{
  const day='2026-10-26';
  expect((await call('/api/trainings/'+groupId+'/management','PATCH',{operation:'DETAILS',schedule:'08:00 - 16:00'})).status).toBe(200);
  const url='/api/trainings/'+groupId+'/attendance-window?date='+day;
  vi.useFakeTimers({toFake:['Date']});
  try {
   vi.setSystemTime(new Date('2026-10-26T13:59:59Z'));
   const before=await call(url,'GET',undefined,trainer);
   expect(before.data).toMatchObject({state:'UPCOMING',startAt:'2026-10-26T14:00:00.000Z',closesAt:'2026-10-26T15:00:00.000Z'});
   vi.setSystemTime(new Date('2026-10-26T14:00:00Z'));
   expect((await call(url,'GET',undefined,trainer)).data.state).toBe('OPEN');
   vi.setSystemTime(new Date('2026-10-26T15:00:00Z'));
   expect((await call(url,'GET',undefined,trainer)).data.state).toBe('OPEN');
   vi.setSystemTime(new Date('2026-10-26T15:00:01Z'));
   expect((await call(url,'GET',undefined,trainer)).data.state).toBe('LOCKED');
  } finally { vi.useRealTimers(); }
  // Un día anterior permite probar la escritura SQL sin depender de la hora real del CI.
  const pastDay=new Date(Date.now()-5*3600000-86400000).toISOString().slice(0,10);
  const unlockPath='/api/trainings/'+groupId+'/attendance-unlocks/'+pastDay;
  expect((await call(unlockPath,'POST',{reason:'Prueba de marcación fuera de horario'},trainer)).status).toBe(201);
  const unlock=(await db.query('select id,version from talent.attendance_unlocks where group_id=$1 and day_date=$2',[groupId,pastDay])).rows[0];
  await db.query('select public.talent_unlock_decide($1::uuid,$2,$3,$4,$5,$6,$7::timestamptz)',[admin,'tenant',unlock.id,unlock.version,true,'Prueba controlada',new Date(Date.now()+3600000).toISOString()]);
  const body={candidateIds:[personId,'missing'],date:pastDay,dayNumber:1,status:'PRESENTE',attendance:'PRESENTE'};
  const failed=await call('/api/trainings/'+groupId+'/attendance/bulk','POST',body,trainer);expect(failed.status).not.toBe(201);
  expect((await db.query('select count(*)::integer as n from talent.attendance')).rows[0].n).toBe(0);
  expect((await call('/api/trainings/'+groupId+'/attendance/bulk','POST',{...body,candidateIds:[personId]},trainer)).status).toBe(201);
  expect((await call('/api/bootstrap','GET',undefined,trainer)).data.candidates[0].training.attendance[0].status).toBe('PRESENTE');
 });
 it('documentos R2, validación, cuenta sueldo y pase a alta usan fuentes reales',async()=>{
  for(const type of ['DNI','CV','CUL_ANTECEDENTES','RECIBO_SERVICIOS']){
   const form=new FormData();form.append('file',new File(['CI fixture'],type+'.pdf',{type:'application/pdf'}));form.append('name',type);form.append('type',type);form.append('isMandatory','true');
   const uploaded=await call('/api/candidates/'+personId+'/documents','POST',form);expect(uploaded.status).toBe(201);
   expect((await call('/api/candidates/'+personId+'/documents/'+uploaded.data.id,'PATCH',{status:'VALIDATED'})).status).toBe(200);
  }
  expect(objects.size).toBe(4);
  expect((await call('/api/candidates/'+personId+'/salary-account','POST',{option:'HAS_ACCOUNT',hasAccount:true,bank:'BCP',accountNumber:'123456789',currency:'PEN'})).status).toBe(200);
  const eligible=await call('/api/candidates/'+personId+'/eligibility');expect(eligible.data.eligible).toBe(true);
  expect((await call('/api/candidates/'+personId+'/alta','POST',{},trainer)).status).toBe(200);
  expect((await call('/api/bootstrap')).data.candidates[0].currentStage).toBe('GESTION_TALENTO');
 });
 it('Talento: datos laborales, estados, registro contractual y firma declarada',async()=>{
  const labor={company:'CI',position:'CI cargo',campaignOrArea:'CI',plannedStartDate:new Date().toISOString().slice(0,10),modality:'PRESENCIAL',site:'CI',remuneration:1500};
  expect((await call('/api/talent/candidates/'+personId+'/labor-data','PATCH',labor)).status).toBe(200);
  expect((await call('/api/talent/candidates/'+personId+'/contract','POST',{})).status).toBe(201);
  expect((await call('/api/talent/candidates/'+personId+'/status','POST',{status:'PENDIENTE_FIRMA',reason:'CI'})).status).toBe(200);
  expect((await call('/api/talent/candidates/'+personId+'/contract/sign','POST',{signatureType:'FIRMADO_FISICO',reason:'CI'})).status).toBe(200);
  expect((await call('/api/bootstrap')).data.candidates[0].hiring.status).toBe('CONTRATADO');
 });
 it('usuarios creados en Auth + perfil obligatorio y bloqueo de primer acceso',async()=>{
  const r=await call('/api/users','POST',{username:'ci.newuser',password:'temporary123',displayName:'CI nuevo',dni:'71000001',role:'RECLUTADOR',status:'ACTIVO',module:['SELECCION']});expect(r.status).toBe(200);
  const users=(await call('/api/bootstrap')).data.users;const user=users.find((u:any)=>u.email==='ci.newuser');expect(user).toBeTruthy();
  expect(user.dni).toBe('71000001');
  expect((await call('/api/bootstrap','GET',undefined,user.id)).status).toBe(403);
 });
 it('reset reconcilia Auth con estado activo y conserva bloqueo de inactivos',async()=>{
  const user=Array.from(authUsers.values()).find((u:any)=>u.email==='ci.newuser@auth.talentcc.invalid')!;
  user.ban_duration='876000h';
  expect((await call('/api/users/'+user.id+'/reset-password','POST',{newPassword:'CI-password-reset-2026'})).status).toBe(200);
  expect(authUsers.get(user.id).ban_duration).toBe('none');
  await db.query("update talent.profiles set status='INACTIVO',enabled=false where id=$1",[user.id]);
  expect((await call('/api/users/'+user.id+'/reset-password','POST',{newPassword:'CI-password-reset-2027'})).status).toBe(200);
  expect(authUsers.get(user.id).ban_duration).toBe('876000h');
 });
 it('captación pública crea persona y evento atómicos, conserva origen y reintentos',async()=>{
  env.TURNSTILE_SECRET_KEY='test-only-secret';
  const link=await call('/api/capture/links','POST',{source:'Facebook'});expect(link.status).toBe(201);
  const publicRequest=async(body?:any)=>{const r=await worker.fetch(new Request('https://worker.test/api/public/capture/'+link.data.id,{method:body?'POST':'GET',headers:{Origin:'http://localhost:3000','Content-Type':'application/json','cf-connecting-ip':'192.0.2.1'},...(body?{body:JSON.stringify(body)}:{})}),env);const result:any=await r.json();if(!r.ok)console.log('PUBLIC ERROR',r.status,result);return {status:r.status,data:result};};
  const info=await publicRequest();expect(info.status).toBe(200);expect(info.data.ownerUid).toBeUndefined();expect(info.data.source).toBeUndefined();
  expect(info.data.formId).toBe('company-capture-v1');
  expect(info.data.companyName).toBe('CI');
  expect(info.data.campaigns).toEqual([{id:campaignId,name:'Ganador',configuration:null,form:null,formRevision:null}]);
  await db.exec(`insert into talent_org.global_admins(id,auth_user_id) values('ci-global','${admin}')`);
  env.ORG_ENABLED='true';
  try {
   const saved=await call('/api/org/capture-settings','POST',{companyId:'tenant',id:campaignId,version:null,configuration:captureConfiguration});
   expect(saved.status).toBe(200);expect(saved.data.version).toBe(1);
   expect((await call('/api/org/capture-settings','POST',{companyId:'tenant',id:campaignId,version:null,configuration:captureConfiguration})).status).toBe(409);
   expect((await call('/api/org/capture-settings','GET',undefined,trainer)).status).toBe(403);
   expect((await call('/api/org/capture-settings','POST',{companyId:'other',id:campaignId,configuration:captureConfiguration})).status).toBe(403);
   expect((await call('/api/org/capture-settings','POST',{companyId:'tenant',id:campaignId,version:1,configuration:{...captureConfiguration,workdays:['Inventado']}})).status).toBe(400);
   expect((await call('/api/org/capture-settings')).data.find((c:any)=>c.companyId==='tenant'&&c.id===campaignId)).toMatchObject({configuration:captureConfiguration,version:1});
   const audit=(await db.query("select actor_auth_id from talent_org.audit_events where table_name='capture_settings' and entity_id=$1",[campaignId])).rows;
   expect(audit).toEqual([{actor_auth_id:admin}]);
  } finally {env.ORG_ENABLED=undefined;}
  const applicant={...registrationAnswers,preferredCampaign:campaignId,requestId:crypto.randomUUID(),fullName:'CI Captado',phone:'912345678',email:'fixture@example.test',documentType:'DNI',documentNumber:'99900003',district:'Lima',turnstileToken:'test-token'};
  expect((await publicRequest(applicant)).status).toBe(201);expect((await publicRequest(applicant)).status).toBe(201);
  const manager=await call('/api/capture/management');expect(manager.status).toBe(200);expect(manager.data.events).toHaveLength(1);expect(manager.data.events[0].applicant.fullName).toBe('CI Captado');
  const exported=await call('/api/capture/export');expect(exported.status).toBe(200);expect(exported.data.total).toBe(1);expect(exported.data.items[0].applicant.techCenterAnswers).toMatchObject({workday:'Full time',availability:'Turno tarde'});
  env.ORG_ENABLED='true';
  try{
   const unified=await call('/api/capture/export?unified=1');expect(unified.status).toBe(200);
   expect(unified.data.items.find((event:any)=>event.id===manager.data.events[0].id)?.candidateId).toBe('uc.tenant.'+manager.data.events[0].candidateId);
  }finally{env.ORG_ENABLED=undefined;}
  const dossier=await call('/api/capture/candidates/'+manager.data.events[0].candidateId);
  expect(dossier.status).toBe(200);
  expect(dossier.data.events[0].applicant.techCenterAnswers).toMatchObject({contactCenterExperience:'No',workday:'Full time',availability:'Turno tarde',modality:'Presencial'});
  await db.exec(`update talent.profiles set role='JEFE_SELECCION' where id='${trainer}'; insert into talent.user_modules(company_id,id,user_id,module) values ('tenant','ci-selection-chief','${trainer}','SELECCION');`);
  try {
   expect((await call('/api/capture/candidates/'+manager.data.events[0].candidateId,'GET',undefined,trainer)).status).toBe(200);
   expect((await call('/api/capture/links','GET',undefined,trainer)).status).toBe(403);
  } finally {
   await db.exec(`update talent.profiles set role='FORMADOR' where id='${trainer}';`);
  }
 });
 it('plantilla y vinculación de captura conservan versión y preguntas',async()=>{
  const stages=['NUEVO','CONTACTADO','ENTREVISTA','VERIFICACION_TECNICA','EVALUACIONES','APTO_CAPACITACION'].map(stage=>({stage,requirements:''}));
  const config={name:'CI Proceso',stages,responsibleIds:[admin],interviewFields:['Disponibilidad'],evaluations:[{id:'knowledge',name:'CI conocimientos',stage:'EVALUACIONES',minScore:10,questions:[{id:'q1',label:'CI pregunta',type:'CLOSED',points:10,options:['Sí','No'],correctIndex:0}]}],rules:{}};
  const template=await call('/api/selection/campaigns/'+campaignId,'POST',config);
  expect(template.status).toBe(201);
  const list=await call('/api/selection/campaigns/'+campaignId);expect(list.data.templates[0].interviewFields).toEqual(['Disponibilidad']);expect(list.data.templates[0].evaluations[0].questions[0].correctIndex).toBe(0);
  const event=(await call('/api/capture/management')).data.events[0];
  const linked=await call('/api/selection/link','POST',{eventId:event.id,campaignId,templateId:template.data.id});expect(linked.status).toBe(201);
  const history=await call('/api/selection/candidates/'+event.candidateId);expect(history.data.applications).toHaveLength(1);
 });
 it('configuración de captación: actualización versionada, validación SQL y acceso solo desde servidor',async()=>{
  env.ORG_ENABLED='true';
  try {
   const configuration={...captureConfiguration,maxAge:65,workdays:['Part time'],modality:'Remota'};
   const saved=await call('/api/org/capture-settings','POST',{companyId:'tenant',id:campaignId,version:1,configuration});
   expect(saved.status).toBe(200);expect(saved.data.version).toBe(2);
   expect((await call('/api/org/capture-settings','POST',{companyId:'tenant',id:campaignId,version:1,configuration})).status).toBe(409);
   const hash=(await db.query("select token_hash from talent.capture_links where company_id='tenant' limit 1")).rows[0].token_hash;
   const catalog=(await db.query('select public.talent_capture_catalog($1) as data',[hash])).rows[0].data;
   expect(catalog.campaigns[0].configuration).toEqual(configuration);
   expect(catalog.campaigns[0]).not.toHaveProperty('version');
   for(const invalid of [{...configuration,modality:null},{...configuration,minAge:70,maxAge:60},{...configuration,schedules:['']},{...configuration,workdays:['Otro']},{...configuration,internalSecret:'not-public'}])
    await expect(db.query('select public.talent_org_capture_settings_save($1,$2,$3,$4,$5::jsonb)',[admin,'tenant',campaignId,2,JSON.stringify(invalid)])).rejects.toThrow();
   await expect(db.query('select public.talent_org_capture_settings($1)',[trainer])).rejects.toThrow();
   const permissions=(await db.query("select has_function_privilege('anon','public.talent_org_capture_settings(uuid)','EXECUTE') as anon, has_function_privilege('authenticated','public.talent_org_capture_settings_save(uuid,text,text,bigint,jsonb)','EXECUTE') as authenticated,has_table_privilege('service_role','talent_org.capture_settings','UPDATE') as direct_write")).rows[0];
   expect(permissions).toEqual({anon:false,authenticated:false,direct_write:false});
   // Existing application answers retain the originally submitted workday and modality.
   const event=(await call('/api/capture/management')).data.events[0];
   expect(event.applicant.techCenterAnswers).toMatchObject({workday:'Full time',modality:'Presencial'});
  } finally {env.ORG_ENABLED=undefined;}
 });
 it('runtime multiempresa: cambio de contexto, creación, aislamiento y revocación',async()=>{
  await db.exec(`insert into talent_org.global_admins(id,auth_user_id) values('ci-global','${admin}') on conflict do nothing`);
  for(const c of ['talent-up','techcenter'])await db.query('select public.talent_org_member_save($1,$1,$2,$3,true,true,$4,null)',[admin,c,'ADMIN','{}']);
  env.ORG_ENABLED='true';
  env.IDENTITY_HASH_SECRET='CI-isolated-only-identity-secret';
  try{
   const session=await call('/api/session','GET',undefined,admin,'talent-up');expect(session.status).toBe(200);expect(session.data.companyId).toBe('talent-up');
   const created=await call('/api/campaigns','POST',{code:'ORG-CALL',title:'CI multiempresa',vacancies:2,status:'EN_PROCESO',assignedAnalystId:admin,responsibles:[{userId:admin,target:2}],companyCampaignId:'talent-up:bitel-portabilidad'},admin,'talent-up');expect(created.status).toBe(201);
   expect((await call('/api/bootstrap','GET',undefined,admin,'talent-up')).data.campaigns).toHaveLength(1);
   expect((await call('/api/bootstrap','GET',undefined,admin,'techcenter')).data.campaigns).toHaveLength(0);
   expect((await call('/api/campaigns/'+created.data.id,'PATCH',{title:'Intrusión'},admin,'techcenter')).status).not.toBe(200);
   expect((await call('/api/bootstrap','GET',undefined,trainer,'talent-up')).status).toBe(403);
   const membership=await call('/api/org/memberships','POST',{companyId:'talent-up',userId:trainer,role:'FORMADOR',enabled:true,allCampaigns:false,scopes:['talent-up:bitel-portabilidad']},admin);expect(membership.status).toBe(200);
   expect((await call('/api/bootstrap','GET',undefined,trainer,'talent-up')).data.cohorts).toHaveLength(0);
   const edit=await call('/api/campaigns/'+created.data.id,'PATCH',{observations:'CI edición por empresa'},admin,'talent-up');expect(edit.status).toBe(200);
   const second=await call('/api/campaigns','POST',{code:'ORG-SECOND',title:'CI segunda empresa',vacancies:2,status:'EN_PROCESO',assignedAnalystId:admin,responsibles:[{userId:admin,target:2}],companyCampaignId:'techcenter:bitel-portabilidad'},admin,'techcenter');expect(second.status).toBe(201);
   for(const [company,campaignId]of [['talent-up',created.data.id],['techcenter',second.data.id]]){const candidate=await call('/api/candidates','POST',{dni:'98887776',fullName:'CI persona multiempresa',phone:'999000009',campaignId,recruiterId:admin,source:'Otro',applicationDate:'2026-10-12'},admin,company);expect(candidate.status).toBe(201);}
   const summary=await call('/api/org/summary','POST',{},admin);expect(summary.status).toBe(200);expect(summary.data.persons).toBe(1);expect(summary.data.applications).toBe(2);
   const rejected=await call('/api/org/memberships','POST',{companyId:'talent-up',userId:trainer,role:'ADMIN',enabled:true,allCampaigns:true,scopes:[]},trainer,'talent-up');expect(rejected.status).toBe(403);
   expect((await call('/api/org/memberships','POST',{companyId:'talent-up',userId:trainer,role:'FORMADOR',enabled:false,allCampaigns:false,scopes:[],version:membership.data.version},admin)).status).toBe(200);
   expect((await call('/api/bootstrap','GET',undefined,trainer,'talent-up')).status).toBe(403);
  }finally{env.ORG_ENABLED=undefined;}
 });
 it('activa el formulario predeterminado sin configuración específica de campaña',async()=>{
  env.ORG_ENABLED='true';
  try{
   const link=await call('/api/capture/links','POST',{source:'Facebook',companyCampaignId:'talent-up:bitel-migraciones'},admin,'talent-up');
   expect(link.status).toBe(201);
   const pub=async(input?:Record<string,unknown>)=>{
    const r=await worker.fetch(new Request('https://worker.test/api/public/capture/'+link.data.id,{method:input?'POST':'GET',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},...(input?{body:JSON.stringify(input)}:{})}),env);
    return {status:r.status,data:await r.json() as any};
   };
   const catalog=await pub();expect(catalog.status).toBe(200);
   const campaign=catalog.data.campaigns.find((c:any)=>c.id==='talent-up:bitel-migraciones');
   expect(campaign).toMatchObject({configuration:null,form:null});
   const applicant={documentType:'DNI',documentNumber:'98800123',age:'25',fullName:'Persona Predeterminada',contactCenterExperience:'No',reentry:'No',birthDate:'2001-01-01',district:'Lima, Comas',addressReference:'Lima',phone:'912345670',email:'default@example.test',education:'Secundaria completa',preferredCampaign:campaign.id,workday:'Full time',availability:'Turno mañana',contractType:'PLANILLA MICRO',workOrStudy:'No',modality:'Remota',privacyAcknowledged:true,requestId:crypto.randomUUID(),turnstileToken:'test-only-token'};
   expect((await pub(applicant)).status).toBe(201);
   const event=(await call('/api/capture/management','GET',undefined,admin,'talent-up')).data.events.find((e:any)=>e.applicant.documentNumber===applicant.documentNumber);
   expect(event.applicant.formSubmission).toMatchObject({revision:0,title:'Formulario de registro de postulantes'});
   expect(event.applicant.techCenterAnswers).toMatchObject({preferredCampaign:'Migraciones Bitel',modality:'Remota'});
   expect((await call('/api/bootstrap','GET',undefined,admin,'talent-up')).data.candidates.find((c:any)=>c.id===event.candidateId)).toMatchObject({captureOnly:true,campaignId:''});
  }finally{env.ORG_ENABLED=undefined;}
 });
 it('TECH CENTER: formulario por empresa, guardado real y lectura de respuestas sin consentimiento inventado',async()=>{
  env.ORG_ENABLED='true';
  try {
   const link=await call('/api/capture/links','POST',{source:'Facebook',companyCampaignId:'techcenter:bitel-portabilidad'},admin,'techcenter');
   expect(link.status).toBe(201);
   const pub=async(body?:any)=>{const r=await worker.fetch(new Request('https://worker.test/api/public/capture/'+link.data.id,{method:body?'POST':'GET',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,data:await r.json() as any}};
   expect((await call('/api/org/capture-settings','POST',{companyId:'techcenter',id:'techcenter:bitel-portabilidad',version:null,configuration:captureConfiguration})).status).toBe(200);
   const config=(await pub()).data;
   expect(config.formId).toBe('company-capture-v1');
   expect(config.companyName).toBe('Techcenter');
   expect(config.campaigns.every((c:any)=>c.id.startsWith('techcenter:'))).toBe(true);
   expect(config.campaigns.some((c:any)=>c.name==='Internet Win')).toBe(false);
   await db.exec('begin');
   try {
    await db.query("select set_config('talent.org_actor',$1,true)",[admin]);
    await db.exec("update talent_org.company_campaigns set status='INACTIVA' where id='techcenter:bitel-migraciones'");
    const hash=(await db.query('select token_hash from talent.capture_links where annotations->>\'publicToken\'=$1',[link.data.id])).rows[0].token_hash;
    const catalog=(await db.query('select public.talent_capture_catalog($1) as data',[hash])).rows[0].data;
    expect(catalog.campaigns.some((c:any)=>c.id==='techcenter:bitel-migraciones')).toBe(false);
    await db.exec("update talent_org.global_campaigns set status='INACTIVA' where id='movistar-portabilidad'");
    expect((await db.query('select public.talent_capture_catalog($1) as data',[hash])).rows[0].data.campaigns.some((c:any)=>c.id==='techcenter:movistar-portabilidad')).toBe(false);
   } finally {await db.exec('rollback');}
   const privileges=(await db.query("select has_function_privilege('anon','public.talent_capture_catalog(text)','EXECUTE') as anon, has_function_privilege('authenticated','public.talent_capture_catalog(text)','EXECUTE') as authenticated")).rows[0];
   expect(privileges).toEqual({anon:false,authenticated:false});
   expect((await pub({fullName:'Incomplete',formId:'capture-v1'})).status).toBe(400);
   const answers=Object.fromEntries(techCenterSections.flatMap(s=>s.fields).filter(f=>f.options).map(f=>[f.key,optionValue(f.options![0])]));
   const applicant={...answers,age:'25',reentry:'No',birthDate:'2001-01-01',addressReference:'Lima',contractType:'PLANILLA MICRO',workOrStudy:'No',availability:'Turno tarde',preferredCampaign:'techcenter:bitel-portabilidad',documentNumber:'99900999',fullName:'CI Techcenter',district:'Lima, Comas',phone:'912345679',email:'tech@example.test',experienceDetails:'Un año en ventas',disability:'Sí',disabilityDetails:'Acceso sin escaleras',sensitiveConsent:true,privacyAcknowledged:true,requestId:crypto.randomUUID(),turnstileToken:'test-only-token'};
   expect((await pub({...applicant,preferredCampaign:'talent-up:bitel-portabilidad',companyId:'talent-up',companyName:'Otra empresa'})).status).toBe(400);
   expect((await pub(applicant)).status).toBe(201);
   expect((await pub(applicant)).status).toBe(201);
   const events=(await call('/api/capture/management','GET',undefined,admin,'techcenter')).data.events;
   const event=events.find((e:any)=>e.applicant.documentNumber==='99900999');
   expect(event.applicant.techCenterAnswers).toMatchObject({preferredCampaign:'Portabilidad Bitel',preferredCampaignId:'techcenter:bitel-portabilidad',companyName:'Techcenter',experienceDetails:'Un año en ventas',age:'25',conadis:'Sí',disabilityDetails:'Acceso sin escaleras'});
   expect(event.applicant.techCenterAnswers.computer).toBeUndefined();
   expect(event.privacyAcknowledgement.version).toBe('company-capture-v1');
   expect(event.consent).toBeUndefined();
   expect(events.filter((e:any)=>e.applicant.documentNumber==='99900999')).toHaveLength(1);
   const pendingCandidate=(await call('/api/bootstrap','GET',undefined,admin,'techcenter')).data.candidates.find((c:any)=>c.id===event.candidateId);
   expect(pendingCandidate).toMatchObject({captureOnly:true,campaignId:'',dni:'99900999'});
   expect((await call('/api/capture/events/'+event.id,'PATCH',{status:'Contactado',note:'CI'},admin,'techcenter')).status).toBe(200);
   const dossier=(await call('/api/capture/candidates/'+event.candidateId,'GET',undefined,admin,'techcenter')).data;
   expect(dossier.events[0].applicant.techCenterAnswers.experienceDetails).toBe('Un año en ventas');
   expect((await call('/api/capture/candidates/'+event.candidateId,'GET',undefined,other)).status).not.toBe(200);
  } finally {env.ORG_ENABLED=undefined;}
 });
 it('formularios: borrador, publicación, captura con adjunto privado y rollback R2',async()=>{
  env.ORG_ENABLED='true';
  try{
   const form=defaultCaptureForm();form.title='Formulario CI publicado';
   form.questions.push({id:'customSkills',label:'Habilidades',section:'Adicional',type:'multiple',required:true,options:[{value:'ventas',label:'Ventas'},{value:'soporte',label:'Soporte'}]},{id:'cvFile',label:'CV',section:'Adicional',type:'file',required:true});
   const id='techcenter:bitel-portabilidad';
   const row=(await call('/api/capture/forms')).data.find((r:any)=>r.id===id);
   expect(row.draft).toBeNull();
   const bundle={configuration:captureConfiguration,form};
   const params={companyId:'techcenter',id,version:row.version,formVersion:null,bundle,publish:false};
   expect((await call('/api/capture/forms','GET',undefined,trainer)).status).toBe(403);
   expect((await call('/api/capture/forms','POST',params,trainer)).status).toBe(403);
   const draft=await call('/api/capture/forms','POST',params);expect(draft.status).toBe(200);expect(draft.data.published).toBeNull();
   expect((await call('/api/capture/forms','POST',params)).status).toBe(409);
   expect((await call('/api/capture/forms','POST',{...params,companyId:'talent-up',formVersion:1})).status).toBe(403);
   const link=(await call('/api/capture/links','GET',undefined,admin,'techcenter')).data.items[0];
   const pub=async(payload?:any,file?:File)=>{
    const data=payload?new FormData():undefined;if(data){data.set('payload',JSON.stringify(payload));if(file)data.set('file:cvFile',file);}
    return worker.fetch(new Request('https://worker.test/api/public/capture/'+link.id,{method:data?'POST':'GET',headers:{Origin:'http://localhost:3000','cf-connecting-ip':'192.0.2.55'},...(data?{body:data}:{})}),env);
   };
   expect((await(await pub()).json() as any).campaigns.find((c:any)=>c.id===id).form).toBeNull();
   const published=await call('/api/capture/forms','POST',{...params,formVersion:1,publish:true});expect(published.status).toBe(200);expect(published.data.publishedRevision).toBe(2);
   const catalog=await(await pub()).json() as any;expect(catalog.campaigns.find((c:any)=>c.id===id).form.title).toBe(form.title);
   expect(JSON.stringify(catalog)).not.toContain('draft');
   const payload={...registrationAnswers,preferredCampaign:id,formRevision:2,fullName:'CI Documento',documentType:'DNI',documentNumber:'98800111',phone:'912345672',email:'ci-file@example.test',district:'Lima',addressReference:'Lima Centro',reentry:'No',birthDate:'2000-01-01',contractType:'PLANILLA MICRO',workOrStudy:'No',customSkills:['ventas','soporte'],requestId:crypto.randomUUID(),turnstileToken:'test-token'};
   const file=new File(['%PDF-1.7 isolated fixture'],'cv.pdf',{type:'application/pdf'});
   expect((await pub(payload)).status).toBe(400);
   expect((await pub({...payload,formRevision:1},file)).status).toBe(409);
   expect((await pub({...payload,customSkills:['injected']},file)).status).toBe(400);
   expect((await pub(payload,new File(['bad'],'cv.pdf',{type:'application/pdf'}))).status).toBe(400);
   expect((await pub({...payload,pregnancy:'No'},file)).status).toBe(400);
   const before=objects.size;
   const consented={...payload,pregnancy:'No',sensitiveConsent:true};
   expect((await pub(consented,file)).status).toBe(201);expect(objects.size).toBe(before+1);
   expect((await pub(consented,file)).status).toBe(201);expect(objects.size).toBe(before+1);
   const event=(await call('/api/capture/management','GET',undefined,admin,'techcenter')).data.events.find((e:any)=>e.applicant.documentNumber==='98800111');
   expect(event.sensitiveDisclosureConsent.accepted).toBe(true);
   expect(event.applicant.formSubmission.answers.customSkills).toEqual(['soporte','ventas']);
   expect(event.applicant.formSubmission.attachments[0]).toMatchObject({id:'cvFile',name:'cv.pdf'});
   const download=await worker.fetch(new Request('https://worker.test/api/capture/attachments/'+event.id+'/cvFile',{headers:{Origin:'http://localhost:3000',Authorization:'Bearer '+admin,'X-Talent-Company':'techcenter'}}),env);
   expect(download.status).toBe(200);expect(download.headers.get('Content-Disposition')).toContain('attachment');expect(await download.text()).toContain('%PDF');
   expect((await call('/api/capture/attachments/'+event.id+'/cvFile','GET',undefined,other)).status).toBe(403);
   expect((await call('/api/capture/events/'+event.id,'PATCH',{status:'Contactado'},admin,'techcenter')).status).toBe(200);
   expect((await call('/api/capture/candidates/'+event.candidateId,'GET',undefined,admin,'techcenter')).data.events[0].applicant.formSubmission.title).toBe(form.title);
   const changed={...bundle,form:{...form,title:'Borrador no publicado'}};
   expect((await call('/api/capture/forms','POST',{...params,bundle:changed,formVersion:2,version:published.data.settingsVersion})).status).toBe(200);
   expect((await(await pub()).json() as any).campaigns.find((c:any)=>c.id===id).form.title).toBe(form.title);
   // Failed database transaction must remove the newly uploaded object, not the old file.
   failNextCaptureCommit=true;
   expect((await pub({...payload,documentNumber:'98800112',requestId:crypto.randomUUID()},file)).status).not.toBe(201);
   expect(objects.size).toBe(before+1);
   const audit=(await db.query("select count(*)::int as n from talent_org.audit_events where table_name='capture_forms' and entity_id=$1",[id])).rows[0].n;expect(audit).toBe(3);
  }finally{failNextCaptureCommit=false;env.ORG_ENABLED=undefined;}
 });
 it('reclutador y analista editan/publican solo formularios de campañas autorizadas',async()=>{
  env.ORG_ENABLED='true';
  try{
   const id='talent-up:bitel-portabilidad',companyId='talent-up';
   for(const role of ['RECLUTADOR','ANALISTA_SELECCION']){
    const uid=crypto.randomUUID();
    await db.query('insert into auth.users(id) values ($1)',[uid]);
    await db.query("insert into talent.profiles(company_id,id,auth_user_id,username,display_name,role,status) values ('tenant',$1::text,$1::uuid,$2,'CI form editor',$3,'ACTIVO')",[uid,'ci.editor.'+role.toLowerCase(),role]);
    authUsers.set(uid,{id:uid});
    await db.query('select public.talent_org_member_save($1,$2,$3,$4,true,false,$5,null)',[admin,uid,companyId,role,'{'+id+'}']);
    const rows=await call('/api/capture/forms','GET',undefined,uid,companyId);
    expect(rows.status).toBe(200);expect(rows.data.map((r:any)=>r.id)).toEqual([id]);
    const current=rows.data[0],bundle={form:defaultCaptureForm(),configuration:captureConfiguration};
    const params={companyId,id,bundle,publish:false,version:current.version,formVersion:current.formVersion};
    const saved=await call('/api/capture/forms','POST',params,uid,companyId);expect(saved.status).toBe(200);
    expect((await call('/api/capture/forms','POST',{...params,publish:true,formVersion:saved.data.formVersion},uid,companyId)).status).toBe(200);
    expect((await call('/api/capture/forms','POST',{...params,companyId:'techcenter',id:'techcenter:bitel-portabilidad'},uid,companyId)).status).toBe(403);
    expect((await call('/api/capture/forms','POST',{...params,id:'talent-up:bitel-migraciones'},uid,companyId)).status).toBe(403);
    expect((await call('/api/org/companies','POST',{id:'intrusion',name:'Intrusión'},uid,companyId)).status).toBe(403);
    await db.query("update talent.user_modules set archived_at=now() where company_id=$1 and user_id=$2 and module='SELECCION'",[companyId,uid]);
    expect((await call('/api/capture/forms','GET',undefined,uid,companyId)).status).toBe(403);
    await expect(db.query('select public.talent_org_capture_form_save($1,$2,$3,null,null,$4,false)',[uid,companyId,id,JSON.stringify(bundle)])).rejects.toThrow();
   }
  }finally{env.ORG_ENABLED=undefined;}
 });
 it('reclutador recibe solo convocatorias asignadas en su empresa',async()=>{
  env.ORG_ENABLED='true';
  try{
   const uid=crypto.randomUUID(),company='techcenter',catalog='techcenter:bitel-portabilidad';
   await db.query('insert into auth.users(id) values ($1)',[uid]);
   await db.query("insert into talent.profiles(company_id,id,auth_user_id,username,display_name,role,status) values ('tenant',$1::text,$1::uuid,$2,'CI recruiter scope','RECLUTADOR','ACTIVO')",[uid,'ci.recruiter.scope']);
   authUsers.set(uid,{id:uid});
   await db.query('select public.talent_org_member_save($1,$2,$3,$4,true,false,$5,null)',[admin,uid,company,'RECLUTADOR','{'+catalog+'}']);
   const payload={code:'CI-SCOPE-'+uid.slice(0,8),title:'CI scope test',vacancies:2,status:'EN_PROCESO',companyCampaignId:catalog};
   const assigned=await call('/api/campaigns','POST',payload,admin,company);
   const unrelated=await call('/api/campaigns','POST',{...payload,code:payload.code+'-OTHER'},admin,company);
   expect(assigned.status).toBe(201);expect(unrelated.status).toBe(201);
   expect((await call('/api/campaigns/'+assigned.data.id+'/responsibles','POST',{responsibles:[{userId:uid,target:1}]},admin,company)).status).toBe(200);
   const scoped=await call('/api/bootstrap','GET',undefined,uid,company);
   expect(scoped.status).toBe(200);
   expect(scoped.data.campaigns.map((item:any)=>item.id)).toEqual([assigned.data.id]);
   const unified=await call('/api/bootstrap?unified=1','GET',undefined,uid);
   expect(unified.status).toBe(200);
   expect(unified.data.campaigns.map((item:any)=>item.id)).toEqual([assigned.data.id]);
   const link=await call('/api/capture/links','POST',{source:'Facebook',companyCampaignId:catalog},uid,company);
   expect(link.status).toBe(201);
   expect((await call('/api/capture/links/'+link.data.id,'DELETE',undefined,uid,'tenant')).status).not.toBe(200);
   expect((await call('/api/capture/links/'+link.data.id,'PATCH',{active:false},uid,company)).status).toBe(200);
   expect((await call('/api/capture/links/'+link.data.id,'DELETE',undefined,uid,company)).status).toBe(200);
   expect((await call('/api/capture/links','GET',undefined,uid,company)).data.items.find((item:any)=>item.id===link.data.id)).toBeUndefined();
   expect((await db.query('select active,archived_at from talent.capture_links where company_id=$1 and id=$2',[company,link.data.id])).rows[0]).toMatchObject({active:false,archived_at:expect.any(Date)});
  }finally{env.ORG_ENABLED=undefined;}
 });
 it('repara administrador multiempresa: Talent-On, creación, edición y permisos sin elevar otros roles',async()=>{
  env.ORG_ENABLED='true';
  try{
   const uid=crypto.randomUUID(),username='ci.admin.repair';
   await db.query('insert into auth.users(id) values ($1)',[uid]);
   await db.query("insert into talent.profiles(company_id,id,auth_user_id,username,display_name,role,status,annotations) values ('tenant',$1::text,$1::uuid,$2,'CI Admin repair','ADMIN','ACTIVO','{\"companyAccessManaged\":true}')",[uid,username]);
   authUsers.set(uid,{id:uid});
   for(const company of ['talent-up','techcenter','konectados'])await db.query("select public.talent_org_member_save($1,$2,$3,'ADMIN',true,true,'{}',null)",[admin,uid,company]);
   await db.query("insert into talent.user_modules(company_id,id,user_id,module) select 'tenant',$1||':'||code,$1,code from talent.modules",[uid]);
   const before=await call('/api/session','GET',undefined,uid);expect(before.status).toBe(200);expect(before.data.globalAdmin).toBe(false);expect(before.data.companies).toHaveLength(3);
   expect((await call('/api/session','GET',undefined,uid,'tenant')).status).toBe(403);
   const grants=['talent-up','techcenter'].map(companyId=>({companyId,role:'RECLUTADOR',enabled:true,allCampaigns:false,scopes:[companyId+':bitel-portabilidad'],version:null}));
   const payload={username:'ci.repair.created',password:'CI-password-2026',displayName:'CI created by repaired admin',dni:'71000002',role:'RECLUTADOR',module:['SELECCION'],companyAccess:grants};
   expect((await call('/api/users','POST',payload,uid,'techcenter')).status).toBe(403);
   const grantSql=readFileSync(resolve('../scripts/sql/grant-global-admin.sql'),'utf8');
   await db.query(grantSql,[trainer,username]);expect((await call('/api/session','GET',undefined,uid)).data.globalAdmin).toBe(false);
   await db.exec('begin');await db.query("select set_config('talent.org_actor',$1,true)",[admin]);await db.query(grantSql,[admin,username]);await db.exec('commit');
   const after=await call('/api/session','GET',undefined,uid,'tenant');expect(after.status).toBe(200);expect(after.data.globalAdmin).toBe(true);expect(after.data.companies).toHaveLength(4);expect(after.data.allowedModules).toContain('ADMINISTRACION');
   expect((await call('/api/org','GET',undefined,uid)).status).toBe(200);
   expect((await call('/api/org/dashboard','POST',{},uid,'tenant')).status).toBe(200);
   const created=await call('/api/users','POST',payload,uid,'tenant');expect(created.status).toBe(200);
   const user=(await call('/api/bootstrap','GET',undefined,uid,'tenant')).data.users.find((u:any)=>u.email===payload.username);expect(user).toBeTruthy();
   expect((await call('/api/users/'+user.id+'/access','PATCH',{displayName:'CI edited by repaired admin',role:'RECLUTADOR',status:'ACTIVO',module:['SELECCION']},uid,'techcenter')).status).toBe(200);
   const memberships=(await call('/api/org','GET',undefined,uid)).data.memberships.filter((m:any)=>m.auth_user_id===user.id);
   expect(memberships.filter((m:any)=>m.enabled).map((m:any)=>m.company_id).sort()).toEqual(['talent-up','techcenter']);
   const audit=(await db.query("select count(*)::int as n from talent_org.audit_events where table_name='global_admins' and entity_id=$1 and actor_auth_id=$2",['global:'+uid,admin])).rows[0].n;expect(audit).toBe(1);
   await db.query(grantSql,[admin,username]);
   expect((await db.query("select count(*)::int as n from talent_org.audit_events where table_name='global_admins' and entity_id=$1",['global:'+uid])).rows[0].n).toBe(1);
   expect((await call('/api/session','GET',undefined,trainer)).data.globalAdmin).toBe(false);
  }finally{env.ORG_ENABLED=undefined;}
 });
 it('gestión unificada: empresa por registro, lectura conjunta y permisos conservados',async()=>{
  env.ORG_ENABLED='true';
  try{
   const session=await call('/api/session?unified=1');expect(session.status).toBe(200);expect(session.data.unified).toBe(true);
   const payload={code:'CI-UNIFIED',title:'Unified',vacancies:2,status:'EN_PROCESO',responsibles:[{userId:admin,target:2}],sources:[],company:'CI',area:'Ventas'};
   expect((await call('/api/campaigns?unified=1','POST',payload)).status).toBe(400);
   const records=[];
   for(const companyId of ['talent-up','techcenter']){
    const created=await call('/api/campaigns?unified=1','POST',{...payload,companyId,companyCampaignId:companyId+':bitel-portabilidad'});expect(created.status).toBe(201);records.push(created.data);
    expect((await call('/api/campaigns/'+created.data.id+'?unified=1','PATCH',{title:'Unified edited'})).status).toBe(200);
    expect((await call('/api/campaigns/'+created.data.id+'?unified=1','PATCH',{companyId:'other',title:'Wrong'})).status).toBe(403);
   }
   const bootstrap=await call('/api/bootstrap?unified=1');expect(bootstrap.status).toBe(200);
   for(const record of records)expect(bootstrap.data.campaigns.find((c:any)=>c.id===record.id)).toMatchObject({title:'Unified edited',companyId:record.companyId});
   expect((await call('/api/campaigns/'+records[0].id+'?unified=1','PATCH',{title:'Forbidden'},trainer)).status).toBe(403);
   expect((await call('/api/campaigns?unified=1','POST',{...payload,companyId:'techcenter',companyCampaignId:'techcenter:bitel-portabilidad'},trainer)).status).toBe(403);
   const link=await call('/api/capture/links?unified=1','POST',{companyId:'techcenter',companyCampaignId:'techcenter:bitel-portabilidad',source:'Pauta pagada'});expect(link.status).toBe(201);
   expect((await call('/api/capture/links/'+link.data.id+'?unified=1','PATCH',{active:false})).status).toBe(200);
   expect((await call('/api/capture/links?unified=1')).data.items.find((v:any)=>v.id===link.data.id)).toMatchObject({companyId:'techcenter',source:'Pauta pagada',active:false});
   expect((await call('/api/capture/links/'+link.data.id+'?unified=1','DELETE')).status).toBe(200);
   expect((await call('/api/capture/links?unified=1')).data.items.find((v:any)=>v.id===link.data.id)).toBeUndefined();
   expect((await db.query('select active,archived_at from talent.capture_links where id=$1',[link.data.id])).rows[0]).toMatchObject({active:false,archived_at:expect.any(Date)});
   expect((await call('/api/public/capture/'+link.data.id)).status).not.toBe(200);
   expect((await call('/api/capture/links/'+link.data.id+'?unified=1','PATCH',{active:true})).status).not.toBe(200);
   const own=await call('/api/bootstrap?unified=1','GET',undefined,trainer);expect(own.status).toBe(200);expect(own.data.campaigns.every((c:any)=>c.companyId==='tenant')).toBe(true);
   const permission=(await db.query("select has_function_privilege('authenticated','public.talent_org_record_company(uuid,text,text,text)','EXECUTE') as allowed")).rows[0];expect(permission.allowed).toBe(false);
   // Identical historical person IDs in different companies must remain distinct in the UI.
   const people:string[]=[];
   for(const record of records){
    const created=await call('/api/candidates?unified=1','POST',{dni:'99980001',fullName:'CI separate identity',campaignId:record.id,recruiterId:admin,phone:'999800001',source:'Otro',applicationDate:'2026-10-16'});
    expect(created.status).toBe(201);people.push(created.data.id);
   }
   expect(new Set(people).size).toBe(2);
   expect((await call('/api/candidates/'+people[0]+'/personal-data?unified=1','PATCH',{fullName:'CI Only first'})).status).toBe(200);
   const all=(await call('/api/bootstrap?unified=1')).data.candidates;
   expect(all.find((c:any)=>c.id===people[0]).fullName).toBe('CI Only first');expect(all.find((c:any)=>c.id===people[1]).fullName).toBe('CI separate identity');
   expect((await call('/api/candidates/'+people[0]+'/personal-data?unified=1','PATCH',{fullName:'CI Unauthorized'},trainer)).status).toBe(403);
   expect((await call('/api/candidates/CAN-99980001/personal-data?unified=1','PATCH',{fullName:'Ambiguous'})).status).toBe(409);
  }finally{env.ORG_ENABLED=undefined;}
 });
 it('creación y edición global guarda accesos de dos empresas con rollback y CAS',async()=>{
  env.ORG_ENABLED='true';
  try {
   const grants=['talent-up','techcenter'].map(companyId=>({companyId,role:'RECLUTADOR',enabled:true,allCampaigns:false,scopes:[companyId+':bitel-portabilidad'],version:null}));
   const created=await call('/api/users','POST',{username:'ci.twocompanies',password:'CI-password-2026',displayName:'Two companies',dni:'71000003',role:'RECLUTADOR',module:['SELECCION'],companyAccess:grants});
   expect(created.status).toBe(200);
   const u=(await call('/api/bootstrap')).data.users.find((u:any)=>u.email==='ci.twocompanies');expect(u).toBeTruthy();
   await db.query('update talent.profiles set must_change_password=false where auth_user_id=$1',[u.id]);authUsers.get(u.id).app_metadata={runtime_password_pending:false};
   const session=await call('/api/session','GET',undefined,u.id);expect(session.status).toBe(200);expect(session.data.companies.map((c:any)=>c.id).sort()).toEqual(['talent-up','techcenter']);
   expect((await call('/api/session','GET',undefined,u.id,'tenant')).status).toBe(403);
   expect((await call('/api/bootstrap','GET',undefined,u.id,'konectados')).status).toBe(403);
   expect((await call('/api/org/dashboard','POST',{},u.id)).status).toBe(403);
   const list=(await call('/api/org')).data.memberships.filter((m:any)=>m.auth_user_id===u.id);
   const edit=grants.map(g=>({...g,version:list.find((m:any)=>m.company_id===g.companyId).version,enabled:g.companyId==='talent-up'}));
   const before=(await db.query('select display_name from talent.profiles where auth_user_id=$1',[u.id])).rows[0].display_name;
   const failed=await call('/api/users/'+u.id+'/access','PATCH',{displayName:'Should rollback',role:'RECLUTADOR',status:'ACTIVO',module:['SELECCION'],companyAccess:edit.map(g=>g.companyId==='techcenter'?{...g,version:999}:g)});
   expect(failed.status).toBe(409);expect((await db.query('select display_name from talent.profiles where auth_user_id=$1',[u.id])).rows[0].display_name).toBe(before);
   expect((await call('/api/users/'+u.id+'/access','PATCH',{displayName:'One company',role:'RECLUTADOR',status:'ACTIVO',module:['SELECCION'],companyAccess:edit})).status).toBe(200);
   expect((await call('/api/session','GET',undefined,u.id)).data.companies.map((c:any)=>c.id)).toEqual(['talent-up']);
   expect((await call('/api/bootstrap','GET',undefined,u.id,'techcenter')).status).toBe(403);
   expect((await call('/api/users/'+u.id+'/access','PATCH',{role:'ADMIN',companyAccess:grants},u.id,'talent-up')).status).not.toBe(200);
   const homeCreate=await call('/api/users','POST',{username:'ci.companyhome',password:'CI-password-2026',displayName:'Company home',dni:'71000004',role:'RECLUTADOR',module:['SELECCION'],companyAccess:[grants[0]]},admin,'talent-up');expect(homeCreate.status).toBe(200);
   const crossUser=(await call('/api/bootstrap')).data.users.find((v:any)=>v.email==='ci.companyhome');expect(crossUser.companyId).toBe('talent-up');
   expect((await call('/api/users/'+crossUser.id+'/access','PATCH',{displayName:'Edited from Talent-On',role:'RECLUTADOR',status:'ACTIVO',module:['SELECCION']})).status).toBe(200);
  } finally {env.ORG_ENABLED=undefined;}
 });
 it('encuesta se abre solo al finalizar y conserva respuestas únicas aunque cambie el documento',async()=>{
  const detail=await call('/api/trainings/'+groupId+'/survey');
  expect(detail.status).toBe(200);expect(detail.data.enabled).toBe(false);
  expect((await call('/api/trainings/'+groupId+'/survey','GET',undefined,other)).status).not.toBe(200);
  const path='/api/public/surveys/'+detail.data.token;
  const identifiers=(await db.query(`select i.* from talent.persons i join talent.applications a on a.company_id=i.company_id and a.person_id=i.id join talent.participants p on p.company_id=a.company_id and p.application_id=a.id where p.group_id=$1 and i.archived_at is null`,[groupId])).rows;
  expect(identifiers.length).toBeGreaterThan(0);
  const identity=identifiers[0];
  await db.query('update talent.persons set document_number=$1 where company_id=$2 and id=$3',['00123456',identity.company_id,identity.id]);
  const body={documentType:'DNI',document:'00123456',answers:[5,5,5,5,5,5,5,5],positive:'Muy claro',improvement:'Más prácticas'};
  expect((await call(path,'POST',body)).data.message).toBe('SURVEY_DISABLED');
  await db.query("update talent.training_groups set status='FINALIZADA' where id=$1",[groupId]);
  await db.query("update talent.training_groups set status='FINALIZADA' where id=$1",[groupId]);
  expect((await db.query('select count(*)::int as n from talent_surveys.surveys where group_id=$1',[groupId])).rows[0].n).toBe(1);
  expect((await call(path)).data.enabled).toBe(true);
  expect((await call(path,'POST',{...body,answers:[6,5,5,5,5,5,5,5]})).data.message).toBe('SURVEY_INVALID');
  expect((await call(path,'POST',{...body,document:'12345678'})).data.message).toBe('SURVEY_PARTICIPANT_NOT_FOUND');
  expect((await call(path,'POST',body)).status).toBe(200);
  expect((await call(path,'POST',body)).status).toBe(409);
  await db.query('update talent.persons set document_number=$1 where company_id=$2 and id=$3',['00123457',identity.company_id,identity.id]);
  expect((await call(path,'POST',{...body,document:'00123457'})).status).toBe(409);
  const completed=(await call('/api/trainings/'+groupId+'/survey')).data;
  expect(completed.responses).toHaveLength(1);expect(completed.responses[0].score).toBe(20);
  expect(completed.participants.filter((p:any)=>p.completed)).toHaveLength(1);
  expect(completed.responses[0].participantId).toBeUndefined();
  const exported=await call('/api/trainings/'+groupId+'/survey?export=1');
  expect(exported.status).toBe(200);
  expect((await db.query("select count(*)::int as n from talent_surveys.audit where survey_id=$1 and action='EXPORTED'",[detail.data.id])).rows[0].n).toBe(1);
  expect((await call('/api/trainings/'+groupId+'/survey?export=1','GET',undefined,trainer)).status).toBe(403);
  const grants=(await db.query("select has_function_privilege('anon','public.talent_survey_detail(text,text,text)','EXECUTE') as public_read, has_function_privilege('authenticated','public.talent_survey_public(uuid,jsonb)','EXECUTE') as bypass")).rows[0];
  expect(grants).toEqual({public_read:false,bypass:false});
  // CE uses the same stable participant identity and preserves leading zeroes.
  await db.query("update talent.persons set document_type='CE',document_number='000ABC123' where company_id=$1 and id=$2",[identity.company_id,identity.id]);
  expect((await call(path,'POST',{...body,documentType:'CE',document:'000ABC123'})).status).toBe(409);
  // Contended inserts are protected by the database unique constraint, not a preflight read.
  await db.query('delete from talent_surveys.responses where survey_id=$1',[detail.data.id]);
  const attempts=await Promise.allSettled([1,2].map(()=>db.query('select public.talent_survey_public($1,$2::jsonb)',[detail.data.token,JSON.stringify({...body,documentType:'CE',document:'000ABC123',answers:[1,1,1,1,1,1,1,1]})])));
  expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(attempts.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((await call('/api/trainings/'+groupId+'/survey')).data.responses[0].score).toBe(4);
  await db.query('update talent.persons set document_type=$1 where company_id=$2 and id=$3',[identity.document_type,identity.company_id,identity.id]);
  await db.query('update talent.persons set document_number=$1 where company_id=$2 and id=$3',[identity.document_number,identity.company_id,identity.id]);
 });
 it('permite pasar directamente a Apto con datos básicos completos y documentos pendientes',async()=>{
  const created=await call('/api/candidates','POST',{dni:'99900009',fullName:'CI Apto directo',campaignId,recruiterId:admin,source:'Otro'});
  expect(created.status).toBe(201);
  const id=created.data.id;
  const incomplete=await call('/api/candidates/'+id+'/stage','POST',{stage:'APTO_CAPACITACION'});
  expect(incomplete.status).toBe(409);
  expect(incomplete.data.message).toContain('celular');
  expect((await call('/api/candidates/'+id+'/personal-data','PATCH',{phone:'999000009'})).status).toBe(200);
  expect((await call('/api/candidates/'+id+'/stage','POST',{stage:'APTO_CAPACITACION'})).status).toBe(200);
  const candidate=(await call('/api/bootstrap')).data.candidates.find((item:any)=>item.id===id);
  expect(candidate.selection.stage).toBe('APTO_CAPACITACION');
  expect(candidate.documents).toHaveLength(0);
  const rejected=await call('/api/candidates','POST',{dni:'99900010',fullName:'CI Descartado',phone:'999000010',campaignId,recruiterId:admin,source:'Otro'});
  expect(rejected.status).toBe(201);
  expect((await call('/api/candidates/'+rejected.data.id+'/stage','POST',{stage:'NO_APTO'})).status).toBe(200);
  expect((await call('/api/candidates/'+rejected.data.id+'/stage','POST',{stage:'APTO_CAPACITACION'})).status).toBe(400);
 });

 it('piloto: un desbloqueo vencido se bloquea y permite solicitar y aprobar otro',async()=>{
  const u=(await db.query("select id,day_date from talent.attendance_unlocks where group_id=$1 limit 1",[groupId])).rows[0];
  const date=new Date(u.day_date).toISOString().slice(0,10);
  await db.query("update talent.attendance_unlocks set status='APROBADA',decided_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1",[u.id]);
  const path='/api/trainings/'+groupId;
  expect((await call(path+'/attendance-window?date='+date,'GET',undefined,trainer)).data.state).toBe('LOCKED');
  expect((await call(path+'/attendance-unlocks/'+date,'POST',{reason:'Nueva corrección requerida'},trainer)).status).toBe(201);
  expect((await call(path+'/attendance-unlocks/'+date,'POST',{reason:'Intento duplicado'},trainer)).status).toBe(409);
  expect((await call(path+'/attendance-unlocks/'+date,'PATCH',{decision:'APROBADA'},trainer)).status).toBe(403);
  expect([403,404]).toContain((await call(path+'/attendance-unlocks/'+date,'POST',{reason:'Otra empresa'},other)).status);
  const approved=await call(path+'/attendance-unlocks/'+date,'PATCH',{decision:'APROBADA',reason:'Revisión autorizada'});
  expect(approved.status).toBe(200);
  expect(Date.parse(approved.data.expiresAt)-Date.parse(approved.data.decidedAt)).toBeGreaterThan(29*60000);
  expect(Date.parse(approved.data.expiresAt)-Date.parse(approved.data.decidedAt)).toBeLessThanOrEqual(30*60000);
  expect((await call(path+'/attendance-window?date='+date,'GET',undefined,trainer)).data.state).toBe('UNLOCKED');
  await expect(db.query("update talent.attendance_unlocks set status='PENDIENTE' where id=$1",[u.id])).rejects.toThrow('TALENT_USE_UNLOCK_RPC');
  const privileges=(await db.query("select has_function_privilege('anon','public.talent_unlock_request(uuid,text,text,date,text)','EXECUTE') as anon,has_function_privilege('authenticated','public.talent_unlock_request(uuid,text,text,date,text)','EXECUTE') as authenticated")).rows[0];
  expect(privileges).toEqual({anon:false,authenticated:false});
 });
 it('piloto: el servidor registra nota cero como no aprobada, sin aceptar mínimos ni snapshots del cliente',async()=>{
  // Fixture aislado; no se modifican datos reales.
  await db.query("update talent.training_groups set status='EN_CAPACITACION' where id=$1",[groupId]);
  await db.query("update talent.participants set status='EN_CAPACITACION',ojt_status='NO_INICIADO',training_approved=false where group_id=$1",[groupId]);
  const path='/api/trainings/'+groupId;
  expect((await call(path+'/management','PATCH',{operation:'EVALUATION_CONFIG',config:{name:'Regresión cero',maxScore:20,minScore:16}})).status).toBe(200);
  const config=(await call('/api/bootstrap')).data.cohorts.find((g:any)=>g.id===groupId).evaluationsConfig.find((d:any)=>d.name==='Regresión cero');
  const recorded=await call(path+'/participants/'+personId+'/evaluations','POST',{evaluationId:config.id,score:0,maxScore:1,minRequired:0,result:'APROBADO',definitionSnapshot:{id:config.id,name:'Falsa',maxScore:1,minScore:0}},trainer);
  expect(recorded.status).toBe(201);
  const participant=(await call('/api/bootstrap')).data.candidates.find((c:any)=>c.id===personId);
  expect(participant.training.evaluations.find((e:any)=>e.evaluationId===config.id)).toMatchObject({score:0,maxScore:20,minRequired:16,result:'NO_APROBADO'});
  expect((await call(path+'/participants/'+personId+'/ojt/start','POST',{},trainer)).status).not.toBe(201);
  expect((await call(path+'/participants/'+personId+'/ojt/result','POST',{status:'OJT_APROBADO'},trainer)).status).not.toBe(201);
 });

 it('inicio y cierre grupal conserva reprogramados y exige notas para todos los participantes activos',async()=>{
  const ids:string[]=[];
  for(const dni of ['99888001','99888002','99888003']){
   const created=await call('/api/candidates','POST',{dni,fullName:'CI grupo '+dni,phone:'999888001',campaignId,recruiterId:admin,source:'Otro'});
   expect(created.status).toBe(201);ids.push(created.data.id);
   expect((await call('/api/candidates/'+created.data.id+'/stage','POST',{stage:'APTO_CAPACITACION'})).status).toBe(200);
  }
  const day=new Date().toISOString().slice(0,10);
  const created=await call('/api/trainings/from-selection','POST',{campaignId,candidateIds:ids,name:'CI grupal',code:'CI-BULK-THEORY',startDate:day,endDate:day,totalDays:1,modality:'PRESENCIAL',schedule:'09:00-16:00'});
  expect(created.status).toBe(201);const path='/api/trainings/'+created.data.id;
  expect((await call(path+'/trainer','POST',{trainerId:trainer})).status).toBe(200);
  expect((await call(path+'/participants/'+ids[2]+'/status','POST',{status:'REPROGRAMADO'},trainer)).status).toBe(201);
  expect((await call(path+'/theory/start','POST',{},trainer)).data.count).toBe(2);
  const incomplete=await call(path+'/theory/finish','POST',{grades:[{candidateId:ids[0],score:18}]},trainer);
  expect(incomplete.status).toBe(400);
  const before=(await call('/api/bootstrap')).data.candidates;
  expect(ids.slice(0,2).map(id=>before.find((c:any)=>c.id===id).training.status)).toEqual(['EN_CAPACITACION','EN_CAPACITACION']);
  expect((await call(path+'/theory/finish','POST',{grades:ids.slice(0,2).map((id,i)=>({candidateId:id,score:18+i}))},trainer)).data.message).toBe('OFFER_SIGNATURES_PENDING');
  await signGroup(created.data.id);
  expect((await call(path+'/theory/finish','POST',{grades:ids.slice(0,2).map((id,i)=>({candidateId:id,score:18+i}))},trainer)).data).toMatchObject({count:2,status:'PENDIENTE_OJT'});
  const after=(await call('/api/bootstrap')).data.candidates;
  expect(after.find((c:any)=>c.id===ids[0]).training).toMatchObject({status:'PENDIENTE_OJT',finalGrade:18});
  expect(after.find((c:any)=>c.id===ids[1]).training).toMatchObject({status:'PENDIENTE_OJT',finalGrade:19});
  expect(after.find((c:any)=>c.id===ids[2]).training.status).toBe('REPROGRAMADO');
 });
 it('teoría simplificada: cierre atómico conserva el historial sin exigir aprobar evaluaciones antiguas',async()=>{
  await db.query("update talent.training_groups set status='PROGRAMADA' where id=$1",[groupId]);
  await db.query("update talent.participants set status='PENDIENTE_INICIO',ojt_status='NO_INICIADO',training_approved=false,annotations=annotations-'finalGrade'-'theoryCompletedAt' where group_id=$1",[groupId]);
  const path='/api/trainings/'+groupId;
  const previous=(await call('/api/bootstrap')).data.candidates.find((c:any)=>c.id===personId).training.evaluations.length;
  expect((await call(path+'/theory/start','POST',{},trainer)).data).toMatchObject({status:'EN_CAPACITACION',count:1});
  expect((await call(path+'/theory/start','POST',{},trainer)).status).toBe(400);
  for(const grades of [[],[{candidateId:personId,score:''}],[{candidateId:personId,score:21}],[{candidateId:'ajeno',score:18}],[{candidateId:personId,score:18},{candidateId:personId,score:18}]])
   expect((await call(path+'/theory/finish','POST',{grades},trainer)).status).toBe(400);
  expect((await call('/api/bootstrap')).data.candidates.find((c:any)=>c.id===personId).training.status).toBe('EN_CAPACITACION');
  expect((await call(path+'/participants/'+personId+'/ojt/start','POST',{},trainer)).status).toBe(400);
  expect([403,404]).toContain((await call(path+'/theory/finish','POST',{grades:[{candidateId:personId,score:0}]},other)).status);
  expect((await call(path+'/theory/finish','POST',{grades:[{candidateId:personId,score:0}]},trainer)).data.status).toBe('PENDIENTE_OJT');
  const bootstrap=(await call('/api/bootstrap')).data;
  const saved=bootstrap.candidates.find((c:any)=>c.id===personId);
  expect(saved.training).toMatchObject({status:'PENDIENTE_OJT',finalGrade:0});
  expect(saved.training.evaluations.length).toBe(previous);
  expect(bootstrap.cohorts.find((g:any)=>g.id===groupId).status).toBe('PENDIENTE_OJT');
  expect((await call(path+'/theory/finish','POST',{grades:[{candidateId:personId,score:20}]},trainer)).status).toBe(400);
  expect((await call(path+'/participants/'+personId+'/ojt/start','POST',{},trainer)).status).toBe(201);
  expect((await call('/api/bootstrap')).data.cohorts.find((g:any)=>g.id===groupId).status).toBe('EN_OJT');
 });

 it('propuestas: permisos, personalización, versiones, firma inmutable y bloqueo de todos los participantes',async()=>{
  const recruiter='40000000-0000-4000-8000-000000000004', analyst='40000000-0000-4000-8000-000000000005', outsider='40000000-0000-4000-8000-000000000006';
  for(const [id,role] of [[recruiter,'RECLUTADOR'],[analyst,'ANALISTA_SELECCION'],[outsider,'RECLUTADOR']]){
   await db.query('insert into auth.users values($1)',[id]);authUsers.set(id,{id});
   await db.query("insert into talent.profiles(company_id,id,auth_user_id,username,display_name,role,status) values('tenant',$1::text,$1::uuid,$1::text,'CI oferta',$2,'ACTIVO')",[id,role]);
   await db.query("insert into talent.user_modules(company_id,id,user_id,module) values('tenant',$1,$1,'SELECCION')",[id]);
   if(id!==outsider)await db.query("insert into talent.campaign_assignments(company_id,id,campaign_id,user_id,assignment_kind) values('tenant',$1,$2,$1,'SCOPE')",[id,campaignId]);
  }
  const ids:string[]=[];
  for(const dni of ['99777001','99777002','99777003']){
   const p=await call('/api/candidates','POST',{dni,fullName:'Postulante '+dni,phone:'999777001',campaignId,recruiterId:admin,source:'Otro'});expect(p.status).toBe(201);ids.push(p.data.id);
   expect((await call('/api/candidates/'+p.data.id+'/stage','POST',{stage:'APTO_CAPACITACION'})).status).toBe(200);
  }
  const day=new Date().toISOString().slice(0,10);
  const created=await call('/api/trainings/from-selection','POST',{campaignId,candidateIds:ids.slice(0,2),name:'CI propuestas',code:'CI-OFFERS',startDate:day,endDate:day,totalDays:2,modality:'PRESENCIAL',schedule:'09:00-16:00'});
  expect(created.status).toBe(201);const group=created.data.id,path='/api/trainings/'+group;
  expect((await call(path+'/trainer','POST',{trainerId:trainer})).status).toBe(200);
  const payload={campaignId,title:'Condiciones 1',content:'Estimado {{nombre}}, propuesta de {{empresa}} para {{campaña}}. Bonos y políticas CI.'};
  expect((await call('/api/offers/templates','POST',payload,recruiter)).status).toBe(403);
  expect((await call('/api/offers/templates','POST',payload,trainer)).status).toBe(403);
  expect((await call('/api/offers/templates','POST',payload,other)).status).toBe(403);
  const t1=await call('/api/offers/templates','POST',payload,analyst);expect(t1.status).toBe(200);
  expect((await call('/api/offers/assign','POST',{groupId:group,templateId:t1.data},analyst)).status).toBe(403);
  expect((await call('/api/offers/assign','POST',{groupId:group,templateId:t1.data},outsider)).status).toBe(403);
  expect((await call('/api/offers/assign','POST',{groupId:group,templateId:t1.data},recruiter)).status).toBe(200);
  const old=(await call('/api/offers?group='+group,'GET',undefined,trainer)).data.documents;expect(old).toHaveLength(2);
  const richHtml='<h2>Condiciones 2</h2><p>Estimado {{nombre}}, propuesta de {{empresa}} para {{campaña}}.</p><table><tbody><tr><td>Sueldo</td><td>S/ 1500</td></tr></tbody></table>';
  const richContent='TALENT_OFFER_HTML_V1:'+Buffer.from(richHtml).toString('base64');
  expect((await call('/api/offers/templates','POST',{...payload,content:'TALENT_OFFER_HTML_V1:%%%'},analyst)).status).toBe(400);
  const t2=await call('/api/offers/templates','POST',{...payload,title:'Condiciones 2',content:richContent},analyst);expect(t2.status).toBe(200);
  expect((await call('/api/offers/assign','POST',{groupId:group,templateId:t2.data},recruiter)).status).toBe(200);
  expect((await call('/api/public/offers/'+old[0].token)).data.message).toBe('OFFER_NOT_FOUND');
  const catalog=(await call('/api/offers?group='+group,'GET',undefined,trainer)).data;
  const docs=catalog.documents.filter((d:any)=>!d.revokedAt);
  expect(docs).toHaveLength(2);
  expect((await call('/api/offers/documents/'+docs[0].id,'GET',undefined,other)).status).toBe(403);
  expect((await call('/api/offers?group='+group,'GET',undefined,outsider)).status).toBe(403);
  const signature=[Array.from({length:15},(_,i)=>[i*10,20+i])];
  for(const doc of docs){
   const pub=await call('/api/public/offers/'+doc.token);
   expect(pub.data.snapshot.name).toBe(doc.name);expect(pub.data.snapshot.dni).toBeUndefined();expect(pub.data.snapshot.content).toBe(richContent);expect(Buffer.from(pub.data.snapshot.content.split(':')[1],'base64').toString()).toBe(richHtml);
   const row=(await db.query('select * from talent_offers.documents where id=$1',[doc.id])).rows[0];
   for(const invalid of [{accepted:false},{dni:'11111111'},{contentHash:'forged'},{signature:[]},{signature:[[[999,1]]]},{signature:[[['<script>',1]]]}]){
    expect((await call('/api/public/offers/'+doc.token,'POST',{accepted:true,dni:row.snapshot.dni,contentHash:row.content_hash,signature,...invalid})).data.message).toBe('OFFER_INVALID_SIGNATURE');
   }
  }
  expect((await call(path+'/theory/start','POST',{},trainer)).status).toBe(200);
  await db.query("update talent.participants set status='REPROGRAMADO' where group_id=$1 and application_id in (select id from talent.applications where person_id=$2)",[group,ids[1]]);
  const finish={grades:[{candidateId:ids[0],score:18}]};
  expect((await call(path+'/theory/finish','POST',finish,trainer)).data.message).toBe('OFFER_SIGNATURES_PENDING');
  for(let i=0;i<docs.length;i++){
   const row=(await db.query('select * from talent_offers.documents where id=$1',[docs[i].id])).rows[0];
   const body={accepted:true,dni:row.snapshot.dni,contentHash:row.content_hash,signature};
   const signed=await call('/api/public/offers/'+docs[i].token,'POST',body);expect(signed.status).toBe(200);expect(signed.data.signature).toEqual(signature);
   const again=await call('/api/public/offers/'+docs[i].token,'POST',{...body,signature:[[[1,1]]]});expect(again.status).toBe(200);
   expect((await db.query('select signature from talent_offers.documents where id=$1',[docs[i].id])).rows[0].signature).toEqual(signature);
   await expect(db.query("update talent_offers.documents set snapshot='{}' where id=$1",[docs[i].id])).rejects.toThrow('OFFER_IMMUTABLE');
   if(i===0)expect((await call(path+'/theory/finish','POST',finish,trainer)).data.message).toBe('OFFER_SIGNATURES_PENDING');
  }
  expect((await call('/api/offers/assign','POST',{groupId:group,templateId:t1.data},recruiter)).data.message).toBe('OFFER_ALREADY_SIGNED');
  const saved=(await call('/api/offers/documents/'+docs[0].id,'GET',undefined,analyst)).data;expect(saved.signed_at).toBeTruthy();expect(saved.acceptance).toContain('acepto');expect(saved.evidence_hash).toHaveLength(64);
  // Un participante agregado después también recibe su documento personalizado.
  const app=(await db.query('select id from talent.applications where person_id=$1',[ids[2]])).rows[0].id;
  await db.query("insert into talent.participants(company_id,id,group_id,application_id,status,joined_at) values('tenant','late-offer',$1,$2,'REPROGRAMADO',now())",[group,app]);
  const late=(await db.query("select * from talent_offers.documents where participant_id='late-offer'")).rows[0];expect(late.snapshot.name).toContain('99777003');
  expect((await call(path+'/theory/finish','POST',finish,trainer)).data.message).toBe('OFFER_SIGNATURES_PENDING');
  for(let i=0;i<11;i++)await call('/api/public/offers/'+late.token,'POST',{accepted:true,dni:'wrong',contentHash:late.content_hash,signature});
  expect((await call('/api/public/offers/'+late.token,'POST',{accepted:true,dni:late.snapshot.dni,contentHash:late.content_hash,signature})).status).toBe(429);
  await db.query("update talent_offers.attempts set window_at=now()-interval '16 minutes' where token=$1",[late.token]);
  expect((await call('/api/public/offers/'+late.token,'POST',{accepted:true,dni:late.snapshot.dni,contentHash:late.content_hash,signature})).status).toBe(200);
  expect((await call(path+'/theory/finish','POST',finish,trainer)).status).toBe(200);
  expect((await call('/api/offers/assign','POST',{groupId:group,templateId:t2.data},recruiter)).data.message).toBe('OFFER_STAGE_CLOSED');
  const funcs=await db.query("select has_function_privilege('anon','public.talent_offer_public(text,jsonb,text)','execute') as anon,has_function_privilege('authenticated','public.talent_offer_assign(uuid,text,text,uuid)','execute') as authenticated");
  expect(funcs.rows[0]).toEqual({anon:false,authenticated:false});
 });

 it('propuestas usa catálogo empresarial sin convocatorias y reutiliza la plantilla entre convocatorias de la misma campaña',async()=>{
  await db.query('select public.talent_org_member_save($1,$1,$2,$3,true,true,$4,null)',[admin,'konectados','ADMIN','{}']);
  env.ORG_ENABLED='true';
  try{
   const catalog=await call('/api/offers','GET',undefined,admin,'konectados');
   expect(catalog.status).toBe(200);expect(catalog.data.groups).toHaveLength(0);expect(catalog.data.campaigns.length).toBeGreaterThan(0);
   expect(catalog.data.campaigns.every((c:any)=>c.id.startsWith('catalog:'))).toBe(true);
   const key=catalog.data.campaigns[0].id;
   const template=await call('/api/offers/templates','POST',{campaignId:key,title:'Propuesta de campaña',content:'Condiciones para {{nombre}}, días, pagos y políticas.'},admin,'konectados');
   expect(template.status).toBe(200);
   expect((await call('/api/offers/templates','POST',{campaignId:key,title:'Ajena',content:'Condiciones para otra empresa ajena, inválidas.'},admin,'techcenter')).status).toBe(403);
   const now=new Date().toISOString().slice(0,10);
   for(let i=0;i<2;i++){
    const cmp=await call('/api/campaigns','POST',{code:'OFFER-CATALOG-'+i,title:'Convocatoria '+i,vacancies:1,status:'EN_PROCESO',assignedAnalystId:admin,responsibles:[{userId:admin,target:1}],companyCampaignId:key.slice(8)},admin,'konectados');
    expect(cmp.status).toBe(201);
    const p=await call('/api/candidates','POST',{dni:'9966600'+i,fullName:'CI catálogo '+i,phone:'999888777',campaignId:cmp.data.id,recruiterId:admin,source:'Otro'},admin,'konectados');
    expect(p.status).toBe(201);
    expect((await call('/api/candidates/'+p.data.id+'/stage','POST',{stage:'APTO_CAPACITACION'},admin,'konectados')).status).toBe(200);
    const g=await call('/api/trainings/from-selection','POST',{campaignId:cmp.data.id,candidateIds:[p.data.id],name:'Grupo catálogo '+i,code:'CAT-G-'+i,startDate:now,endDate:now,totalDays:2,modality:'PRESENCIAL',schedule:'09:00-16:00'},admin,'konectados');
    expect(g.status).toBe(201);
    expect((await call('/api/offers/assign','POST',{groupId:g.data.id,templateId:template.data},admin,'konectados')).status).toBe(200);
    const refreshed=await call('/api/offers?group='+g.data.id,'GET',undefined,admin,'konectados');
    expect(refreshed.data.groups[0].campaignKey).toBe(key);
    expect(refreshed.data.templates.find((t:any)=>t.id===template.data).campaignKey).toBe(key);
    expect(refreshed.data.documents).toHaveLength(1);
   }
  }finally{env.ORG_ENABLED=undefined;}
 });

 it('selector de propuestas respeta el rol efectivo por empresa y excluye Formación',async()=>{
  const analyst='40000000-0000-4000-8000-000000000005';
  for(const [company,role] of [['konectados','ANALISTA_SELECCION'],['talent-up','JEFE_FORMACION'],['techcenter','JEFE_FORMACION']]){
   await db.query('select public.talent_org_member_save($1,$2,$3,$4,true,true,$5,null)',[admin,analyst,company,role,'{}']);
  }
  env.ORG_ENABLED='true';
  try{
   const result=await call('/api/offers/companies','GET',undefined,analyst,'konectados');
   expect(result.status).toBe(200);
   expect(result.data.companies).toContainEqual({id:'konectados',name:'Konectados',role:'ANALISTA_SELECCION'});
   expect(result.data.companies.some((c:any)=>['talent-up','techcenter'].includes(c.id))).toBe(false);
   expect((await call('/api/offers','GET',undefined,analyst,'techcenter')).status).toBe(403);
   expect((await call('/api/offers','GET',undefined,analyst,'konectados')).status).toBe(200);
  }finally{env.ORG_ENABLED=undefined;}
 });
 it('asignación masiva cruza jornadas, conserva firmas y deja pendientes sin coincidencia',async()=>{
  const recruiter='40000000-0000-4000-8000-000000000004';
  const analyst='40000000-0000-4000-8000-000000000005';
  const people:string[]=[];
  for(const [i,schedule] of ['Fulltime','Semifull','Part',''].entries()){
   const p=await call('/api/candidates','POST',{dni:'9955500'+i,fullName:'CI jornada '+i,phone:'999888777',campaignId,recruiterId:admin,source:'Otro',workSchedule:schedule});expect(p.status).toBe(201);people.push(p.data.id);
   expect((await call('/api/candidates/'+p.data.id+'/stage','POST',{stage:'APTO_CAPACITACION'})).status).toBe(200);
  }
  const day=new Date().toISOString().slice(0,10);
  const created=await call('/api/trainings/from-selection','POST',{campaignId,candidateIds:people,name:'CI jornadas',code:'CI-WORKDAY',startDate:day,endDate:day,totalDays:2,modality:'PRESENCIAL',schedule:'09:00-16:00'});expect(created.status).toBe(201);const group=created.data.id;
  const base={campaignId,title:'CI jornada',content:'Condiciones laborales para {{nombre}} por jornada registrada.'};
  expect((await call('/api/offers/templates','POST',{...base,workday:'MAÑANA'},analyst)).status).toBe(400);
  const full=await call('/api/offers/templates','POST',{...base,workday:'FULL_TIME'},analyst);expect(full.status).toBe(200);
  const semi=await call('/api/offers/templates','POST',{...base,workday:'SEMI_FULL'},analyst);expect(semi.status).toBe(200);
  expect((await call('/api/offers/assign','POST',{groupId:group,templateId:full.data},recruiter)).data.message).toBe('OFFER_USE_WORKDAY_ASSIGNMENT');
  expect((await call('/api/offers/workday-plan?group='+group,'GET',undefined,analyst)).status).toBe(403);
  expect((await call('/api/offers/workday-plan?group='+group,'GET',undefined,other)).status).toBe(403);
  let plan=(await call('/api/offers/workday-plan?group='+group,'GET',undefined,recruiter)).data;
  expect(plan.participants.map((p:any)=>p.status).sort()).toEqual(['MISSING_TEMPLATE','MISSING_WORKDAY','READY','READY']);
  expect((await call('/api/offers/assign-workdays','POST',{groupId:group,hash:'stale'},recruiter)).data.message).toBe('OFFER_PLAN_CHANGED');
  let assigned=await call('/api/offers/assign-workdays','POST',{groupId:group,hash:plan.hash},recruiter);expect(assigned.status).toBe(200);expect(assigned.data.assigned).toBe(2);
  const docs=(await db.query('select * from talent_offers.documents where group_id=$1 and revoked_at is null',[group])).rows;expect(docs).toHaveLength(2);
  expect(new Set(docs.map((d:any)=>d.snapshot.workday))).toEqual(new Set(['FULL_TIME','SEMI_FULL']));
  plan=assigned.data;
  expect((await call('/api/offers/assign-workdays','POST',{groupId:group,hash:plan.hash},recruiter)).data.assigned).toBe(0);
  const signed=docs.find((d:any)=>d.snapshot.workday==='FULL_TIME');
  expect((await call('/api/public/offers/'+signed.token,'POST',{dni:signed.snapshot.dni,accepted:true,contentHash:signed.content_hash,signature:[Array.from({length:12},(_,i)=>[i*10,30+i])]})).status).toBe(200);
  const newest=await call('/api/offers/templates','POST',{...base,workday:'FULL_TIME',title:'Nueva versión full'},analyst);expect(newest.status).toBe(200);
  expect((await call('/api/offers/templates','POST',{...base,workday:'PART_TIME'},analyst)).status).toBe(200);
  plan=(await call('/api/offers/workday-plan?group='+group,'GET',undefined,recruiter)).data;
  expect(plan.participants.filter((p:any)=>p.status==='SIGNED')).toHaveLength(1);
  assigned=await call('/api/offers/assign-workdays','POST',{groupId:group,hash:plan.hash},recruiter);expect(assigned.data.assigned).toBe(1);
  expect((await db.query('select content_hash from talent_offers.documents where id=$1',[signed.id])).rows[0].content_hash).toBe(signed.content_hash);
  // A jornada update invalidates the review and replaces only the unsigned participant.
  plan=assigned.data;
  await db.query("update talent.persons set annotations=annotations||jsonb_build_object('workSchedule','Fulltime') where id=$1",[people[1]]);
  expect((await call('/api/offers/assign-workdays','POST',{groupId:group,hash:plan.hash},recruiter)).data.message).toBe('OFFER_PLAN_CHANGED');
  plan=(await call('/api/offers/workday-plan?group='+group,'GET',undefined,recruiter)).data;
  expect((await call('/api/offers/assign-workdays','POST',{groupId:group,hash:plan.hash},recruiter)).data.assigned).toBe(1);
  const replaced=docs.find((d:any)=>d.snapshot.workday==='SEMI_FULL');expect((await call('/api/public/offers/'+replaced.token)).data.message).toBe('OFFER_NOT_FOUND');

  // Captured workday takes precedence over a legacy profile preference, never the shift.
  const source=(await db.query("select id from talent.recruitment_sources where company_id='tenant' limit 1")).rows[0].id;
  await db.query("insert into talent.captures(company_id,id,person_id,owner_id,source_id,status,received_at,annotations) values('tenant','offer-workday-capture',$1,$2,$3,'Nuevo',now(),$4)",[people[3],admin,source,JSON.stringify({applicant:{formSubmission:{answers:{workday:'Semi full',availability:'Turno tarde'}},techCenterAnswers:{preferredCampaignId:campaignId}}})]);
  const captured=(await db.query('select talent_offers.person_workday($1,$2,$3) as d',['tenant',people[3],campaignId])).rows[0].d;
  expect(captured).toEqual({workday:'SEMI_FULL',raw:'Semi full',source:'Formulario'});
  await db.query("update talent.captures set annotations=jsonb_set(annotations,'{applicant,formSubmission,answers,workday}','\"Turno mañana\"') where id='offer-workday-capture'");
  expect((await db.query('select talent_offers.person_workday($1,$2,$3) as d',['tenant',people[3],campaignId])).rows[0].d.workday).toBeNull();
  await expect(db.query('select talent_offers.require_signed($1,$2)',['tenant',group])).rejects.toThrow('OFFER_SIGNATURES_PENDING');
  const fn=(await db.query("select has_function_privilege('anon','public.talent_offer_assign_workdays(uuid,text,text,text)','execute') as anon,has_function_privilege('service_role','public.talent_offer_assign_legacy(uuid,text,text,uuid)','execute') as legacy")).rows[0];expect(fn).toEqual({anon:false,legacy:false});
 });

 it('enlace común exige DNI, aísla capacitación y firma únicamente la propuesta asignada',async()=>{
  const group=(await db.query("select id from talent.training_groups where code='CI-WORKDAY'")).rows[0].id;
  const catalog=(await call('/api/offers?group='+group)).data;
  const token=catalog.groups[0].publicToken;expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect((await call('/api/offers?group='+group)).data.groups[0].publicToken).toBe(token);
  expect((await call('/api/offers?group='+group,'GET',undefined,other)).status).toBe(403);
  const path='/api/public/offers/group/'+token;
  // No Authorization header: the shared link is explicitly public.
  const publicCall=async(body?:any)=>{const r=await worker.fetch(new Request('https://worker.test'+path,{method:body?'POST':'GET',headers:{Origin:'http://localhost:3000','Content-Type':'application/json','cf-connecting-ip':'192.0.2.22'},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,data:await r.json() as any};};
  const meta=await publicCall();expect(meta.status).toBe(200);expect(Object.keys(meta.data).sort()).toEqual(['company','group']);
  const docs=(await db.query('select * from talent_offers.documents where group_id=$1 and revoked_at is null',[group])).rows;
  const part=docs.find((d:any)=>d.snapshot.workday==='PART_TIME');const full=docs.find((d:any)=>d.signed_at);expect(part).toBeTruthy();
  const lookup=await publicCall({action:'lookup',dni:part.snapshot.dni});expect(lookup.status).toBe(200);expect(lookup.data.id).toBe(part.id);expect(lookup.data.snapshot.workday).toBe('PART_TIME');expect(lookup.data.snapshot.dni).toBeUndefined();expect(JSON.stringify(lookup.data)).not.toContain(part.token);
  const signedLookup=await publicCall({action:'lookup',dni:full.snapshot.dni});expect(signedLookup.data.signedAt).toBeTruthy();expect(signedLookup.data.id).toBe(full.id);
  for(const dni of ['', '00000000','99555003'])expect((await publicCall({action:'lookup',dni})).data.message).toBe('OFFER_LOOKUP_NOT_FOUND');
  const outside=(await db.query('select snapshot from talent_offers.documents where group_id<>$1 limit 1',[group])).rows[0];expect((await publicCall({action:'lookup',dni:outside.snapshot.dni})).data.message).toBe('OFFER_LOOKUP_NOT_FOUND');
  const signature=[Array.from({length:12},(_,i)=>[i*10,30+i])];
  expect((await publicCall({action:'sign',dni:part.snapshot.dni,accepted:true,contentHash:full.content_hash,signature})).data.message).toBe('OFFER_INVALID_SIGNATURE');
  const signed=await publicCall({action:'sign',dni:part.snapshot.dni,accepted:true,contentHash:part.content_hash,signature});expect(signed.status).toBe(200);expect(signed.data.id).toBe(part.id);expect(signed.data.signedAt).toBeTruthy();
  expect((await publicCall({action:'sign',dni:part.snapshot.dni,accepted:true,contentHash:part.content_hash,signature})).data.signedAt).toBe(signed.data.signedAt);
  expect((await db.query('select content_hash from talent_offers.documents where id=$1',[full.id])).rows[0].content_hash).toBe(full.content_hash);
  // Invalid lookups commit their counter, even though the HTTP response is an error.
  const key='group:'+token+':';await db.query('update talent_offers.attempts set attempts=40 where token like $1',[key+'%']);
  expect((await publicCall({action:'lookup',dni:part.snapshot.dni})).status).toBe(429);
  await db.query('delete from talent_offers.attempts where token like $1',[key+'%']);
  await db.query('update talent.training_groups set archived_at=now() where id=$1',[group]);expect((await publicCall()).data.message).toBe('OFFER_NOT_FOUND');
  await db.query('update talent.training_groups set archived_at=null where id=$1',[group]);
  expect((await db.query("select has_function_privilege('anon','public.talent_offer_group_public(text,jsonb,text)','execute') as anon,has_function_privilege('service_role','public.talent_offer_catalog_before_group_links(uuid,text,text)','execute') as legacy")).rows[0]).toEqual({anon:false,legacy:false});
 });

 it('analista inyecta aptos antes y durante teoría con auditoría, sin duplicados ni faltas previas',async()=>{
  const analyst='40000000-0000-4000-8000-000000000005',recruiter='40000000-0000-4000-8000-000000000004';
  const cmp=await call('/api/campaigns','POST',{code:'INJECTION',title:'Prueba inyección',vacancies:10,status:'EN_PROCESO',assignedAnalystId:analyst,responsibles:[{userId:recruiter,target:10}]});expect(cmp.status).toBe(201);
  const ids:string[]=[];
  for(let i=0;i<5;i++){const c=await call('/api/candidates','POST',{dni:'9944400'+i,fullName:'CI inyección '+i,campaignId:cmp.data.id,recruiterId:recruiter,phone:'999888777'});expect(c.status).toBe(201);ids.push(c.data.id);if(i!==4)expect((await call('/api/candidates/'+c.data.id+'/stage','POST',{stage:'APTO_CAPACITACION'})).status).toBe(200);}
  const day=new Date().toISOString().slice(0,10);
  const created=await call('/api/trainings/from-selection','POST',{campaignId:cmp.data.id,candidateIds:[ids[0]],name:'Inyecciones',code:'INJECT-TEST',startDate:day,endDate:day,totalDays:3,modality:'PRESENCIAL',schedule:'09:00-15:00'});expect(created.status).toBe(201);
  const group=created.data.id,path='/api/trainings/'+group+'/inject';
  expect((await call(path,'POST',{candidateIds:[ids[1]]},recruiter)).status).toBe(403);
  expect((await call(path,'POST',{candidateIds:[ids[1]]},other)).status).toBe(403);
  expect((await call(path,'POST',{candidateIds:[ids[1],ids[4]]},analyst)).data.message).toBe('CANDIDATE_NOT_READY_FOR_TRAINING');
  expect((await db.query('select count(*)::int n from talent.participants where group_id=$1',[group])).rows[0].n).toBe(1);
  const added=await call(path,'POST',{candidateIds:[ids[1],ids[1]]},analyst);expect(added.status).toBe(201);expect(added.data.count).toBe(1);
  const first=(await call('/api/bootstrap')).data.candidates.find((c:any)=>c.id===ids[1]);expect(first.training.status).toBe('PENDIENTE_INICIO');expect(first.training.injection.userId).toBe(analyst);expect(first.training.attendance).toEqual([]);
  expect((await call(path,'POST',{candidateIds:[ids[1]]},analyst)).data.message).toBe('CANDIDATE_ALREADY_IN_TRAINING');
  expect((await call('/api/trainings/'+group+'/trainer','POST',{trainerId:trainer})).status).toBe(200);
  expect((await call('/api/trainings/'+group+'/theory/start','POST',{},trainer)).status).toBe(200);
  const active=await call(path,'POST',{candidateIds:['uc.tenant.'+ids[2]]},analyst);expect(active.status).toBe(201);
  const after=(await call('/api/bootstrap')).data;const person=after.candidates.find((c:any)=>c.id===ids[2]);expect(person.training.status).toBe('EN_CAPACITACION');expect(person.training.injection.userId).toBe(analyst);expect(after.cohorts.find((g:any)=>g.id===group).enrolledCount).toBe(3);
  expect((await call('/api/trainings/'+group+'/participants/'+ids[2]+'/attendance','POST',{date:'2020-01-01',status:'FALTA',dayNumber:1},trainer)).data.message).toBe('ATTENDANCE_BEFORE_INJECTION');
  const injectedRow=(await db.query('select p.id from talent.participants p join talent.applications a on a.company_id=p.company_id and a.id=p.application_id where p.group_id=$1 and a.person_id=$2',[group,ids[2]])).rows[0];
  await expect(db.query("insert into talent.attendance(company_id,id,group_id,participant_id,day_date,status,marked_by) values('tenant','invalid-injection-attendance',$1,$2,'2020-01-01','FALTA',$3)",[group,injectedRow.id,trainer])).rejects.toThrow('ATTENDANCE_BEFORE_INJECTION');
  expect(after.cohorts.find((g:any)=>g.id===group).managementHistory.some((e:any)=>e.action==='INYECCION')).toBe(true);
  expect((await call('/api/trainings/'+group+'/theory/finish','POST',{grades:[ids[0],ids[1],ids[2]].map(candidateId=>({candidateId,score:18}))},trainer)).data.message).toBe('OFFER_SIGNATURES_PENDING');
  await db.query("update talent.training_groups set status='CANCELADA' where id=$1",[group]);
  expect((await call(path,'POST',{candidateIds:[ids[3]]},analyst)).data.message).toBe('TRAINING_INJECTION_CLOSED');
 });

});
