// Negocio real + SQL real PostgreSQL 17 aislado. Auth y R2 son dobles de prueba.
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import worker,{type Env} from '../src/index';
const admin='40000000-0000-4000-8000-000000000001';
const trainer='40000000-0000-4000-8000-000000000002';
const other='40000000-0000-4000-8000-000000000003';
let db:any;
let failNextCaptureCommit=false;
const objects=new Map<string,Uint8Array>();
const authUsers=new Map<string,any>();
const env={DATA_PROVIDER:'supabase',SUPABASE_URL:'https://sql-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',ALLOWED_ORIGIN:'http://localhost:3000',PRODUCTION_ORIGIN:'https://example.test',MAX_UPLOAD_BYTES:'10485760',ATTENDANCE_TIME_ZONE_OFFSET:'-05:00',CAPTURE_HASH_SECRET:'test-only-key',DOCUMENTS:{put:async(k:string,v:any)=>{objects.set(k,new Uint8Array(await new Response(v).arrayBuffer()))},get:async(k:string)=>objects.has(k)?{body:objects.get(k),httpMetadata:{contentType:'application/pdf'}}:null,delete:async(k:string)=>{objects.delete(k)}}} as unknown as Env;
async function call(path:string,method='GET',body?:any,actor=admin,company?:string){
 const r=await worker.fetch(new Request('https://worker.test'+path,{method,headers:{Origin:'http://localhost:3000',Authorization:'Bearer '+actor,...(company?{'X-Talent-Company':company}:{}),...(!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}),env);
 const data:any=await r.json().catch(()=>({}));
 if(!r.ok)console.log('FLOW ERROR',method,path,r.status,data);
 return {status:r.status,data};
}

describe('User administration with real Worker and PostgreSQL',()=>{
 beforeAll(async()=>{
  env.ORG_ENABLED='true';db=new PGlite();
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
  await db.query('insert into talent_org.global_admins(id,auth_user_id) values ($1,$2)',['test',admin]);
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
    else if(fn?.startsWith('talent_voicebot_')||fn?.startsWith('talent_training_')||fn?.startsWith('talent_offer_')||fn?.startsWith('talent_org_')||fn?.startsWith('talent_survey_')||fn?.startsWith('talent_unlock_')){const keys=Object.keys(body);result=await db.query('select public.'+fn+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') as result',keys.map(k=>['p_rows','p_grants'].includes(k)?JSON.stringify(body[k]):Array.isArray(body[k])?'{'+body[k].join(',')+'}':body[k]&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]));}
    else throw new Error('UNKNOWN_RPC '+fn);
    await db.exec('commit');return fn==='talent_runtime_commit'?new Response(null,{status:204}):Response.json(result.rows[0].result??null);
   }catch(e:any){await db.exec('rollback');console.log('SQL ERROR',e.code,e.message);return Response.json({code:e.code,message:e.message},{status:e.code==='PT409'?409:400});}
  }));
 },30000);
 afterAll(async()=>{vi.unstubAllGlobals();await db?.close()});

 it('creates and activates a generic recruiter with universal access',async()=>{
  const data={username:'generic.test',displayName:'Generic Recruiter',password:'Temporary1234',role:'RECLUTADOR',status:'INACTIVO',module:['SELECCION']};
  expect(await call('/api/users','POST',data)).toMatchObject({status:200});
  const u=(await db.query("select * from talent.profiles where username='generic.test' and not is_context")).rows[0];
  expect(u.document_number).toBeNull();
  expect(await call('/api/users/'+u.id+'/access','PATCH',{...data,status:'ACTIVO'})).toMatchObject({status:200});
  expect((await db.query('select enabled,all_campaigns from talent_org.user_companies where auth_user_id=$1',[u.id])).rows.every((m:any)=>m.enabled&&m.all_campaigns)).toBe(true);
  expect(authUsers.get(u.id).ban_duration).toBe('none');
 });
 it('creates an operations account without campaign restrictions',async()=>{
  expect(await call('/api/users','POST',{username:'ops.test',displayName:'Operations',password:'Temporary1234',dni:'12345678',role:'JEFE_OPERACIONES',module:['OPERACIONES']})).toMatchObject({status:200});
 });

 it('reactivates legacy accounts without duplicating existing permission IDs',async()=>{
  await db.query("update talent.profiles set status='INACTIVO',enabled=false where id=$1",[trainer]);
  expect(await call('/api/users/'+trainer+'/access','PATCH',{role:'FORMADOR',status:'ACTIVO',module:['FORMACION']})).toMatchObject({status:200});
  expect((await db.query("select id from talent.user_modules where company_id='tenant' and user_id=$1 and module='FORMACION'",[trainer])).rows).toEqual([{id:'trainer-module'}]);
 });
 it('rejects malformed optional DNI and unauthorized creation',async()=>{
  const body={username:'invalid.test',displayName:'Invalid',password:'Temporary1234',role:'RECLUTADOR',dni:'123'};
  expect((await call('/api/users','POST',body)).status).toBe(400);
  expect((await call('/api/users','POST',{...body,dni:''},trainer)).status).toBe(403);
 });
});
