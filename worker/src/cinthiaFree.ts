import {validEvaluationShape} from '../../shared/cinthiaEvaluation';
import {freeIssues,freeSnapshot,type FreeConfig} from '../../shared/cinthiaFree';
import {cinthiaRpc,hashSessionKey,liveAvailable,type CinthiaLiveEnv} from './cinthiaLive';
import {relationalSession} from './supabaseSession';
import {SupabaseError} from './supabase';
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
async function body(r:Request,max=100000){const t=await r.text();if(t.length>max)throw new SupabaseError(413,'CINTHIA_INVALID');try{return JSON.parse(t);}catch{throw new SupabaseError(400,'CINTHIA_INVALID');}}
export async function handleFreeCinthia(request:Request,env:CinthiaLiveEnv){
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/public\/cinthia\/free\/([a-f0-9]{64})$/);
 if(match){
  if(!['GET','POST'].includes(request.method))throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
  if(request.method==='GET')return cinthiaRpc(env,'talent_cinthia_free_public',{p_token:match[1]});
  if(!liveAvailable(env,false))throw new SupabaseError(503,'CINTHIA_UNAVAILABLE');
  const d=await body(request,2000);if(typeof d.name!=='string'||d.name.trim().length<3||d.name.length>150||typeof d.phone!=='string'||!/^\+?[0-9 ()-]{9,24}$/.test(d.phone)||d.email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)||d.email.length>254))throw new SupabaseError(400,'CINTHIA_INVALID');
  let phone=d.phone.replace(/\D/g,'');if(phone.length===9)phone='51'+phone;if(!/^[0-9]{9,15}$/.test(phone))throw new SupabaseError(400,'CINTHIA_INVALID');
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';const rate=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(match[1]+':'+ip))),b=>b.toString(16).padStart(2,'0')).join('');
  return cinthiaRpc(env,'talent_cinthia_free_public',{p_token:match[1],p_token_new:randomToken(),p_rate:rate,p_data:{name:d.name.trim(),phone,email:d.email||'',consent:d.consent===true,consentVersion:d.consentVersion,requestHash:await hashSessionKey(d.key)}});
 }
 const actor=await relationalSession(request,{...env,ORG_ENABLED:'false'});if(actor.role!=='ADMIN')throw new SupabaseError(403,'FORBIDDEN');
 if(url.pathname!=='/api/cinthia/free')throw new SupabaseError(404,'CINTHIA_NOT_FOUND');
 if(request.method==='GET')return cinthiaRpc(env,'talent_cinthia_free_admin',{p_actor:actor.authUserId,p_action:url.searchParams.get('view')==='participants'?'PARTICIPANTS':'LIST',p_id:url.searchParams.get('evaluation')||null});
 if(request.method!=='POST')throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
 const d=await body(request);if(!['SAVE','STATE','MATCHES','LINK','REVIEW'].includes(d.action))throw new SupabaseError(400,'CINTHIA_INVALID');
 if(d.action==='SAVE'){const c=d.data?.config as FreeConfig;if(!c||!validEvaluationShape(c)||!c.name.trim()||typeof c.scenario!=='string'||typeof c.persona!=='string'||typeof c.kind!=='string'||typeof c.experience!=='string'||typeof c.difficulty!=='string'||typeof c.expiresAt!=='string')throw new SupabaseError(400,'CINTHIA_CONFIG_INCOMPLETE');if(d.id){const list=await cinthiaRpc(env,'talent_cinthia_free_admin',{p_actor:actor.authUserId});if(list.find((e:any)=>e.id===d.id)?.status==='ACTIVE'&&freeIssues(c).length)throw new SupabaseError(400,'CINTHIA_CONFIG_INCOMPLETE');}d.data={...d.data,config:freeSnapshot(c),token:randomToken()};}
 if(d.action==='STATE'&&d.data?.status==='ACTIVE'){const list=await cinthiaRpc(env,'talent_cinthia_free_admin',{p_actor:actor.authUserId});const e=list.find((e:any)=>e.id===d.id);if(!e||freeIssues(e.config).length||Date.parse(e.config.expiresAt)<=Date.now())throw new SupabaseError(400,'CINTHIA_CONFIG_INCOMPLETE');}
 return cinthiaRpc(env,'talent_cinthia_free_admin',{p_actor:actor.authUserId,p_action:d.action,p_id:d.id||null,p_data:d.data||{}});
}
