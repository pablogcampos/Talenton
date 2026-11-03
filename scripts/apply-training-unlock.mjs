import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
const name='202611030001_training_unlock_renewal.sql';
const sql=readFileSync('supabase/migrations/'+name,'utf8');
const sha256=createHash('sha256').update(sql).digest('hex');
const execute=process.argv.includes('--execute');
const api=new URL(process.env.SUPABASE_URL);
const database=new URL(process.env.SUPABASE_DATABASE_URL);
const project=api.hostname.split('.')[0];
if(project!=='gvwaqlvphvfzhnhlnuuv'||api.hostname!==project+'.supabase.co'||
 !(database.hostname==='db.'+project+'.supabase.co'||(database.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(database.username)==='postgres.'+project)))throw new Error('PROJECT_ROUTING_MISMATCH');
const client=new pg.Client({host:database.hostname,port:Number(database.port||5432),user:decodeURIComponent(database.username),password:decodeURIComponent(database.password),database:database.pathname.slice(1),connectionTimeoutMillis:15000,query_timeout:30000,ssl:{ca:readFileSync(process.env.SUPABASE_CA_CERT),rejectUnauthorized:true,servername:database.hostname}});
try{
 await client.connect();
 if(!client.connection.stream.authorized)throw new Error('TLS_NOT_VERIFIED');
 await client.query(execute?'begin':'begin read only');
 if(execute){
  await client.query("select pg_advisory_xact_lock(hashtextextended('talent:migrations',0))");
  await client.query("set local lock_timeout='10s'");
 }
 const applied=(await client.query('select sha256 from talent_private.applied_migrations where name=$1',[name])).rows[0];
 if(applied&&applied.sha256!==sha256)throw new Error('APPLIED_MIGRATION_HASH_MISMATCH');
 if(!applied&&execute){
  const previous=(await client.query("select pg_get_functiondef('talent_private.unlock_guard()'::regprocedure) as definition")).rows[0].definition;
  mkdirSync('supabase/.local',{recursive:true});
  writeFileSync('supabase/.local/unlock-guard-before-'+Date.now()+'.sql',previous,{flag:'wx',mode:0o600});
  await client.query(sql.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,''));
  await client.query('insert into talent_private.applied_migrations(name,sha256) values($1,$2)',[name,sha256]);
 }
 if(applied||execute){
  const check=(await client.query("select to_regprocedure('public.talent_unlock_request(uuid,text,text,date,text)') is not null as exists, has_function_privilege('anon','public.talent_unlock_request(uuid,text,text,date,text)','EXECUTE') as anon, has_function_privilege('authenticated','public.talent_unlock_request(uuid,text,text,date,text)','EXECUTE') as authenticated,has_function_privilege('service_role','public.talent_unlock_request(uuid,text,text,date,text)','EXECUTE') as service")).rows[0];
  if(!check.exists||check.anon||check.authenticated||!check.service)throw new Error('RPC_PERMISSION_CHECK_FAILED');
  console.log('RPC y permisos verificados.');
 }
 await client.query(execute?'commit':'rollback');
 if(execute)await client.query("notify pgrst,'reload schema'");
 console.log(JSON.stringify({project,migration:name,status:applied?'already_applied':execute?'applied':'pending',sha256}));
}catch(error){
 await client.query('rollback').catch(()=>{});
 console.error('MIGRATION_FAILED: '+(error.code||error.message));process.exitCode=1;
}finally{await client.end().catch(()=>{});}
