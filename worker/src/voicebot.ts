import {relationalSession} from './supabaseSession';
import {supabaseServerHeaders,SupabaseError,type SupabaseEnv} from './supabase';
export async function handleVoicebot(request:Request,env:SupabaseEnv){
 const actor=await relationalSession(request,{...env,ORG_ENABLED:'false'}),url=new URL(request.url);
 let name='talent_voicebot_list',args:Record<string,unknown>={p_actor:actor.authUserId};
 if(request.method==='GET'&&url.pathname==='/api/voicebot/feed'){name='talent_voicebot_feed';
 }else if(request.method==='GET'&&url.pathname==='/api/voicebot/workspace'){
 name='talent_voicebot_workspace';args={...args,p_filters:Object.fromEntries(url.searchParams)};
 }else if(request.method==='POST'&&url.pathname==='/api/voicebot/settings'){
 const d=await request.json() as any;if(!d||![d.minutes,d.warning,d.version].every(Number.isSafeInteger))throw new SupabaseError(400,'VOICEBOT_INVALID');
 name='talent_voicebot_settings';args={...args,p_minutes:d.minutes,p_warning:d.warning,p_version:d.version};
 }else if(request.method==='POST'&&/^\/api\/voicebot\/leads\/[a-f0-9-]{36}\/attempts$/.test(url.pathname)){
 const text=await request.text();if(text.length>16000)throw new SupabaseError(413,'VOICEBOT_INVALID');
 let d:any;try{d=JSON.parse(text);}catch{throw new SupabaseError(400,'VOICEBOT_INVALID');}
 if(!d||!Number.isSafeInteger(d.version)||!['ATTEMPT','SCHEDULE','DISCARD'].includes(d.action)||typeof d.notes!=='string'||d.callbackAt!=null&&(typeof d.callbackAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(d.callbackAt)||!Number.isFinite(Date.parse(d.callbackAt))))throw new SupabaseError(400,'VOICEBOT_INVALID');
 name='talent_voicebot_attempt';args={...args,p_id:url.pathname.split('/').at(-2),p_version:d.version,p_action:d.action,p_status:d.status??null,p_outcome:d.outcome??null,p_notes:d.notes,p_callback_at:d.callbackAt??null};
 }else if(request.method==='GET'&&url.pathname==='/api/voicebot/assignees'){
 name='talent_voicebot_assignees';
 }else if(request.method==='POST'&&/^\/api\/voicebot\/leads\/[a-f0-9-]{36}\/assign$/.test(url.pathname)){
 const data=await request.json() as any;if(!data||!Number.isSafeInteger(data.version)||typeof data.recruiterId!=='string'||!/^[a-f0-9-]{36}$/.test(data.recruiterId))throw new SupabaseError(400,'VOICEBOT_INVALID');
 name='talent_voicebot_assign';args={...args,p_id:url.pathname.split('/').at(-2),p_version:data.version,p_recruiter:data.recruiterId};
 }else if(request.method==='GET'&&url.pathname==='/api/voicebot/dashboard'){
  const from=url.searchParams.get('from')||null,to=url.searchParams.get('to')||null;
  if([from,to].some(v=>v&&!/^\d{4}-\d{2}-\d{2}$/.test(v))||(from&&to&&from>to))throw new SupabaseError(400,'VOICEBOT_INVALID');
  name='talent_voicebot_dashboard';args={...args,p_from:from,p_to:to};
 }else if(request.method==='GET'&&url.pathname==='/api/voicebot/leads'){
  const page=Number(url.searchParams.get('page')||0),search=url.searchParams.get('search')||'',status=url.searchParams.get('status')||'';
  if(!Number.isInteger(page)||page<0||page>100000||search.length>200||!['','NUEVO','EN_GESTION','CONTACTADO','NO_CONTACTADO','REPROGRAMADO','DESCARTADO'].includes(status))throw new SupabaseError(400,'VOICEBOT_INVALID');
  args={...args,p_page:page,p_search:search,p_status:status};
 }else if(request.method==='POST'&&/^\/api\/voicebot\/leads\/[a-f0-9-]{36}\/convert$/.test(url.pathname)){
  const data=await request.json() as any;if(!data||!Number.isSafeInteger(data.version)||typeof data.companyId!=='string'||!data.companyId)throw new SupabaseError(400,'VOICEBOT_INVALID');
  name='talent_voicebot_convert';args={...args,p_id:url.pathname.split('/').at(-2),p_version:data.version,p_company:data.companyId};
 }else if(request.method==='PATCH'&&/^\/api\/voicebot\/leads\/[a-f0-9-]{36}$/.test(url.pathname)){
  const text=await request.text();if(text.length>16000)throw new SupabaseError(413,'VOICEBOT_INVALID');
  let data:any;try{data=JSON.parse(text);}catch{throw new SupabaseError(400,'VOICEBOT_INVALID');}
  if(!data||!Number.isSafeInteger(data.version)||!['TAKE','UPDATE'].includes(data.action)||data.notes!==undefined&&typeof data.notes!=='string')throw new SupabaseError(400,'VOICEBOT_INVALID');
  if(data.outcome!=null&&typeof data.outcome!=='string'||data.callbackAt!=null&&(typeof data.callbackAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.callbackAt)||!Number.isFinite(Date.parse(data.callbackAt))))throw new SupabaseError(400,'VOICEBOT_INVALID');
  name='talent_voicebot_manage_v2';args={...args,p_id:url.pathname.split('/').at(-1),p_version:data.version,p_action:data.action,p_status:data.status??null,p_notes:data.notes??'',p_outcome:data.outcome??null,p_callback_at:data.callbackAt??null};
 }else throw new SupabaseError(405,'METHOD_NOT_ALLOWED');
 const result=await fetch(env.SUPABASE_URL!.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:supabaseServerHeaders(env),body:JSON.stringify(args)});
 const data=await result.json() as any;
 if(!result.ok)throw new SupabaseError(data.code==='42501'?403:data.code==='PT409'?409:400,data.code==='42501'?'FORBIDDEN':/^VOICEBOT_[A-Z_]+$/.test(data.message||'')?data.message:'VOICEBOT_FAILED');
 return data;
}
