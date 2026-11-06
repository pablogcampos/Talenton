import {relationalSession} from './supabaseSession';
import {supabaseServerHeaders,SupabaseError,type SupabaseEnv} from './supabase';
export async function handleVoicebot(request:Request,env:SupabaseEnv){
 const actor=await relationalSession(request,env),url=new URL(request.url);
 let name='talent_voicebot_list',args:Record<string,unknown>={p_actor:actor.authUserId};
 if(request.method==='GET'&&url.pathname==='/api/voicebot/feed'){name='talent_voicebot_feed';
 }else if(request.method==='GET'&&url.pathname==='/api/voicebot/leads'){
  const page=Number(url.searchParams.get('page')||0),search=url.searchParams.get('search')||'',status=url.searchParams.get('status')||'';
  if(!Number.isInteger(page)||page<0||page>100000||search.length>200||!['','NUEVO','EN_GESTION','CONTACTADO','NO_CONTACTADO','DESCARTADO'].includes(status))throw new SupabaseError(400,'VOICEBOT_INVALID');
  args={...args,p_page:page,p_search:search,p_status:status};
 }else if(request.method==='PATCH'&&/^\/api\/voicebot\/leads\/[a-f0-9-]{36}$/.test(url.pathname)){
  const text=await request.text();if(text.length>16000)throw new SupabaseError(413,'VOICEBOT_INVALID');
  let data:any;try{data=JSON.parse(text);}catch{throw new SupabaseError(400,'VOICEBOT_INVALID');}
  if(!data||!Number.isSafeInteger(data.version)||!['TAKE','UPDATE'].includes(data.action)||data.notes!==undefined&&typeof data.notes!=='string')throw new SupabaseError(400,'VOICEBOT_INVALID');
  name='talent_voicebot_manage';args={...args,p_id:url.pathname.split('/').at(-1),p_version:data.version,p_action:data.action,p_status:data.status??null,p_notes:data.notes??''};
 }else throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
 const result=await fetch(env.SUPABASE_URL!.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:supabaseServerHeaders(env),body:JSON.stringify(args)});
 const data=await result.json() as any;
 if(!result.ok)throw new SupabaseError(data.code==='42501'?403:data.code==='PT409'?409:400,data.code==='42501'?'FORBIDDEN':/^VOICEBOT_[A-Z_]+$/.test(data.message||'')?data.message:'VOICEBOT_FAILED');
 return data;
}
