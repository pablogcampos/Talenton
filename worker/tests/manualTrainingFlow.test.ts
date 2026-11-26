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
let failNextCaptureCommit=false;let captureConflicts=0;let verificationCalls=0;
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
   const url=new URL(String(input));if(url.hostname==='challenges.cloudflare.com'){verificationCalls++;return Response.json({success:true,hostname:'example.test',action:'capture'});}if(url.hostname!=='sql-test.supabase.co')throw new Error('UNEXPECTED_PROVIDER '+url.hostname);
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
    else if(fn==='talent_runtime_commit'){if(body.p_public_hash&&captureConflicts>0){captureConflicts--;throw Object.assign(new Error('SIMULATED_CONFLICT'),{code:'PT409'});}if(failNextCaptureCommit){failNextCaptureCommit=false;throw new Error('SIMULATED_COMMIT_FAILURE');}result=await db.query('select public.talent_runtime_commit($1::uuid,$2,$3,$4,$5::jsonb,$6::text[]) as result',[body.p_actor,body.p_public_hash,body.p_company,body.p_revision,JSON.stringify(body.p_rows),body.p_resets||[]]);}
    else if(fn==='talent_candidate_create_commit'||fn?.startsWith('talent_voicebot_')||fn?.startsWith('talent_training_')||fn?.startsWith('talent_offer_')||fn?.startsWith('talent_org_')||fn?.startsWith('talent_survey_')||fn?.startsWith('talent_unlock_')){const keys=Object.keys(body);result=await db.query('select public.'+fn+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') as result',keys.map(k=>['p_rows','p_grants'].includes(k)?JSON.stringify(body[k]):Array.isArray(body[k])?'{'+body[k].join(',')+'}':body[k]&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]));}
    else throw new Error('UNKNOWN_RPC '+fn);
    await db.exec('commit');return fn==='talent_runtime_commit'?new Response(null,{status:204}):Response.json(result.rows[0].result??null);
   }catch(e:any){await db.exec('rollback');console.log('SQL ERROR',e.code,e.message);return Response.json({code:e.code,message:e.message},{status:e.code==='PT409'?409:400});}
  }));
 },30000);
 afterAll(async()=>{vi.unstubAllGlobals();await db?.close()});
it('formador creates Excel roster, starts theory, marks attendance and manages documents and offers without Selection',async()=>{
 await db.exec(`insert into talent_org.user_companies(company_id,id,auth_user_id,role,all_campaigns) values('tenant','manual-member','${trainer}','FORMADOR',true);insert into talent_org.user_companies(company_id,id,auth_user_id,role,all_campaigns) values('tenant','manual-admin','${admin}','ADMIN',true);insert into talent_org.global_campaigns(id,name) values('manual-global','Manual Campaign');insert into talent_org.company_campaigns(company_id,id,global_campaign_id) values('tenant','manual-catalog','manual-global');`);
 const day=new Date(Date.now()-5*3600000-86400000).toISOString().slice(0,10);
 const body={requestId:crypto.randomUUID(),name:'Excel directo',campaignId:'manual-catalog',startDate:day,endDate:day,time:'09:00',schedule:'09:00 - 18:00',modality:'REMOTO',rows:[{dni:'01888111',name:'Participante Excel',phone:'999111222',email:'',workday:'FULL_TIME'}],confirm:true};
 const made=await call('/api/trainings/manual','POST',body,trainer);expect(made.status).toBe(200);groupId=made.data.id;personId='CAN-01888111';
 const roster=await call('/api/bootstrap','GET',undefined,trainer);expect(roster.data.candidates.find((c:any)=>c.id===personId).trainingId).toBe(groupId);
 expect((await call('/api/trainings/'+groupId+'/theory/start','POST',{},trainer)).status).toBe(200);
 const unlockPath='/api/trainings/'+groupId+'/attendance-unlocks/'+day;expect((await call(unlockPath,'POST',{reason:'Validar asistencia histórica'},trainer)).status).toBe(201);
 const unlock=(await db.query('select id,version from talent.attendance_unlocks where group_id=$1',[groupId])).rows[0];await db.query('select public.talent_unlock_decide($1::uuid,$2,$3,$4,$5,$6,$7::timestamptz)',[admin,'tenant',unlock.id,unlock.version,true,'Prueba',new Date(Date.now()+3600000).toISOString()]);
 expect((await call('/api/trainings/'+groupId+'/attendance/bulk','POST',{candidateIds:[personId],date:day,dayNumber:1,status:'PRESENTE',attendance:'PRESENTE'},trainer)).status).toBe(201);
 const form=new FormData();form.append('file',new File(['Fixture'],'document.pdf',{type:'application/pdf'}));form.append('name','DNI');form.append('type','DNI');form.append('isMandatory','true');expect((await call('/api/candidates/'+personId+'/documents','POST',form,trainer)).status).toBe(201);
 expect((await call('/api/offers?group='+groupId,'GET',undefined,trainer)).data.canAssign).toBe(true);expect((await call('/api/offers/workday-plan?group='+groupId,'GET',undefined,trainer)).data.participants[0].workday).toBe('FULL_TIME');
 const draft=await call('/api/offers/templates','POST',{campaignId:'catalog:manual-catalog',title:'Propuesta oficial',content:'Condiciones de capacitación de prueba para {{nombre}}.',workday:'FULL_TIME'});expect(draft.status).toBe(200);expect((await call('/api/offers/publish','POST',{id:draft.data.id,revision:draft.data.revision})).status).toBe(200);
 const plan=await call('/api/offers/workday-plan?group='+groupId,'GET',undefined,trainer);expect((await call('/api/offers/assign-workdays','POST',{groupId,hash:plan.data.hash},trainer)).status).toBe(200);
 expect((await db.query('select count(*)::int n from talent_offers.documents')).rows[0].n).toBe(1);
 expect((await call('/api/trainings/manual','POST',body,other)).status).toBe(403);
 expect((await db.query('select count(*)::int n from talent.attendance')).rows[0].n).toBe(1);
});
});
