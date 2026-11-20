import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
const execute=process.argv.includes('--execute');
const api=new URL(process.env.SUPABASE_URL),database=new URL(process.env.SUPABASE_DATABASE_URL),project=api.hostname.split('.')[0];
if(project!=='gvwaqlvphvfzhnhlnuuv'||api.hostname!==project+'.supabase.co'||!(database.hostname==='db.'+project+'.supabase.co'||database.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(database.username)==='postgres.'+project))throw Error('PROJECT_ROUTING_MISMATCH');
const client=new pg.Client({host:database.hostname,port:Number(database.port||5432),user:decodeURIComponent(database.username),password:decodeURIComponent(database.password),database:database.pathname.slice(1),connectionTimeoutMillis:15000,query_timeout:60000,ssl:{ca:readFileSync(process.env.SUPABASE_CA_CERT),rejectUnauthorized:true,servername:database.hostname}});
try{
 await client.connect();await client.query('begin');await client.query("set local lock_timeout='10s'");await client.query("select pg_advisory_xact_lock(hashtextextended('talent:migrations',0))");
 const name='202611200002_candidate_creation_concurrency.sql',sql=readFileSync('supabase/migrations/'+name,'utf8'),hash=createHash('sha256').update(sql).digest('hex');
 const prior=(await client.query('select sha256 from talent_private.applied_migrations where name=$1',[name])).rows[0];
 if(prior&&prior.sha256!==hash)throw Error('MIGRATION_HASH_MISMATCH');
 const before=(await client.query('select id,enabled,status from talent.profiles where not is_context order by id')).rows;
 if(!prior&&execute){
  const backup=(await client.query("select jsonb_build_object('profiles',(select jsonb_agg(p) from talent.profiles p),'memberships',(select jsonb_agg(m) from talent_org.user_companies m),'modules',(select jsonb_agg(m) from talent.user_modules m)) data")).rows[0].data;
  writeFileSync('supabase/.local/users-before-candidate-concurrency.json',JSON.stringify(backup));
  await client.query(sql.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,''));
  await client.query('insert into talent_private.applied_migrations(name,sha256) values($1,$2)',[name,hash]);
 }
 const after=(await client.query('select id,enabled,status from talent.profiles where not is_context order by id')).rows;
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('ACCOUNT_STATUS_CHANGED');
 if(execute||prior){
  const missing=(await client.query("select count(*)::int n from talent.profiles p cross join talent.companies c where not p.is_context and p.annotations->>'universalCompanyAccess'='true' and c.catalog_managed and c.status='ACTIVA' and c.archived_at is null and not exists(select 1 from talent_org.user_companies m where m.auth_user_id=p.auth_user_id and m.company_id=c.id and m.role=p.role and m.all_campaigns and m.enabled=(p.enabled and p.status='ACTIVO' and p.archived_at is null))")).rows[0].n;
  if(missing)throw Error('UNIVERSAL_ACCESS_INCOMPLETE');
 }
 await client.query(execute?'commit':'rollback');console.log(JSON.stringify({project,status:prior?'already_applied':execute?'applied':'pending',accountStatesPreserved:true}));
}catch(e){await client.query('rollback').catch(()=>{});console.error(e.code||e.message);process.exitCode=1;}finally{await client.end();}
