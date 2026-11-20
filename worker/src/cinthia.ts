import {handleFreeCinthia} from './cinthiaFree';
import {cinthiaRpc,hashSessionKey,liveAvailable,liveModel,type CinthiaLiveEnv} from './cinthiaLive';
import {relationalSession} from './supabaseSession';
import {SupabaseError} from './supabase';
import {evaluationIssues,validEvaluationShape,newEvaluation} from '../../shared/cinthiaEvaluation';

type CinthiaEnv=CinthiaLiveEnv;
// A deployed Worker can never enable the development invitation flow.
export function cinthiaPreview(request:Request,env:CinthiaEnv){
 return env.CINTHIA_DEV_PREVIEW==='true'&&['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);
}
export async function handleCinthia(request:Request,env:CinthiaEnv){
 if(new URL(request.url).pathname==='/api/cinthia/free'||new URL(request.url).pathname.startsWith('/api/public/cinthia/free/'))return handleFreeCinthia(request,env);
 const url=new URL(request.url),preview=cinthiaPreview(request,env),available=liveAvailable(env,preview);
 const rpc=(name:string,args:Record<string,unknown>)=>cinthiaRpc(env,name,args);
 const token=url.pathname.match(/^\/api\/public\/cinthia\/([a-f0-9]{64})(\/(?:start|receipt))?$/);
 if(token){
  if(token[2]?request.method!=='POST':request.method!=='GET')throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
  const data=await rpc('talent_cinthia_public',{p_token:token[1],p_test:preview});
  if(token[2]==='/receipt'){const text=await request.text();if(text.length>1000)throw new SupabaseError(413,'CINTHIA_INVALID');let d:any;try{d=JSON.parse(text);}catch{throw new SupabaseError(400,'CINTHIA_INVALID');}const clientHash=await hashSessionKey(d?.key);return rpc('talent_cinthia_session',{p_token:token[1],p_action:'RECEIPT',p_test:preview,p_data:{clientHash}});}
  if(token[2]){
   if(['EXPIRED','CANCELLED','COMPLETED'].includes(data.status))throw new SupabaseError(409,'CINTHIA_INVALID_STATE');
   if(!available)throw new SupabaseError(503,'CINTHIA_UNAVAILABLE');
   const text=await request.text();if(text.length>1000)throw new SupabaseError(413,'CINTHIA_INVALID');
   let d:any;try{d=JSON.parse(text);}catch{throw new SupabaseError(400,'CINTHIA_INVALID');}
   const clientHash=await hashSessionKey(d?.key);
   const audio=await rpc('talent_cinthia_audio',{p_action:'INFO',p_token:token[1]});
   if(audio.recordAudio)await rpc('talent_cinthia_audio',{p_action:'CONSENT',p_token:token[1],p_hash:clientHash,p_data:{accepted:d.audioConsent===true,version:'cinthia-audio-v1'}});
   const session=await rpc('talent_cinthia_session',{p_token:token[1],p_action:'BEGIN',p_test:preview,p_data:{clientHash,consent:d.consent===true,consentVersion:d.consentVersion,model:liveModel(env)}});
   return {sessionId:session.id,deadline:session.deadline};
  }
  return {...data,...await rpc('talent_cinthia_audio',{p_action:'INFO',p_token:token[1]}),...await rpc('talent_cinthia_public_metadata',{p_token:token[1]}),serviceAvailable:available,consentVersion:'cinthia-voice-v1'};
 }
 if(url.pathname.startsWith('/api/public/cinthia/'))throw new SupabaseError(404,'CINTHIA_NOT_FOUND');
 const actor=await relationalSession(request,{...env,ORG_ENABLED:'false'});
 if(url.pathname==='/api/cinthia/audio'){
  if(request.method!=='GET')throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
  const part=url.searchParams.get('part');
  if(!part)return rpc('talent_cinthia_audio',{p_action:'LIST',p_actor:actor.authUserId,p_id:url.searchParams.get('invitation')});
  const info=await rpc('talent_cinthia_audio',{p_action:'READ',p_actor:actor.authUserId,p_id:part});const object=await env.DOCUMENTS?.get(info.objectKey);if(!object)throw new SupabaseError(404,'CINTHIA_NOT_FOUND');
  const bytes=new Uint8Array(await object.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {audio:btoa(binary),mime:'audio/wav'};
 }
 if(url.pathname==='/api/cinthia/tests'&&request.method==='GET')return rpc('talent_cinthia_test_history',{p_actor:actor.authUserId,p_evaluation:url.searchParams.get('evaluation')});
 if(url.pathname==='/api/cinthia/runtime'){
  if(request.method==='GET')return {...await rpc('talent_cinthia_runtime',{p_actor:actor.authUserId}),liveModel:liveModel(env)};
  if(request.method!=='PUT')throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
  const text=await request.text();if(text.length>10000)throw new SupabaseError(413,'CINTHIA_INVALID');
  let d:any;try{d=JSON.parse(text);}catch{throw new SupabaseError(400,'CINTHIA_INVALID');}
  if(!d?.config||typeof d.config.instructions!=='string'||d.config.instructions.length>4000||!['Kore','Aoede','Puck','Charon','Fenrir'].includes(d.config.voice)||![d.config.maxMinutes,d.config.maxFollowups,d.config.retentionDays,d.revision].every(Number.isInteger))throw new SupabaseError(400,'CINTHIA_INVALID');
  return rpc('talent_cinthia_runtime',{p_actor:actor.authUserId,p_config:d.config,p_revision:d.revision});
 }
 if(url.pathname==='/api/cinthia/calibration'&&request.method==='GET')return rpc('talent_cinthia_calibration',{p_actor:actor.authUserId});
 if(url.pathname==='/api/cinthia/analytics'&&request.method==='GET')return rpc('talent_cinthia_analytics',{p_actor:actor.authUserId});
 if(url.pathname==='/api/cinthia/subject'&&request.method==='GET')return rpc('talent_cinthia_subject',{p_actor:actor.authUserId,p_company:url.searchParams.get('company'),p_person:url.searchParams.get('person'),p_lead:url.searchParams.get('lead')});
 if(url.pathname==='/api/cinthia/assign'||url.pathname==='/api/cinthia/invitation'){
  if(request.method!=='POST')throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
  const text=await request.text();if(text.length>20000)throw new SupabaseError(413,'CINTHIA_INVALID');
  let d:any;try{d=JSON.parse(text);}catch{throw new SupabaseError(400,'CINTHIA_INVALID');}
  if(url.pathname.endsWith('/invitation'))return rpc('talent_cinthia_invitation_action',{p_actor:actor.authUserId,p_id:d.id,p_action:d.action,p_data:d.data||{}});
  if(!available)throw new SupabaseError(503,'CINTHIA_UNAVAILABLE');
  if(d.test===true){const catalog=await rpc('talent_cinthia_catalog',{p_actor:actor.authUserId});const v=catalog.items.flatMap((e:any)=>e.versions).find((v:any)=>v.id===d.version);try{if(!v||evaluationIssues(v.config).length)throw Error();}catch{throw new SupabaseError(400,'CINTHIA_CONFIG_INCOMPLETE');}}
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  return rpc('talent_cinthia_assign',{p_actor:actor.authUserId,p_version:d.version,p_token:token,p_person:d.person||null,p_lead:d.lead||null,p_test:d.test===true,p_repeat:d.repeat===true});
 }
 if(url.pathname==='/api/cinthia/catalog'){
  if(request.method==='GET')return rpc('talent_cinthia_catalog',{p_actor:actor.authUserId});
  if(request.method!=='POST')throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
  const text=await request.text();if(text.length>100000)throw new SupabaseError(413,'CINTHIA_INVALID');
  let d:any;try{d=JSON.parse(text);}catch{throw new SupabaseError(400,'CINTHIA_INVALID');}
  if(!['SAVE','DUPLICATE','PUBLISH','INACTIVE','ARCHIVED','BANK'].includes(d?.action))throw new SupabaseError(400,'CINTHIA_INVALID');
  if(['SAVE','DUPLICATE'].includes(d.action)&&!validEvaluationShape(d.data?.config))throw new SupabaseError(400,'CINTHIA_INVALID');
  if(d.action==='BANK'&&!validEvaluationShape({...newEvaluation(),competencies:[d.data?.content?.competency],activities:d.data?.content?.activities||[]}))throw new SupabaseError(400,'CINTHIA_INVALID');
  if(d.action==='PUBLISH'){
   const catalog=await rpc('talent_cinthia_catalog',{p_actor:actor.authUserId});
   const version=catalog.items.find((e:any)=>e.id===d.id)?.versions.find((v:any)=>!v.published_at);
   if(!version||version.revision!==d.data?.revision)throw new SupabaseError(409,'CINTHIA_CONFLICT');
   try{if(evaluationIssues(version.config).length)throw Error();}catch{throw new SupabaseError(400,'CINTHIA_CONFIG_INCOMPLETE');}
  }
  return rpc('talent_cinthia_evaluation_save',{p_actor:actor.authUserId,p_action:d.action,p_id:d.id||null,p_data:d.data||{}});
 }
 if(url.pathname==='/api/cinthia/settings'){
  if(request.method==='GET')return rpc('talent_cinthia_settings',{p_actor:actor.authUserId});
  if(request.method!=='PUT')throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
  const text=await request.text();if(text.length>10000)throw new SupabaseError(413,'CINTHIA_INVALID');
  let data:any;try{data=JSON.parse(text);}catch{throw new SupabaseError(400,'CINTHIA_INVALID');}
  if(!Array.isArray(data?.questions)||!Number.isInteger(data?.revision))throw new SupabaseError(400,'CINTHIA_INVALID');
  return rpc('talent_cinthia_settings',{p_actor:actor.authUserId,p_questions:data.questions,p_revision:data.revision});
 }
 if(request.method==='GET'&&url.pathname==='/api/cinthia'){
  if(url.search.length>2000)throw new SupabaseError(400,'CINTHIA_INVALID');
  return {...await rpc('talent_cinthia_list',{p_actor:actor.authUserId,p_filters:Object.fromEntries(url.searchParams)}),serviceAvailable:available,preview};
 }
 const lead=url.pathname.match(/^\/api\/cinthia\/leads\/([a-f0-9-]{36})$/)?.[1];
 if(!lead)throw new SupabaseError(404,'CINTHIA_NOT_FOUND');
 if(request.method==='GET')return {...await rpc('talent_cinthia_detail',{p_actor:actor.authUserId,p_lead:lead}),sessions:await rpc('talent_cinthia_transcript',{p_actor:actor.authUserId,p_lead:lead})};
 if(request.method!=='POST')throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
 const text=await request.text();if(text.length>1000)throw new SupabaseError(413,'CINTHIA_INVALID');
 let data:any;try{data=JSON.parse(text);}catch{throw new SupabaseError(400,'CINTHIA_INVALID');}
 if(!data||!['PREPARE','WHATSAPP_OPENED','SENT','CANCELLED'].includes(data.action))throw new SupabaseError(400,'CINTHIA_INVALID');
 if(data.action!=='PREPARE'&&(typeof data.invitationId!=='string'||!/^[a-f0-9-]{36}$/.test(data.invitationId)))throw new SupabaseError(400,'CINTHIA_INVALID');
 // Cancellation remains available; all operative invitation actions are server gated.
 if(!preview&&!available&&data.action!=='CANCELLED')throw new SupabaseError(503,'CINTHIA_UNAVAILABLE');
 const secureToken=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 return rpc('talent_cinthia_manage',{p_actor:actor.authUserId,p_lead:lead,p_action:data.action,p_token:secureToken,p_test:preview,p_invitation:data.invitationId??null,p_operational:available&&!preview});
}
