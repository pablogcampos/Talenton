import {supabaseServerHeaders,SupabaseError} from './supabase';
import {relationalSession,type SessionProfile} from './supabaseSession';
import type {Env} from './index';
import {candidateKey,readCandidateKey,candidateReferences,unqualifyCandidates} from './unifiedCandidates';
type Dispatch=(request:Request,env:Env)=>Promise<Response>;
async function rpc(env:Env,name:string,body:object){
 const r=await fetch(env.SUPABASE_URL!.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:supabaseServerHeaders(env),body:JSON.stringify(body)});
 if(!r.ok){const e=await r.json<{code?:string}>().catch(()=>({code:''}));throw new SupabaseError(e.code==='PT409'?409:e.code==='42501'?403:502,e.code==='PT409'?'COMPANY_CONTEXT_AMBIGUOUS':e.code==='42501'?'FORBIDDEN':name==='talent_org_record_company'?'COMPANY_LOOKUP_FAILED':'UNIFIED_READ_FAILED');}return r.json<any>();
}
export async function unifiedRequest(request:Request,env:Env,dispatch:Dispatch):Promise<Response>{
 const url=new URL(request.url);url.searchParams.delete('unified');
 const headers=new Headers(request.headers);headers.delete('X-Talent-Company');
 const actor=await relationalSession(new Request(request.url,{headers}),env,url.pathname==='/api/session');
 if(actor.mustChangePassword)return Response.json(actor);
 const path=url.pathname;
 let rewrittenBody:string|undefined;
 const requestedCompanies=new Set<string>();
 url.pathname=url.pathname.split('/').map(part=>{const parsed=readCandidateKey(decodeURIComponent(part));if(!parsed)return part;requestedCompanies.add(parsed.company);return encodeURIComponent(parsed.id);}).join('/');
 const context=(company:string)=>rpc(env,'talent_org_context',{p_actor:actor.authUserId,p_company:company}) as Promise<SessionProfile>;
 const run=(ctx:SessionProfile)=>{const h=new Headers(headers);h.set('X-Talent-Company',ctx.companyId);return dispatch(new Request(url,{method:request.method,headers:h,...(!['GET','HEAD'].includes(request.method)?{body:rewrittenBody??request.clone().body,duplex:'half'}:{})} as RequestInit),{...env,VERIFIED_SESSION:ctx});};
 if(request.method==='GET'&&['/api/session','/api/bootstrap','/api/attendance-unlocks','/api/capture/management','/api/capture/links','/api/capture/inbox','/api/capture/export'].includes(path)){
  const contexts:SessionProfile[]=[];
  for(const c of actor.companies||[{id:actor.companyId}])contexts.push(await context(c.id));
  if(path==='/api/session')return Response.json({...actor,unified:true,scope:[...new Set(contexts.flatMap(c=>c.scope||[]))],companyCampaigns:[...new Set(contexts.flatMap(c=>c.companyCampaigns||[]))],allowedModules:[...new Set(contexts.flatMap(c=>c.allowedModules))]});
  const chunks:({company:SessionProfile;data:any}|null)[]=[];
  for(const c of contexts){
   const result=await run(c);if(result.status===403&&path!=='/api/bootstrap'&&(path!=='/api/capture/export'||c.role!=='ADMIN'&&!c.allowedModules.includes('SELECCION'))){chunks.push(null);continue;}
   if(!result.ok)throw new SupabaseError(result.status,'UNIFIED_READ_FAILED');
   chunks.push({company:c,data:await result.json<any>()});
  }
  const merge=(key:string)=>chunks.flatMap(chunk=>(chunk?.data[key]||[]).map((row:any)=>{const companyId=row.companyId||chunk!.company.companyId;return {...candidateReferences(row,companyId),...(key==='candidates'?{id:candidateKey(companyId,row.id)}:{}),companyId,companyName:actor.companies?.find(c=>c.id===companyId)?.name};}));
  if(path==='/api/bootstrap'){
   const users=new Map<string,any>();
   for(const u of merge('users')){const prev=users.get(u.id);users.set(u.id,{...(prev||u),companyProfiles:[...(prev?.companyProfiles||[]),{companyId:u.companyId,role:u.role,allowedModules:u.allowedModules}]});}
   return Response.json({campaigns:merge('campaigns'),cohorts:merge('cohorts'),candidates:merge('candidates'),users:[...users.values()]});
  }
  if(path==='/api/capture/management')return Response.json({owners:merge('owners'),links:merge('links'),events:merge('events'),generatedAt:new Date().toISOString()});
  if(path==='/api/capture/export'){
   const items=chunks.flatMap(chunk=>(chunk?.data.items||[]).map((event:any)=>({...event,candidateId:candidateKey(chunk!.company.companyId,event.candidateId),companyName:actor.companies?.find(c=>c.id===chunk!.company.companyId)?.name||event.companyName})));
   return Response.json({items,total:items.length});
  }
  return Response.json({items:merge('items'),truncated:chunks.some(c=>c?.data.truncated)});
 }
 let input:Record<string,any>={};
 if(request.body&&request.headers.get('content-type')?.includes('application/json')&&!['GET','HEAD'].includes(request.method)){input=unqualifyCandidates(await request.clone().json(),requestedCompanies);rewrittenBody=JSON.stringify(input);}
 let kind='',id='';
 const match=url.pathname.match(/^\/api\/(?:selection\/|talent\/|capture\/)?(campaigns|messages|candidates|trainings|applications|events|attachments|links)\/([^/]+)/);
 if(match){kind=({campaigns:'campaign',messages:'campaign',candidates:'candidate',trainings:'training',applications:'application',events:'capture',attachments:'capture',links:'link'} as Record<string,string>)[match[1]];id=decodeURIComponent(match[2]);}
 if(path==='/api/trainings/from-selection'||path==='/api/candidates'||path==='/api/selection/link'){kind='campaign';id=String(input.campaignId||'');}
 let company:string|undefined;
 if(requestedCompanies.size>1)throw new SupabaseError(403,'FORBIDDEN');
 const requestedCompany=[...requestedCompanies][0];
 if(kind&&id)company=await rpc(env,'talent_org_record_company',{p_actor:actor.authUserId,p_kind:kind,p_id:id,p_company:requestedCompany||null});
 if(input.companyId&&company&&input.companyId!==company)throw new SupabaseError(403,'FORBIDDEN');
 if(!company&&['/api/campaigns','/api/capture/links'].includes(path)&&request.method==='POST'){
  if(typeof input.companyId!=='string'||!input.companyId)throw new SupabaseError(400,'COMPANY_REQUIRED');
  company=input.companyId;
 }
 if(requestedCompany&&company&&requestedCompany!==company)throw new SupabaseError(403,'FORBIDDEN');
 const ctx=company?await context(company):actor;
 const result=await run(ctx);
 if(!result.ok||!result.headers.get('content-type')?.includes('application/json')||path.startsWith('/api/org')||path==='/api/capture/forms'||path.startsWith('/api/users')||path==='/api/settings')return result;
 const data=candidateReferences(await result.json(),ctx.companyId);
 if(path==='/api/candidates'&&data.id)data.id=candidateKey(ctx.companyId,data.id);
 if(data.candidate?.id)data.candidate.id=candidateKey(ctx.companyId,data.candidate.id);
 return new Response(JSON.stringify(data),{status:result.status,headers:result.headers});
}
