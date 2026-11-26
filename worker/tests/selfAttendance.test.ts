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
    else if(fn==='talent_candidate_create_commit'||fn?.startsWith('talent_voicebot_')||fn?.startsWith('talent_training_')||fn?.startsWith('talent_attendance_')||fn?.startsWith('talent_offer_')||fn?.startsWith('talent_org_')||fn?.startsWith('talent_survey_')||fn?.startsWith('talent_unlock_')){const keys=Object.keys(body);result=await db.query('select public.'+fn+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') as result',keys.map(k=>['p_rows','p_grants'].includes(k)?JSON.stringify(body[k]):Array.isArray(body[k])?'{'+body[k].join(',')+'}':body[k]&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]));}
    else throw new Error('UNKNOWN_RPC '+fn);
    await db.exec('commit');return fn==='talent_runtime_commit'?new Response(null,{status:204}):Response.json(result.rows[0].result??null);
   }catch(e:any){await db.exec('rollback');console.log('SQL ERROR',e.code,e.message);return Response.json({code:e.code,message:e.message},{status:e.code==='PT409'?409:400});}
  }));
 },30000);
 afterAll(async()=>{vi.unstubAllGlobals();await db?.close()});
it('self attendance: expires, validates roster, preserves manual marks, logs corrections and enforces access',async()=>{
 await db.exec(`insert into talent_org.user_companies(company_id,id,auth_user_id,role,all_campaigns) values('tenant','self-member','${trainer}','FORMADOR',true);insert into talent_org.global_campaigns(id,name) values('self-global','Attendance Campaign');insert into talent_org.company_campaigns(company_id,id,global_campaign_id) values('tenant','self-catalog','self-global');`);
 const day=(await db.query("select (clock_timestamp() at time zone 'America/Lima')::date::text d")).rows[0].d;
 const made=await call('/api/trainings/manual','POST',{requestId:crypto.randomUUID(),name:'Asistencia QR',campaignId:'self-catalog',startDate:day,endDate:day,time:'09:00',schedule:'09:00 - 18:00',modality:'REMOTO',rows:[{dni:'01888111',name:'Participante Uno',phone:'999111222',email:'',workday:'FULL_TIME'},{dni:'01888112',name:'Participante Dos',phone:'999111223',email:'',workday:'FULL_TIME'}],confirm:true},trainer);expect(made.status).toBe(200);groupId=made.data.id;
 const path='/api/attendance-links?group='+groupId+'&date='+day;
 expect((await call(path,'POST',{action:'CREATE',minutes:0},trainer)).data.message).toBe('ATTENDANCE_LINK_INVALID');expect((await call(path,'POST',{action:'CREATE',minutes:30},other)).status).toBe(403);
 const link=await call(path,'POST',{action:'CREATE',minutes:30},trainer);expect(link.status).toBe(200);expect(link.data.link.active).toBe(true);const token=link.data.link.token;
 const publicCall=async(body?:any)=>{const r=await worker.fetch(new Request('https://worker.test/api/public/attendance/'+token,{method:body?'POST':'GET',headers:{Origin:'http://localhost:3000','Content-Type':'application/json','cf-connecting-ip':'192.0.2.1'},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,data:await r.json() as any};};
 const metadata=await publicCall();expect(metadata.data.group).toBe('Asistencia QR');expect(JSON.stringify(metadata)).not.toContain('01888111');
 expect((await publicCall({dni:'99999999'})).data.message).toBe('ATTENDANCE_LINK_IDENTITY');
 const marked=await publicCall({dni:'01888111'});expect(marked.status).toBe(200);expect(marked.data.status).toBe('PRESENTE');expect(marked.data.alreadyRecorded).toBe(false);expect((await publicCall({dni:'01888111'})).data).toMatchObject({alreadyRecorded:true,markedAt:marked.data.markedAt});
 const roster=await call(path,'GET',undefined,trainer);expect(roster.data.participants.find((p:any)=>p.personId==='CAN-01888111').source).toContain('Postulante');expect(roster.data.participants.filter((p:any)=>p.status===null)).toHaveLength(1);
 // Open existing manual correction window in this isolated fixture, independent of wall-clock hour.
 await db.query(`insert into talent.attendance_unlocks(company_id,id,group_id,day_date,requested_by,reason,status) values('tenant','${groupId}--${day}',$1,$2,$3,'Prueba','PENDIENTE')`,[groupId,day,trainer]);
 const unlock=(await db.query('select version from talent.attendance_unlocks where id=$1',[`${groupId}--${day}`])).rows[0];await db.query('select public.talent_unlock_decide($1::uuid,$2,$3,$4,$5,$6,$7::timestamptz)',[admin,'tenant',`${groupId}--${day}`,unlock.version,true,'Prueba controlada',new Date(Date.now()+3600000).toISOString()]);
 const attendancePath='/api/trainings/'+groupId+'/attendance/bulk';
 expect((await call(attendancePath,'POST',{candidateIds:['CAN-01888111'],date:day,dayNumber:1,status:'TARDANZA',attendance:'TARDANZA',notes:'Corrección de hora de ingreso'},trainer)).status).toBe(201);
 const after=await publicCall({dni:'01888111'});expect(after.data.status).toBe('TARDANZA');expect(after.data.alreadyRecorded).toBe(true);
 const updated=await call(path,'GET',undefined,trainer);expect(updated.data.participants.find((p:any)=>p.personId==='CAN-01888111').history).toHaveLength(1);expect(updated.data.participants.find((p:any)=>p.personId==='CAN-01888111').source).toContain('manual');
 expect((await call(path,'POST',{action:'CLOSE'},trainer)).data.link.active).toBe(false);expect((await publicCall({dni:'01888112'})).data.message).toBe('ATTENDANCE_LINK_EXPIRED');
 await call(path,'POST',{action:'CREATE',minutes:1},trainer);await db.query("update talent_private.attendance_links set expires_at=clock_timestamp()-interval '1 second' where group_id=$1 and closed_at is null",[groupId]);expect((await call(path,'GET',undefined,trainer)).data.link.active).toBe(false);
 expect((await db.query('select count(*)::int n from talent.attendance')).rows[0].n).toBe(1);
});
});



