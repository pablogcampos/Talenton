import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const resolve=(...parts:string[])=>fileURLToPath(new URL('../../'+parts.join('/').slice(3),import.meta.url));
import {PGlite} from '@electric-sql/pglite';
import {newEvaluation,evaluationIssues,validateEvaluationResult} from '../../shared/cinthiaEvaluation';
const admin='71000000-0000-4000-8000-000000000001',recruiter='71000000-0000-4000-8000-000000000002',other='71000000-0000-4000-8000-000000000003';
let db:PGlite,version:string,evaluation:string,lead:string;
const config={...newEvaluation(),name:'Formador',companyId:'eval-ci',positions:['Formador'],objective:'Evaluar formación',competencies:[{id:'explain',name:'Explicación técnica',description:'',category:'Pedagógica',behaviors:'Explica con ejemplos',weight:100,rubric:['No explica','Explicación parcial','Explicación clara','Explicación clara con comprobación'] as [string,string,string,string]}],activities:[{id:'q1',question:'¿Cómo enseñarías un proceso nuevo?',type:'Competencia' as const,essential:true,competencyIds:['explain'],followup:'Pide un ejemplo concreto'}]};
async function rpc(name:string,args:Record<string,unknown>){const keys=Object.keys(args);return (await db.query<{r:any}>('select public.'+name+'('+keys.map((k,i)=>k+'=>$'+(i+1)).join(',')+') r',keys.map(k=>typeof args[k]==='object'?JSON.stringify(args[k]):args[k]))).rows[0].r;}
beforeAll(async()=>{db=new PGlite();await db.exec(readFileSync(resolve('../supabase/tests/bootstrap.sql'),'utf8'));for(const f of readdirSync(resolve('../supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(resolve('../supabase/migrations',f),'utf8'));
 await db.exec(`insert into auth.users values('${admin}'),('${recruiter}'),('${other}');insert into talent.companies(id,name) values('eval-ci','Evaluaciones'),('eval-other','Otra');
 insert into talent.profiles(company_id,id,auth_user_id,username,display_name,role,status) values('eval-ci','${admin}','${admin}','eval.admin','Admin','ADMIN','ACTIVO'),('eval-ci','${recruiter}','${recruiter}','eval.recruiter','Recruiter','RECLUTADOR','ACTIVO'),('eval-other','${other}','${other}','eval.other','Other','RECLUTADOR','ACTIVO');
 insert into talent.user_modules(company_id,id,user_id,module) select company_id,id||':selection',id,'SELECCION' from talent.profiles;
 insert into public.voicebot_leads(external_id,phone,full_name,owner_auth_id) values('eval-lead','999111222','Lead','${recruiter}');`);
 lead=(await db.query<{id:string}>('select id from public.voicebot_leads')).rows[0].id;
},30000);
afterAll(async()=>db.close());
it('validates weighted evidence, rejects invented quotes and never averages absent evidence',()=>{
 expect(evaluationIssues(config)).toEqual([]);expect(evaluationIssues({...config,competencies:[{...config.competencies[0],weight:50}]})).toContain('Los pesos deben sumar 100%.');
 const r={competencyId:'explain',score:3,evidence:[{segmentId:'a',quote:'Uso ejemplos'}],justification:'Explica una estrategia',strengths:[],followup:[],unverified:[]};const t=[{id:'a',speaker:'candidate',text:'Uso ejemplos y verifico comprensión.'}];
 expect(validateEvaluationResult(config,{competencies:[r]},t).global).toBe(3);
 expect(()=>validateEvaluationResult(config,{competencies:[{...r,evidence:[{segmentId:'a',quote:'Soy excelente'}]}]},t)).toThrow('CINTHIA_EVIDENCE_INVALID');
 expect(validateEvaluationResult(config,{competencies:[{...r,score:null,evidence:[]}]},t).global).toBeNull();
});
it('creates a draft; company permissions and optimistic revision protect edits',async()=>{
 const r=await rpc('talent_cinthia_evaluation_save',{p_actor:admin,p_action:'SAVE',p_data:{config}});evaluation=r.evaluation.id;version=r.version.id;
 expect((await rpc('talent_cinthia_catalog',{p_actor:other})).items).toEqual([]);
 await expect(rpc('talent_cinthia_evaluation_save',{p_actor:recruiter,p_action:'SAVE',p_id:evaluation,p_data:{config,revision:1}})).rejects.toMatchObject({code:'42501'});
 await expect(rpc('talent_cinthia_evaluation_save',{p_actor:admin,p_action:'SAVE',p_id:evaluation,p_data:{config,revision:2}})).rejects.toThrow('CINTHIA_CONFLICT');
});
it('drafts cannot be assigned; published versions remain immutable',async()=>{
 await expect(rpc('talent_cinthia_assign',{p_actor:recruiter,p_version:version,p_lead:lead,p_token:'a'.repeat(64)})).rejects.toThrow('CINTHIA_INVALID_STATE');
 await rpc('talent_cinthia_evaluation_save',{p_actor:admin,p_action:'PUBLISH',p_id:evaluation,p_data:{revision:1}});
 await expect(db.query('update public.cinthia_evaluation_versions set config=$1 where id=$2',[JSON.stringify(config),version])).rejects.toThrow('CINTHIA_VERSION_IMMUTABLE');
 const r=await rpc('talent_cinthia_evaluation_save',{p_actor:admin,p_action:'SAVE',p_id:evaluation,p_data:{config:{...config,name:'Formador v2'}}});expect(r.version.number).toBe(2);expect(r.version.id).not.toBe(version);
});
it('assignment is idempotent, preserves the lead and snapshots the published questions',async()=>{
 const a=await rpc('talent_cinthia_assign',{p_actor:recruiter,p_version:version,p_lead:lead,p_token:'a'.repeat(64)});
 const b=await rpc('talent_cinthia_assign',{p_actor:recruiter,p_version:version,p_lead:lead,p_token:'b'.repeat(64)});expect(a.id).toBe(b.id);
 await expect(rpc('talent_cinthia_subject',{p_actor:other,p_company:'eval-ci',p_lead:lead})).rejects.toMatchObject({code:'42501'});
 const s=await rpc('talent_cinthia_session',{p_token:a.token,p_action:'BEGIN',p_data:{clientHash:'c'.repeat(64),consent:true,consentVersion:'cinthia-voice-v1',model:'test'}});expect(s.questions).toEqual([config.activities[0].question]);expect(s.evaluation_config.name).toBe('Formador');
 expect((await rpc('talent_cinthia_subject',{p_actor:recruiter,p_company:'eval-ci',p_lead:lead}))).toHaveLength(1);
 expect((await rpc('talent_cinthia_analytics',{p_actor:admin})).assigned).toBe(1);
 expect((await rpc('talent_cinthia_detail',{p_actor:admin,p_lead:lead})).invitations).toHaveLength(0);
 expect(await rpc('talent_cinthia_transcript',{p_actor:other,p_lead:lead})).toHaveLength(0);
});
it('manual Staff candidate shares the existing person and application; another company cannot assign',async()=>{
 await db.exec(`insert into talent.persons(company_id,id,full_name,phone) values('eval-ci','staff-person','Staff QA','999111333');
 insert into talent.campaigns(company_id,id,code,title,status,vacancies) values('eval-ci','staff-campaign','STAFF-QA','Staff','ACTIVA',1);
 insert into talent.applications(company_id,id,person_id,campaign_id,recruiter_id,status,stage,application_date) values('eval-ci','staff-app','staff-person','staff-campaign','${recruiter}','ACTIVA','Captación',current_date);`);
 const inv=await rpc('talent_cinthia_assign',{p_actor:recruiter,p_version:version,p_person:'staff-person',p_token:'d'.repeat(64)});
 expect(inv.person_id).toBe('staff-person');expect(inv.application_id).toBe('staff-app');expect(inv.lead_id).toBeNull();
 await expect(rpc('talent_cinthia_assign',{p_actor:other,p_version:version,p_person:'staff-person',p_token:'e'.repeat(64)})).rejects.toMatchObject({code:'42501'});
 expect((await db.query<{n:number}>('select count(*) n from talent.persons')).rows[0].n).toBe(1);
 expect(await rpc('talent_cinthia_subject',{p_actor:recruiter,p_company:'eval-ci',p_person:'staff-person'})).toHaveLength(1);
});
it('completion queues a report and human rubric scores are audited without changing candidate decisions',async()=>{
 const session=(await db.query<{id:string;invitation_id:string}>('select id,invitation_id from public.cinthia_sessions limit 1')).rows[0];
 await db.query("update public.cinthia_sessions set state='COMPLETED',started_at=now()-interval '1 minute',completed_at=now(),duration_seconds=60 where id=$1",[session.id]);
 await db.query("update public.cinthia_invitations set status='COMPLETED',started_at=now()-interval '1 minute',completed_at=now() where id=$1",[session.invitation_id]);
 const job=await rpc('talent_cinthia_report_job',{p_session:session.id});expect(job.config.name).toBe('Formador');
 expect(await rpc('talent_cinthia_report_job',{p_session:session.id})).toBeNull();
 await rpc('talent_cinthia_report_job',{p_session:session.id,p_result:{competencies:[{competencyId:'explain',score:3}],global:3,coverage:100},p_model:'test'});
 await expect(rpc('talent_cinthia_invitation_action',{p_actor:recruiter,p_id:session.invitation_id,p_action:'REVIEW',p_data:{notes:'Revision',scores:{explain:5}}})).rejects.toThrow('CINTHIA_INVALID');
 await rpc('talent_cinthia_invitation_action',{p_actor:recruiter,p_id:session.invitation_id,p_action:'REVIEW',p_data:{notes:'Revisar ejemplos',scores:{explain:2}}});
 const calibration=await rpc('talent_cinthia_calibration',{p_actor:admin});expect(Number(calibration[0].mean_absolute_difference)).toBe(1);
 await expect(rpc('talent_cinthia_assign',{p_actor:recruiter,p_version:version,p_lead:lead,p_token:'f'.repeat(64),p_repeat:true})).rejects.toThrow('CINTHIA_REPEAT_AUTH_REQUIRED');
 expect((await rpc('talent_cinthia_assign',{p_actor:admin,p_version:version,p_lead:lead,p_token:'f'.repeat(64),p_repeat:true})).id).not.toBe(session.invitation_id);
});
it('runtime edits require admin and test executions stay outside candidate metrics',async()=>{
 const runtime=await rpc('talent_cinthia_runtime',{p_actor:admin});
 expect(runtime.canEdit).toBe(true);
 await expect(rpc('talent_cinthia_runtime',{p_actor:recruiter,p_config:runtime.config,p_revision:runtime.revision})).rejects.toMatchObject({code:'42501'});
 const before=await rpc('talent_cinthia_analytics',{p_actor:admin});
 const draft=(await rpc('talent_cinthia_catalog',{p_actor:admin})).items[0].versions.find((v:any)=>!v.published_at);
 const test=await rpc('talent_cinthia_assign',{p_actor:admin,p_version:draft.id,p_test:true,p_token:'9'.repeat(64)});
 expect(test.person_id).toBeNull();expect(test.lead_id).toBeNull();
 expect((await rpc('talent_cinthia_analytics',{p_actor:admin})).assigned).toBe(before.assigned);
 const metadata=await rpc('talent_cinthia_public_metadata',{p_token:test.token});
 expect(metadata.evaluationTest).toBe(true);expect(metadata).not.toHaveProperty('result');
 expect(await rpc('talent_cinthia_test_history',{p_actor:admin,p_evaluation:evaluation})).toHaveLength(1);
 await expect(rpc('talent_cinthia_test_history',{p_actor:recruiter,p_evaluation:evaluation})).rejects.toMatchObject({code:'42501'});
});
