import { supabaseServerHeaders, SupabaseError, type SupabaseEnv } from './supabase';

export async function surveyRpc(env: SupabaseEnv, name: string, args: object): Promise<unknown> {
 const result = await fetch(`${env.SUPABASE_URL?.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
  method: 'POST', headers: supabaseServerHeaders(env), body: JSON.stringify(args),
 });
 if (!result.ok) {
  const error = await result.json<{code?: string; message?: string}>();
  const code = error.code === '23505' ? 'SURVEY_ALREADY_COMPLETED' : /^SURVEY_[A-Z_]+$/.test(error.message || '') ? error.message! : 'SURVEY_FAILED';
  throw new SupabaseError(code === 'SURVEY_ALREADY_COMPLETED' ? 409 : code === 'SURVEY_FAILED' ? 503 : 400, code);
 }
 return result.json();
}

export async function publicSurvey(request: Request, env: SupabaseEnv & {CAPTURE_HASH_SECRET?:string}, token: string) {
 let data: unknown = null;
 if (request.method === 'POST') {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new SupabaseError(400, 'SURVEY_INVALID');
  const body = await request.text();
  if (body.length > 12000) throw new SupabaseError(413, 'SURVEY_INVALID');
  try { data = JSON.parse(body); } catch { throw new SupabaseError(400, 'SURVEY_INVALID'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SupabaseError(400, 'SURVEY_INVALID');
  if(!env.CAPTURE_HASH_SECRET)throw new SupabaseError(503,'SURVEY_FAILED');
  const material=new TextEncoder().encode(env.CAPTURE_HASH_SECRET+':survey:'+token+':'+(request.headers.get('cf-connecting-ip')||'unknown'));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',material))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(!await surveyRpc(env,'talent_survey_attempt',{p_token:token,p_hash:hash}))throw new SupabaseError(429,'SURVEY_RATE_LIMITED');
 } else if (request.method !== 'GET') throw new SupabaseError(405, 'METHOD_NOT_ALLOWED');
 return surveyRpc(env, 'talent_survey_public', {p_token: token, p_data: data});
}
