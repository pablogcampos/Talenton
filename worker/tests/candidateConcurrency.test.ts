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

describe('Candidate registration concurrency',()=>{
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
    else if(fn==='talent_candidate_create_commit'||fn?.startsWith('talent_voicebot_')||fn?.startsWith('talent_training_')||fn?.startsWith('talent_offer_')||fn?.startsWith('talent_org_')||fn?.startsWith('talent_survey_')||fn?.startsWith('talent_unlock_')){const keys=Object.keys(body);result=await db.query('select public.'+fn+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') as result',keys.map(k=>['p_rows','p_grants'].includes(k)?JSON.stringify(body[k]):Array.isArray(body[k])?'{'+body[k].join(',')+'}':body[k]&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]));}
    else throw new Error('UNKNOWN_RPC '+fn);
    await db.exec('commit');return fn==='talent_runtime_commit'?new Response(null,{status:204}):Response.json(result.rows[0].result??null);
   }catch(e:any){await db.exec('rollback');console.log('SQL ERROR',e.code,e.message);return Response.json({code:e.code,message:e.message},{status:e.code==='PT409'?409:400});}
  }));
 },30000);
 afterAll(async()=>{vi.unstubAllGlobals();await db?.close()});

 it('creates campaign for candidate registration',async()=>{
 const r=await call('/api/campaigns','POST',{code:'CI-CONCURRENT',title:'Concurrent registration',company:'CI',area:'Ventas',vacancies:50,status:'EN_PROCESO',responsibles:[{userId:admin,target:50}],sources:[],processType:'EXTERNO',managementType:'PRESENCIAL',location:'Lima',shift:'09:00-16:00'});expect(r.status).toBe(201);campaignId=r.data.id;
 });
 it('registers independent candidates from the same stale snapshot without conflict or overwrite',async()=>{
 const stores=await Promise.all(Array.from({length:5},()=>new RelationalRuntime(env,admin).load()));
 for(let i=0;i<stores.length;i++){const dni='8888000'+i;await stores[i].write('candidates/CAN-'+dni,{dni,fullName:'Parallel '+i,campaignId,recruiterId:admin,selection:{stage:'NUEVO',status:'ACTIVO'}});stores[i].markCandidateCreation();}
 // Commit all after snapshots were read; every later commit sees a changed tenant revision.
 for(const s of stores)await s.commit();
 expect((await db.query("select count(*)::int n from talent.persons where company_id='tenant' and document_number like '8888000%' ")).rows[0].n).toBe(5);
 });
 it('two requests for the same DNI never overwrite the winner',async()=>{
 const a=await new RelationalRuntime(env,admin).load(),b=await new RelationalRuntime(env,admin).load();
 for(const [s,name] of [[a,'Winner'],[b,'Loser']] as const){await s.write('candidates/CAN-88881111',{dni:'88881111',fullName:name,campaignId,recruiterId:admin,selection:{stage:'NUEVO',status:'ACTIVO'}});s.markCandidateCreation();}
 await a.commit();await expect(b.commit()).rejects.toMatchObject({code:'DUPLICATE_CANDIDATE'});
 expect((await db.query("select full_name from talent.persons where company_id='tenant' and id='CAN-88881111'")).rows[0].full_name).toBe('Winner');
 });
 it('unrelated tenant changes do not reject registration through worker HTTP',async()=>{
 const r=await call('/api/candidates','POST',{dni:'88882222',fullName:'HTTP registration',campaignId,phone:'999111222',recruiterId:admin,age:25});expect(r.status).toBe(201);
 });
 it('existing candidate updates still reject stale snapshots',async()=>{
 const a=await new RelationalRuntime(env,admin).load(),b=await new RelationalRuntime(env,admin).load();await a.write('candidates/CAN-88881111',{fullName:'Updated winner'});await b.write('candidates/CAN-88881111',{fullName:'Stale loser'});await a.commit();await expect(b.commit()).rejects.toMatchObject({status:409});
 });
 it('registration rejects roles without selection permission',async()=>{
 const r=await call('/api/candidates','POST',{dni:'88883333',fullName:'Forbidden',campaignId},trainer);expect(r.status).toBe(403);
 });

 it('checks recruiter campaign access at commit and accepts assigned recruiters',async()=>{
 await db.query("update talent.profiles set role='RECLUTADOR' where id=$1",[trainer]);await db.query("update talent.user_modules set module='SELECCION' where user_id=$1",[trainer]);
 const denied=await new RelationalRuntime(env,trainer).load();await denied.write('candidates/CAN-88884444',{dni:'88884444',fullName:'Denied',campaignId,recruiterId:trainer,selection:{stage:'NUEVO',status:'ACTIVO'}});denied.markCandidateCreation();await expect(denied.commit()).rejects.toBeTruthy();
 await db.query("insert into talent.campaign_assignments(company_id,id,campaign_id,user_id,assignment_kind) values('tenant','recruiter-assignment',$1,$2,'RESPONSIBLE')",[campaignId,trainer]);
 expect((await call('/api/candidates','POST',{dni:'88885555',fullName:'Recruiter registration',campaignId},trainer)).status).toBe(201);
 });
});
