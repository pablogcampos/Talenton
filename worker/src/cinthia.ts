import {cinthiaRpc,hashSessionKey,liveAvailable,liveModel,type CinthiaLiveEnv} from './cinthiaLive';
import {relationalSession} from './supabaseSession';
import {SupabaseError} from './supabase';

type CinthiaEnv=CinthiaLiveEnv;
// A deployed Worker can never enable the development invitation flow.
export function cinthiaPreview(request:Request,env:CinthiaEnv){
 return env.CINTHIA_DEV_PREVIEW==='true'&&['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);
}
export async function handleCinthia(request:Request,env:CinthiaEnv){
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
   const session=await rpc('talent_cinthia_session',{p_token:token[1],p_action:'BEGIN',p_test:preview,p_data:{clientHash,consent:d.consent===true,consentVersion:d.consentVersion,model:liveModel(env)}});
   return {sessionId:session.id,deadline:session.deadline};
  }
  return {...data,serviceAvailable:available,consentVersion:'cinthia-voice-v1'};
 }
 if(url.pathname.startsWith('/api/public/cinthia/'))throw new SupabaseError(404,'CINTHIA_NOT_FOUND');
 const actor=await relationalSession(request,{...env,ORG_ENABLED:'false'});
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
