import {relationalSession} from './supabaseSession';
import {supabaseServerHeaders,SupabaseError,type SupabaseEnv} from './supabase';
type Env=SupabaseEnv & {CAPTURE_HASH_SECRET?:string};
export async function offerRpc<T>(env:Env,name:string,args:object):Promise<T>{
 const r=await fetch(env.SUPABASE_URL!.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:supabaseServerHeaders(env),body:JSON.stringify(args)});
 const data=await r.json() as any;
 if(!r.ok){const code=data.code==='42501'?'FORBIDDEN':/^OFFER_[A-Z_]+$/.test(data.message||'')?data.message:'OFFER_FAILED';throw new SupabaseError(code==='FORBIDDEN'?403:400,code);}
 if(data?.error)throw new SupabaseError(data.error==='OFFER_RATE_LIMITED'?429:400,data.error);
 return data;
}
async function input(request:Request){
 if(!request.headers.get('content-type')?.includes('application/json'))throw new SupabaseError(400,'OFFER_INVALID');
 const reader=request.body?.getReader();if(!reader)throw new SupabaseError(400,'OFFER_INVALID');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>150000){await reader.cancel();throw new SupabaseError(413,'OFFER_INVALID');}chunks.push(value);}
 const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(value&&typeof value==='object'&&!Array.isArray(value))return value;}catch{}
 throw new SupabaseError(400,'OFFER_INVALID');
}
export async function handleOffers(request:Request,env:Env){
 const path=new URL(request.url).pathname;const publicToken=path.match(/^\/api\/public\/offers\/([a-f0-9]{64})$/)?.[1];
 if(publicToken){
  if(!['GET','POST'].includes(request.method))throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
  const data=request.method==='POST'?await input(request):null;
  let hash=null;
  if(data){if(!env.CAPTURE_HASH_SECRET)throw new SupabaseError(503,'OFFER_FAILED');hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.CAPTURE_HASH_SECRET+':offer:'+publicToken+':'+(request.headers.get('cf-connecting-ip')||'unknown')+':'+(request.headers.get('user-agent')||''))))).map(b=>b.toString(16).padStart(2,'0')).join('');}
  return offerRpc(env,'talent_offer_public',{p_token:publicToken,p_data:data,p_evidence:hash});
 }
 const actor=await relationalSession(request,env);const args={p_actor:actor.authUserId,p_company:actor.companyId};
 if(path==='/api/offers'&&request.method==='GET')return offerRpc(env,'talent_offer_catalog',{...args,p_group:new URL(request.url).searchParams.get('group')});
 if(path==='/api/offers/templates'&&request.method==='POST'){
  const d=await input(request);if(typeof d.title!=='string'||typeof d.content!=='string'||typeof d.campaignId!=='string')throw new SupabaseError(400,'OFFER_INVALID');
  return offerRpc(env,'talent_offer_create',{...args,p_campaign:d.campaignId,p_title:d.title,p_content:d.content});
 }
 if(path==='/api/offers/assign'&&request.method==='POST'){
  const d=await input(request);return offerRpc(env,'talent_offer_assign',{...args,p_group:d.groupId,p_template:d.templateId});
 }
 const document=path.match(/^\/api\/offers\/documents\/([0-9a-f-]{36})$/);
 if(document&&request.method==='GET')return offerRpc(env,'talent_offer_document',{...args,p_id:document[1]});
 throw new SupabaseError(404,'OFFER_NOT_FOUND');
}
