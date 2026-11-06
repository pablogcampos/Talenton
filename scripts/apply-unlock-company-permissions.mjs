import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
const names=['202611060001_unlock_company_permissions.sql'];
const execute=process.argv.includes('--execute');
const api=new URL(process.env.SUPABASE_URL),database=new URL(process.env.SUPABASE_DATABASE_URL),project=api.hostname.split('.')[0];
if(project!=='gvwaqlvphvfzhnhlnuuv'||api.hostname!==project+'.supabase.co'||!(database.hostname==='db.'+project+'.supabase.co'||database.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(database.username)==='postgres.'+project))throw Error('PROJECT_ROUTING_MISMATCH');
const client=new pg.Client({host:database.hostname,port:Number(database.port||5432),user:decodeURIComponent(database.username),password:decodeURIComponent(database.password),database:database.pathname.slice(1),connectionTimeoutMillis:15000,query_timeout:60000,ssl:{ca:readFileSync(process.env.SUPABASE_CA_CERT),rejectUnauthorized:true,servername:database.hostname}});
try{
 await client.connect();if(!client.connection.stream.authorized)throw Error('TLS_NOT_VERIFIED');
 await client.query(execute?'begin':'begin read only');
 if(execute){await client.query("select pg_advisory_xact_lock(hashtextextended('talent:migrations',0))");await client.query("set local lock_timeout='10s'");}
 const report=[];
 for(const name of names){
  const sql=readFileSync('supabase/migrations/'+name,'utf8'),hash=createHash('sha256').update(sql).digest('hex');
  const applied=(await client.query('select sha256 from talent_private.applied_migrations where name=$1',[name])).rows[0];
  if(applied&&applied.sha256!==hash)throw Error('APPLIED_MIGRATION_HASH_MISMATCH');
  if(!applied&&execute){
   await client.query(sql.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,''));
   await client.query('insert into talent_private.applied_migrations(name,sha256) values($1,$2)',[name,hash]);
  }
  report.push({name,status:applied?'already_applied':execute?'applied':'pending',sha256:hash});
 }
 if(execute||report.every(r=>r.status==='already_applied')){
  const check=(await client.query("select has_function_privilege('service_role','public.talent_unlock_decide(uuid,text,text,bigint,boolean,text,timestamptz)','execute') and not has_function_privilege('anon','public.talent_unlock_decide(uuid,text,text,bigint,boolean,text,timestamptz)','execute') as installed")).rows[0];
  if(!check.installed)throw Error('MIGRATION_CHECK_FAILED');
 }
 await client.query(execute?'commit':'rollback');if(execute)await client.query("notify pgrst,'reload schema'");
 console.log(JSON.stringify({project,migrations:report}));
}catch(e){await client.query('rollback').catch(()=>{});console.error('MIGRATION_FAILED: '+(e.code||e.message));process.exitCode=1;}finally{await client.end().catch(()=>{});}
