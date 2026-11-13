import {beforeAll,afterAll,it,expect,vi,afterEach} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {cinthiaPreview,handleCinthia} from '../src/cinthia';
import {LiveTranscript,liveAvailable,liveSetup,hashSessionKey} from '../src/cinthiaLive';
vi.mock('../src/supabaseSession',()=>({relationalSession:async()=>({authUserId:admin})}));
const admin='70000000-0000-4000-8000-000000000001',recruiter='70000000-0000-4000-8000-000000000002',other='70000000-0000-4000-8000-000000000003',trainer='70000000-0000-4000-8000-000000000004';
let db:PGlite,lead:string;
async function rpc(name:string,args:Record<string,unknown>){const keys=Object.keys(args);const r=await db.query<{result:any}>('select public.'+name+'('+keys.map((k,i)=>k+'=>$'+(i+1)).join(',')+') result',keys.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k]));return r.rows[0].result;}
const list=(filters={})=>rpc('talent_cinthia_list',{p_actor:admin,p_filters:filters});
const manage=async(action:string,extras={})=>{const latest=(await db.query<{id:string}>('select id from public.cinthia_invitations where lead_id=$1 order by created_at desc,id desc limit 1',[lead])).rows[0];return rpc('talent_cinthia_manage',{p_actor:admin,p_lead:lead,p_action:action,p_token:'a'.repeat(64),p_test:true,p_invitation:latest?.id??null,...extras});};
beforeAll(async()=>{
 db=new PGlite();await db.exec(readFileSync(resolve('../supabase/tests/bootstrap.sql'),'utf8'));
 for(const f of readdirSync(resolve('../supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(resolve('../supabase/migrations',f),'utf8'));
 await db.exec(`insert into auth.users values ('${admin}'),('${recruiter}'),('${other}'),('${trainer}');insert into talent.companies(id,name) values ('cinthia-ci','Cinthia CI');
 insert into talent.profiles(company_id,id,auth_user_id,username,display_name,role,status) values
 ('cinthia-ci','${admin}','${admin}','ci.admin','CI Admin','ADMIN','ACTIVO'),
 ('cinthia-ci','${recruiter}','${recruiter}','ci.recruiter','CI Recruiter','RECLUTADOR','ACTIVO'),
 ('cinthia-ci','${other}','${other}','ci.other','CI Other','RECLUTADOR','ACTIVO'),
 ('cinthia-ci','${trainer}','${trainer}','ci.trainer','CI Trainer','FORMADOR','ACTIVO');
 insert into talent.user_modules(company_id,id,user_id,module) select 'cinthia-ci',id||':selection',id,'SELECCION' from talent.profiles where company_id='cinthia-ci' and role<>'FORMADOR';
 insert into public.voicebot_leads(external_id,phone,full_name,received_at,payload) select 'cinthia-'||n,'999111222','Lead '||n,now()-n*interval '1 minute',jsonb_build_object('dni', '70'||lpad(n::text,6,'0')) from generate_series(1,55)n;`);
 lead=(await db.query<{id:string}>("select id from public.voicebot_leads where external_id='cinthia-1'")).rows[0].id;
},30000);
afterAll(async()=>{await db?.close();});afterEach(()=>vi.unstubAllGlobals());
it('lists only Voicebot, newest first, full counts and second page; searches DNI',async()=>{
 const d=await list();expect(d.total).toBe(55);expect(d.items).toHaveLength(50);expect(d.items[0].id).toBe(lead);expect(d.counts.NOT_SENT).toBe(55);
 expect((await list({page:1})).items).toHaveLength(5);expect((await list({search:'70000001'})).items[0].id).toBe(lead);
 expect((await list({from:'2099-01-01'})).total).toBe(0);expect((await list({interviewFrom:'2000-01-01'})).total).toBe(0);
 await expect(list({from:'2026-12-01',to:'2026-01-01'})).rejects.toThrow('CINTHIA_INVALID');
});
it('production cannot prepare invitations; local test prepare is idempotent and keeps lead untouched',async()=>{
 await expect(manage('PREPARE',{p_test:false})).rejects.toThrow('CINTHIA_UNAVAILABLE');
 const before=(await db.query('select to_jsonb(l) data from public.voicebot_leads l where id=$1',[lead])).rows[0];
 const a=await manage('PREPARE'),b=await manage('PREPARE',{p_token:'b'.repeat(64)});expect(a.id).toBe(b.id);expect(a.token).toHaveLength(64);
 expect((await db.query('select to_jsonb(l) data from public.voicebot_leads l where id=$1',[lead])).rows[0]).toEqual(before);
 expect((await list({state:'PREPARED'})).total).toBe(1);
 await expect(db.query("insert into public.cinthia_invitations(lead_id,token,prepared_by) values ($1,$2,$3)",[lead,'c'.repeat(64),admin])).rejects.toMatchObject({code:'23505'});
});
it('WhatsApp opening is not sending; manual confirmation is idempotent and audited',async()=>{
 await expect(manage('SENT',{p_invitation:'70000000-0000-4000-8000-999999999999'})).rejects.toThrow('CINTHIA_INVALID_STATE');
 expect((await manage('WHATSAPP_OPENED')).status).toBe('PREPARED');
 expect((await manage('SENT')).status).toBe('PENDING');await manage('SENT');
 const d=await rpc('talent_cinthia_detail',{p_actor:recruiter,p_lead:lead});expect(d.events.map((e:any)=>e.action)).toEqual(['PREPARED','WHATSAPP_OPENED','SENT']);expect(d.invitations[0].sent_by).toBe(admin);
});
it('public payload has no PII; test token cannot be used on production; expiry audit and renewal',async()=>{
 await expect(rpc('talent_cinthia_public',{p_token:'a'.repeat(64)})).rejects.toThrow('CINTHIA_NOT_FOUND');
 const p=await rpc('talent_cinthia_public',{p_token:'a'.repeat(64),p_test:true});expect(Object.keys(p).sort()).toEqual(['completed_at','expires_at','serviceAvailable','status','test_mode']);expect(p.serviceAvailable).toBe(false);
 await db.query("update public.cinthia_invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where lead_id=$1",[lead]);
 expect((await list({state:'CLOSED'})).total).toBe(1);await list();
 const events=await db.query("select * from public.cinthia_events where action='EXPIRED'");expect(events.rows).toHaveLength(1);
 expect((await manage('PREPARE',{p_token:'b'.repeat(64)})).token).toBe('b'.repeat(64));
 expect((await rpc('talent_cinthia_public',{p_token:'a'.repeat(64),p_test:true})).status).toBe('EXPIRED');
});
it('cancellation invalidates token and refuses restart',async()=>{
 await manage('CANCELLED');expect((await rpc('talent_cinthia_public',{p_token:'b'.repeat(64),p_test:true})).status).toBe('CANCELLED');
 await expect(manage('PREPARE')).rejects.toThrow('CINTHIA_INVALID_STATE');
});
it('permissions restrict writes and filters; trainer and anonymous cannot read',async()=>{
 await expect(rpc('talent_cinthia_list',{p_actor:trainer})).rejects.toMatchObject({code:'42501'});
 await expect(rpc('talent_cinthia_detail',{p_actor:null,p_lead:lead})).rejects.toMatchObject({code:'42501'});
 await db.query('update public.voicebot_leads set owner_auth_id=$1 where id=$2',[recruiter,lead]);
 await expect(manage('SENT',{p_actor:other})).rejects.toMatchObject({code:'42501'});
 await expect(rpc('talent_cinthia_list',{p_actor:other,p_filters:{owner:recruiter}})).rejects.toMatchObject({code:'42501'});
 expect((await rpc('talent_cinthia_list',{p_actor:other})).canFilterOwner).toBe(false);
 const perms=(await db.query("select has_table_privilege('anon','public.cinthia_invitations','SELECT') a,has_table_privilege('authenticated','public.cinthia_invitations','UPDATE') b,has_function_privilege('anon','public.talent_cinthia_public(text,boolean)','EXECUTE') c")).rows[0];expect(perms).toEqual({a:false,b:false,c:false});
});
it('worker preview requires localhost AND flag; caller cannot enable production or fake start',async()=>{
 const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'test',CINTHIA_DEV_PREVIEW:'true'};
 expect(cinthiaPreview(new Request('https://production.test'),env)).toBe(false);expect(cinthiaPreview(new Request('http://localhost:8787'),{})).toBe(false);expect(cinthiaPreview(new Request('http://localhost:8787'),env)).toBe(true);
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({status:'PENDING',serviceAvailable:false})));
 await expect(handleCinthia(new Request('https://production.test/api/cinthia/leads/'+lead,{method:'POST',body:JSON.stringify({action:'PREPARE',preview:true})}),env)).rejects.toMatchObject({status:503,code:'CINTHIA_UNAVAILABLE'});expect(fetch).not.toHaveBeenCalled();
 await expect(handleCinthia(new Request('http://localhost:8787/api/public/cinthia/'+'a'.repeat(64)+'/start',{method:'POST'}),env)).rejects.toMatchObject({status:503,code:'CINTHIA_UNAVAILABLE'});
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('Live requires versioned consent, binds a client, blocks concurrent sessions and returns no pre-completion data',async()=>{
 const token='d'.repeat(64),hash='e'.repeat(64),conn='70000000-0000-4000-8000-000000000099';
 await db.query("insert into public.cinthia_invitations(lead_id,token,prepared_by,test_mode) select id,$1,$2,true from public.voicebot_leads where external_id='cinthia-2'",[token,admin]);
 const call=(action:string,data={},test=true)=>rpc('talent_cinthia_session',{p_token:token,p_action:action,p_data:{clientHash:hash,connectionId:conn,...data},p_test:test});
 await expect(call('BEGIN',{consent:true,model:'gemini-3.8-live'})).rejects.toThrow('CINTHIA_CONSENT_REQUIRED');
 await expect(call('BEGIN',{},false)).rejects.toThrow('CINTHIA_NOT_FOUND');
 const start=await call('BEGIN',{consent:true,consentVersion:'cinthia-voice-v1',model:'gemini-3.8-live'});
 await expect(call('CLAIM',{clientHash:'f'.repeat(64)})).rejects.toThrow('CINTHIA_NOT_FOUND');
 await call('CLAIM');await expect(call('CLAIM')).rejects.toThrow('CINTHIA_SESSION_BUSY');await call('READY');
 expect(await call('RECEIPT')).toEqual({completed:false});
 await expect(call('FINISH',{turnComplete:true})).rejects.toThrow('CINTHIA_INCOMPLETE');
 const transcript=new LiveTranscript();transcript.append('cinthia','Tu experiencia?',true);transcript.append('candidate','Atención al cliente');
 await call('SAVE',{transcript:transcript.segments});await expect(call('FINISH',{turnComplete:true})).rejects.toThrow('CINTHIA_INCOMPLETE');
 transcript.turn(false);await call('SAVE',{transcript:transcript.segments});
 await call('INTERRUPT',{code:'TEST_DISCONNECT'});await call('CLAIM');const resumed=await call('READY');expect(resumed.transcript).toHaveLength(2);expect(resumed.errors).toHaveLength(1);
 const receipt=await call('FINISH',{turnComplete:true});expect(receipt.receiptId).toBe(start.id);expect(await call('RECEIPT')).toEqual(receipt);
 const inv=(await db.query<{status:string;transcript_ref:string;completed_at:string}>('select status,transcript_ref,completed_at from public.cinthia_invitations where token=$1',[token])).rows[0];expect(inv.status).toBe('COMPLETED');expect(inv.transcript_ref).toBe(start.id);expect(inv.completed_at).toBeTruthy();
 const perms=(await db.query("select has_table_privilege('anon','public.cinthia_sessions','SELECT') a,has_function_privilege('authenticated','public.talent_cinthia_session(text,text,jsonb,boolean)','EXECUTE') b")).rows[0];expect(perms).toEqual({a:false,b:false});
});
it('Live cancellation and session deadline prevent subsequent writes and false completion',async()=>{
 for(const [n,mode] of [[3,'CANCELLED'],[4,'DEADLINE']] as const){
  const token=String(n).repeat(64),clientHash='a'.repeat(64),connectionId=crypto.randomUUID();
  await db.query('insert into public.cinthia_invitations(lead_id,token,prepared_by,test_mode) select id,$1,$2,true from public.voicebot_leads where external_id=$3',[token,admin,'cinthia-'+n]);
  const call=(action:string,data={})=>rpc('talent_cinthia_session',{p_token:token,p_action:action,p_test:true,p_data:{clientHash,connectionId,...data}});
  await call('BEGIN',{consent:true,consentVersion:'cinthia-voice-v1',model:'gemini-3.8-live'});await call('CLAIM');await call('READY');
  if(mode==='CANCELLED')await db.query("update public.cinthia_invitations set status='CANCELLED' where token=$1",[token]);else await db.query("update public.cinthia_sessions set deadline=now()-interval '1 second' where client_hash=$1",[clientHash]);
  await expect(call('SAVE')).rejects.toThrow(mode==='CANCELLED'?'CINTHIA_INVALID_STATE':'CINTHIA_SESSION_EXPIRED');
  if(mode==='DEADLINE')expect((await call('INTERRUPT',{code:'SESSION_TIME_LIMIT'})).state).toBe('INTERRUPTED');
  expect((await db.query<{completed_at:string|null}>('select completed_at from public.cinthia_invitations where token=$1',[token])).rows[0].completed_at).toBeNull();
 }
});
it('Live transcript preserves interrupted fragments and provider origin; production remains gated',async()=>{
 const t=new LiveTranscript();t.append('cinthia','Pregunta cortada');t.turn(true);t.append('candidate','Respuesta',true);expect(t.segments.map(s=>s.complete)).toEqual([false,true]);expect(t.segments.every(s=>s.source==='gemini_live')).toBe(true);
 expect(liveAvailable({GEMINI_API_KEY:'test',CINTHIA_LIVE_ENABLED:'true'},false)).toBe(false);
 expect(liveAvailable({GEMINI_API_KEY:'test',CINTHIA_LIVE_ENABLED:'true'},true)).toBe(true);
 expect(liveSetup('gemini-3.8-live',{}).setup.generationConfig.responseModalities).toEqual(['AUDIO']);
 expect(await hashSessionKey('a'.repeat(64))).toMatch(/^[a-f0-9]{64}$/);await expect(hashSessionKey('bad')).rejects.toThrow('CINTHIA_INVALID');
});
