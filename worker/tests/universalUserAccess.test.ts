import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
let db:PGlite;const admin='88000000-0000-4000-8000-000000000001',user='88000000-0000-4000-8000-000000000002';
beforeAll(async()=>{db=new PGlite();await db.exec(readFileSync('../supabase/tests/bootstrap.sql','utf8'));for(const f of readdirSync('../supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('../supabase/migrations/'+f,'utf8'));
await db.exec(`insert into auth.users values('${admin}'),('${user}');insert into talent.companies(id,name,catalog_managed) values('home','Home',false),('one','One',true),('two','Two',true);
insert into talent.profiles(company_id,id,auth_user_id,username,display_name,role,status) values('home','${admin}','${admin}','admin.test','Admin','ADMIN','ACTIVO'),('home','${user}','${user}','trainer.test','Trainer','FORMADOR','ACTIVO');
insert into talent_org.global_admins(id,auth_user_id) values('admin','${admin}');
insert into talent.user_modules(company_id,id,user_id,module) values('home','trainer-module','${user}','FORMACION');`);
},30000);
afterAll(async()=>db.close());
it('server grants every company to trainer without selecting campaigns and preserves sections',async()=>{
const rev=(await db.query<any>("select revision from talent.tenant_revisions where company_id='home'")).rows[0]?.revision||0;
await db.query("select public.talent_org_user_commit($1,'home',$2,'[]',array[]::text[],$3,'[]')",[admin,rev,user]);
const grants=(await db.query<any>('select role,enabled,all_campaigns from talent_org.user_companies where auth_user_id=$1',[user])).rows;
expect(grants).toHaveLength(5);expect(grants.every(g=>g.role==='FORMADOR'&&g.enabled&&g.all_campaigns)).toBe(true);
const modules=(await db.query<any>('select distinct module from talent.user_modules where user_id=$1 and archived_at is null',[user])).rows;expect(modules).toEqual([{module:'FORMACION'}]);
});
it('new companies inherit access, inactive users stay inactive and no global admin is granted',async()=>{
await db.exec(`update talent.profiles set enabled=false,status='INACTIVO' where id='${user}' and not is_context;insert into talent.companies(id,name,catalog_managed) values('three','Three',true);`);
const rows=(await db.query<any>('select * from talent_org.user_companies where auth_user_id=$1',[user])).rows;expect(rows).toHaveLength(6);expect(rows.every(r=>!r.enabled)).toBe(true);
expect((await db.query<any>('select * from talent_org.global_admins where auth_user_id=$1',[user])).rows).toHaveLength(0);
expect((await db.query<any>('select public.talent_session_profile($1) p',[user])).rows[0].p).toBeNull();
});
it('non administrators cannot invoke provisioning',async()=>{await expect(db.query("select public.talent_org_user_commit($1::uuid,'home',0,'[]',array[]::text[],$2::text,'[]')",[user,user])).rejects.toMatchObject({code:'42501'});});
