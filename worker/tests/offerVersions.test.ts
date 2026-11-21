import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
let db:PGlite;const admin='78000000-0000-4000-8000-000000000001',other='78000000-0000-4000-8000-000000000002';
async function rpc(n:string,args:any){const k=Object.keys(args);return (await db.query<any>('select public.'+n+'('+k.map((v,i)=>v+'=>$'+(i+1)).join(',')+') r',k.map(v=>args[v]))).rows[0].r;}
const draft=(id?:string,revision?:number,actor=admin)=>rpc('talent_offer_draft',{p_actor:actor,p_company:'offer-ci',p_campaign:'campaign',p_title:'Propuesta',p_content:'Contenido contractual de prueba suficiente.',p_workday:'FULL_TIME',p_id:id||null,p_revision:revision??null});
const publish=(t:any)=>rpc('talent_offer_publish',{p_actor:admin,p_company:'offer-ci',p_id:t.id,p_revision:t.revision});
beforeAll(async()=>{db=new PGlite();await db.exec(readFileSync('../supabase/tests/bootstrap.sql','utf8'));for(const f of readdirSync('../supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('../supabase/migrations/'+f,'utf8'));await db.exec(`insert into auth.users values('${admin}'),('${other}');insert into talent.companies(id,name) values('offer-ci','Test');insert into talent.profiles(company_id,id,auth_user_id,username,display_name,role,status) values('offer-ci','${admin}','${admin}','offer.admin','Admin','ADMIN','ACTIVO'),('offer-ci','${other}','${other}','offer.other','Recruiter','RECLUTADOR','ACTIVO');insert into talent.user_modules(company_id,id,user_id,module) select company_id,id||':selection',id,'SELECCION' from talent.profiles where company_id='offer-ci';insert into talent.campaigns(company_id,id,code,title,status,vacancies) values('offer-ci','campaign','OFFER','Campaign','ACTIVA',1);`);},30000);
afterAll(async()=>db.close());
it('keeps drafts separate, edits in place, publishes once and archives only the previous official',async()=>{
 let first=await draft();expect(first.status).toBe('DRAFT');first=await publish(first);expect(first.version).toBe(1);
 let next=await draft(),stale=await draft();const id=next.id;next=await draft(id,next.revision);expect(next.id).toBe(id);expect(next.revision).toBe(2);
 await expect(draft(id,1)).rejects.toThrow('OFFER_DRAFT_CHANGED');
 expect((await db.query<any>("select id from talent_offers.templates where status='PUBLISHED'")).rows[0].id).toBe(first.id);
 next=await publish(next);expect(next.version).toBe(2);expect((await publish(next)).id).toBe(next.id);
 await expect(publish(stale)).rejects.toThrow('OFFER_OFFICIAL_CHANGED');await expect(draft(next.id,next.revision)).rejects.toThrow('OFFER_DRAFT_CHANGED');
 expect((await db.query<any>('select status from talent_offers.templates where id=$1',[first.id])).rows[0].status).toBe('REPLACED');
 const cat=await rpc('talent_offer_catalog',{p_actor:admin,p_company:'offer-ci'});expect(cat.templates.find((t:any)=>t.id===next.id).publisherName).toBe('Admin');
});
it('restricts publication functions and template changes to authorized creators',async()=>{
 await expect(draft(undefined,undefined,other)).rejects.toMatchObject({code:'42501'});
 expect((await db.query<any>("select has_function_privilege('anon','public.talent_offer_publish(uuid,text,uuid,integer)','execute') a")).rows[0].a).toBe(false);
 const t=await draft();await expect(rpc('talent_offer_assign',{p_actor:admin,p_company:'offer-ci',p_group:'missing',p_template:t.id})).rejects.toThrow('OFFER_INVALID_TEMPLATE');
});
it('assigns only the official version and preserves a signed snapshot after publishing',async()=>{
 await db.exec(`insert into talent.training_groups(company_id,id,campaign_id,code,name,start_date,theory_end_date,theory_days,schedule,modality,status) values('offer-ci','group','campaign','G','Test','2026-12-01','2026-12-05',5,'09:00-16:00','PRESENCIAL','EN_CAPACITACION');insert into talent.persons(company_id,id,full_name,annotations) values('offer-ci','person','Test','{"workSchedule":"Fulltime"}');insert into talent.applications(company_id,id,person_id,campaign_id,recruiter_id,status,stage,application_date) values('offer-ci','app','person','campaign','${admin}','ACTIVA','CAPACITACION','2026-11-20');insert into talent.participants(company_id,id,group_id,application_id,status,joined_at) values('offer-ci','participant','group','app','ACTIVO','2026-11-20');`);
 const args={p_actor:admin,p_company:'offer-ci',p_group:'group'};
 const plan=await rpc('talent_offer_workday_plan',args);const official=(await db.query<any>("select id from talent_offers.templates where status='PUBLISHED'")).rows[0].id;expect(plan.participants[0].templateId).toBe(official);
 await rpc('talent_offer_assign_workdays',{...args,p_hash:plan.hash});
 await db.exec("update talent_offers.documents set signed_at=now() where participant_id='participant'");
 const before=(await db.query<any>('select to_jsonb(d) value from talent_offers.documents d')).rows[0].value;
 await publish(await draft());
 const updated=await rpc('talent_offer_workday_plan',args);expect(updated.participants[0].status).toBe('SIGNED');await rpc('talent_offer_assign_workdays',{...args,p_hash:updated.hash});
 expect((await db.query<any>('select to_jsonb(d) value from talent_offers.documents d')).rows[0].value).toEqual(before);
});
