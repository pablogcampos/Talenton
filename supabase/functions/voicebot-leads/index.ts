// Paste this entire file into the Supabase Edge Function editor.
// Set VOICEBOT_API_KEY (random, >=32 characters). Disable legacy JWT verification.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY remain server-side only.
declare const Deno: {env:{get(name:string):string|undefined}};
type Environment = (name:string)=>string|undefined;
const limits:Record<string,number>={external_id:200,phone:40,full_name:300,origin:300,
 company_name:200,campaign_name:200,workday:200,district:300,experience:10000,
 interview_availability:3000,interest:200,ai_reason:10000,transcript:50000,
 bot_notes:10000,source_recruiter:300};
const reply=(status:number,body:object)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function equalSecret(a:string,b:string){
 const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [x,y]=await Promise.all([digest(a),digest(b)]);let difference=0;
 for(let i=0;i<x.length;i++)difference|=x[i]^y[i];return difference===0;
}
export function createHandler(env:Environment,send:typeof fetch=fetch){
 return async(request:Request):Promise<Response>=>{
  if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
  const secret=env('VOICEBOT_API_KEY'),base=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!secret||secret.length<32||!base||!key)return reply(503,{error:'NOT_CONFIGURED'});
  const supplied=request.headers.get('x-voicebot-key')||'';
  if(supplied.length>512||!await equalSecret(supplied,secret))return reply(401,{error:'UNAUTHORIZED'});
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply(415,{error:'JSON_REQUIRED'});
  if(request.headers.get('content-encoding')&&!['identity'].includes(request.headers.get('content-encoding')!))return reply(415,{error:'ENCODING_NOT_SUPPORTED'});
  const reader=request.body?.getReader();if(!reader)return reply(400,{error:'INVALID_JSON'});
  let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>200000){await reader.cancel();return reply(413,{error:'BODY_TOO_LARGE'});}chunks.push(value);}}catch{return reply(400,{error:'INVALID_BODY'});}
  let input:Record<string,unknown>;
  try{const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return reply(400,{error:'INVALID_JSON'});}
  if(!input||typeof input!=='object'||Array.isArray(input))return reply(400,{error:'OBJECT_REQUIRED'});
  const unknown=Object.keys(input).filter(k=>!Object.hasOwn(limits,k)&&!['occurred_at','payload'].includes(k));
  if(unknown.length)return reply(400,{error:'UNKNOWN_FIELDS',fields:unknown});
  // Explicit allowlist: callers cannot set owner, status, timestamps or audit fields.
  const row:Record<string,unknown>={source:'voicebot'};
  for(const [field,max] of Object.entries(limits)){
   if(input[field]===undefined)continue;
   if(typeof input[field]!=='string'||[...input[field] as string].length>max)return reply(400,{error:'INVALID_FIELD',field});
   row[field]=(input[field] as string).trim();
  }
  if(!row.external_id)return reply(400,{error:'REQUIRED_FIELD',field:'external_id'});
  if(typeof row.phone!=='string'||row.phone.length<6||!/^\+?[0-9 ()-]{6,40}$/.test(row.phone))return reply(400,{error:'INVALID_FIELD',field:'phone'});
  if(input.occurred_at!==undefined){
   const value=input.occurred_at;
   if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return reply(400,{error:'INVALID_FIELD',field:'occurred_at'});
   row.occurred_at=value;
  }
  if(input.payload!==undefined){
   if(!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload)||new TextEncoder().encode(JSON.stringify(input.payload)).length>90000)return reply(400,{error:'INVALID_FIELD',field:'payload'});
   row.payload=input.payload;
  }
  try{
   const url=new URL('/rest/v1/voicebot_leads',base);
   if(url.protocol!=='https:')return reply(503,{error:'NOT_CONFIGURED'});
   const result=await send(url,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row),signal:AbortSignal.timeout(15000)});
   if(result.ok)return reply(201,{ok:true,duplicate:false,external_id:row.external_id});
   const error=await result.json().catch(()=>({})) as {code?:string};
   if(error.code==='23505')return reply(200,{ok:true,duplicate:true,external_id:row.external_id});
   if(['23514','22007','22008','22P02'].includes(error.code||''))return reply(400,{error:'INVALID_DATA'});
   return reply(503,{error:'TEMPORARILY_UNAVAILABLE'});
  }catch{return reply(503,{error:'TEMPORARILY_UNAVAILABLE'});}
 };
}
export default {fetch:(request:Request)=>createHandler(name=>Deno.env.get(name))(request)};
