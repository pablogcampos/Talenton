import { limaDay, trainingDayNumber, unlockIsActive, evaluationDefinition, validEvaluationDefinition, trainingEvaluationsApproved } from '../../shared/trainingRules';
import { handleCapture, CaptureError } from './capture';
import { candidatePreferences } from './candidatePreferences';
import { relationalSession, changeFirstPassword, type SessionProfile } from './supabaseSession';
import { RelationalRuntime, type RuntimeEnv } from './relationalRuntime';
import { relationalIdentity } from './supabaseIdentity';
import { organizationRequest,organizationUserGuard,organizationUserHome } from './organization';
import { unifiedRequest } from './unified';
import { SupabaseError, type SupabaseEnv } from './supabase';
import { handleSelectionAdvanced, checkProcessStage } from './selectionAdvanced';
import { handleOperations } from './operations';
import { surveyRpc, publicSurvey } from './surveys';
export interface Env extends SupabaseEnv, RuntimeEnv {
  VERIFIED_SESSION?: SessionProfile;
  RELATIONAL_ACTOR?: SessionProfile;
  DATA_PROVIDER?: string;
  CAPTURE_HASH_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  ALLOWED_ORIGIN: string;
  PRODUCTION_ORIGIN: string;
  MAX_UPLOAD_BYTES: string;
  DOCUMENTS: R2Bucket;
}

type Role = 'ADMIN' | 'JEFE_SELECCION' | 'ANALISTA_SELECCION' | 'RECLUTADOR' | 'JEFE_FORMACION' | 'COORDINADOR_FORMACION' | 'FORMADOR' | 'JEFE_TALENTO' | 'ANALISTA_TALENTO' | 'JEFE_OPERACIONES' | 'COORDINADOR_OPERACIONES';
type Profile = { uid: string; username: string; displayName: string; role: Role; companyId: string; module: string[]; allowedModules: string[]; scope: string[]; subordinateUserIds?: string[]; enabled: boolean; status: string };
type FirestoreValue = { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; timestampValue?: string; nullValue?: null; arrayValue?: { values?: FirestoreValue[] }; mapValue?: { fields?: Record<string, FirestoreValue> } };
type FirestoreDocument = { name?: string; fields?: Record<string, FirestoreValue>; updateTime?: string };
type FirestoreDocumentList = { documents?: FirestoreDocument[] };
type GoogleErrorPayload = { error?: { message?: unknown; status?: unknown } };
const firebaseJwksUrl = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
type FirebaseJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
let firebaseKeys: Record<string, JsonWebKey> | undefined;
let firebaseKeysExpiresAt = 0;
const enc = new TextEncoder();
const b64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
const json = <T>(value: string) => JSON.parse(new TextDecoder().decode(b64(value))) as T;
const response = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function providerErrorCode(prefix: string, status: number, payload: GoogleErrorPayload): string {
  const candidate = payload.error?.status ?? payload.error?.message;
  const detail = typeof candidate === 'string' ? candidate.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80) : 'REQUEST_FAILED';
  return `${prefix}_${status}_${detail || 'REQUEST_FAILED'}`;
}

const configuredOrigins = (env: Env) => [env.ALLOWED_ORIGIN, env.PRODUCTION_ORIGIN]
  .flatMap(value => (value || '').split(','))
  .map(value => value.trim())
  .filter(Boolean);
function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('origin');
  return !origin || configuredOrigins(env).includes(origin);
}
function cors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin || !originAllowed(request, env)) return {};
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}
function corsResponse(request: Request, env: Env) {
  const headers = cors(request, env);
  if (request.method !== 'OPTIONS') return undefined;
  if (!originAllowed(request, env)) return response({ message: 'ORIGIN_NOT_ALLOWED' }, 403);
  return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'Authorization,Content-Type,X-Talent-Company', 'access-control-max-age': '600' } });
}
function pemToDer(pem: string) { return b64(pem.replace(/-----(BEGIN|END) (PUBLIC|PRIVATE) KEY-----/g, '').replace(/\s/g, '')); }
async function getFirebaseKeys(forceRefresh = false): Promise<Record<string, JsonWebKey>> {
  if (!forceRefresh && firebaseKeys && Date.now() < firebaseKeysExpiresAt) return firebaseKeys;
  const response = await fetch(firebaseJwksUrl);
  const payload = await response.json<{ keys?: FirebaseJwk[] }>();
  if (!response.ok || !payload.keys) throw new Error('CERTIFICATES_UNAVAILABLE');
  const keys: Record<string, JsonWebKey> = {};
  for (const key of payload.keys) {
    if (key.kid && key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig') keys[key.kid] = key;
  }
  if (Object.keys(keys).length === 0) throw new Error('CERTIFICATES_UNAVAILABLE');
  firebaseKeys = keys;
  const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  firebaseKeysExpiresAt = Date.now() + Math.max(300, maxAge) * 1000;
  return keys;
}
async function verifyToken(request: Request, env: Env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('UNAUTHENTICATED');
  const [h, p, s, ...extra] = token.split('.'); if (!h || !p || !s || extra.length) throw new Error('INVALID_TOKEN');
  const header = json<{ alg: string; kid: string }>(h); const claims = json<Record<string, unknown>>(p);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('INVALID_TOKEN');
  let keyData = (await getFirebaseKeys())[header.kid];
  if (!keyData) keyData = (await getFirebaseKeys(true))[header.kid];
  if (!keyData) throw new Error('INVALID_TOKEN');
  const key = await crypto.subtle.importKey('jwk', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(s), enc.encode(`${h}.${p}`))) throw new Error('INVALID_TOKEN');
  const now = Math.floor(Date.now() / 1000); const uid = typeof claims.sub === 'string' ? claims.sub : '';
  if (!uid || claims.aud !== env.FIREBASE_PROJECT_ID || claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` || typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' || claims.iat > now + 60) throw new Error('INVALID_TOKEN');
  return uid;
}
function firestoreValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (isRecord(value)) return { mapValue: { fields: fields(value) } };
  throw new Error('INVALID_FIRESTORE_VALUE');
}
function fields(value: Record<string, unknown>): Record<string, FirestoreValue> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, firestoreValue(item)]));
}
function firestoreData(value: FirestoreValue): unknown {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.nullValue !== undefined) return null;
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(firestoreData);
  if (value.mapValue) return unpack(value.mapValue.fields ?? {});
  return undefined;
}
function unpack(value: Record<string, FirestoreValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreData(item)]));
}
async function googleAccessToken(env: Env) {
  if (env.DATA_PROVIDER !== 'firebase') return 'RELATIONAL_SERVER_CONTEXT';
  const now = Math.floor(Date.now() / 1000); const part = (v: unknown) => btoa(JSON.stringify(v)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const assertionHead = part({ alg: 'RS256', typ: 'JWT' }); const assertionBody = part({ iss: env.FIREBASE_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${assertionHead}.${assertionBody}`));
  const assertion = `${assertionHead}.${assertionBody}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await r.json<{ access_token?: string }>(); if (!r.ok || !data.access_token) throw new Error(`GOOGLE_AUTH_${r.status}`); return data.access_token;
}
const documentUrl = (env: Env, path: string) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
async function firestore(env: Env, path: string, method = 'GET', data?: Record<string, unknown>, expectedUpdateTime?: string) {
  if (env.DATA_PROVIDER !== 'firebase') {
    const store=env.RELATIONAL_RUNTIME; if(!store) throw new Error('RELATIONAL_CONTEXT_MISSING');
    const current=await store.get(path);
    if (method==='GET') { if(!current) throw new Error('FIRESTORE_404'); return {fields:fields(current),updateTime:String(current.__rowVersion||1)} as FirestoreDocument; }
    if(method!=='PATCH'||!data||!isRecord(data.fields)) throw new Error('INVALID_RELATIONAL_OPERATION');
    if(expectedUpdateTime && expectedUpdateTime!==String(current?.__rowVersion||1)) throw new CaptureError('El expediente cambió. Actualiza antes de guardar.',409);
    await store.write(path,unpack(data.fields as Record<string,FirestoreValue>));
    return {fields:data.fields,updateTime:String(current?.__rowVersion||1)} as FirestoreDocument;
  }
  const token = await googleAccessToken(env); const url = new URL(documentUrl(env, path));
  if (method === 'PATCH' && data && isRecord(data.fields)) Object.keys(data.fields).forEach(field => url.searchParams.append('updateMask.fieldPaths', field));
  if (expectedUpdateTime) url.searchParams.set('currentDocument.updateTime', expectedUpdateTime);
  const r = await fetch(url.toString(), { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  if (!r.ok) { if (expectedUpdateTime && [409, 412].includes(r.status)) throw new CaptureError('El expediente cambió. Actualiza antes de guardar.', 409); throw new Error(`FIRESTORE_${r.status}`); } return r.json<FirestoreDocument>();
}
async function firestoreServerWrite(env: Env, path: string, data: Record<string, unknown>, serverTimestampFields: string[]) {
  if(env.DATA_PROVIDER!=='firebase') { if(!env.RELATIONAL_RUNTIME)throw new Error('RELATIONAL_CONTEXT_MISSING'); await env.RELATIONAL_RUNTIME.write(path,{...data,...Object.fromEntries(serverTimestampFields.map(k=>[k,new Date().toISOString()]))}); return; }
  const token = await googleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents:commit`;
  const documentName = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
  const fieldPaths = Object.keys(data);
  const result = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ writes: [{
      update: { name: documentName, fields: fields(data) },
      updateMask: { fieldPaths },
      updateTransforms: serverTimestampFields.map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })),
    }] }),
  });
  if (!result.ok) {
    const payload = await result.json<GoogleErrorPayload>().catch(() => ({}));
    throw new Error(providerErrorCode('FIRESTORE_COMMIT', result.status, payload));
  }
}
async function listFirestore(env: Env, path: string): Promise<Record<string, unknown>[]> {
  if(env.DATA_PROVIDER!=='firebase') { if(!env.RELATIONAL_RUNTIME)throw new Error('RELATIONAL_CONTEXT_MISSING'); return env.RELATIONAL_RUNTIME.query(path); }
  const token = await googleAccessToken(env);
  const result = await fetch(documentUrl(env, path), { headers: { authorization: `Bearer ${token}` } });
  if (!result.ok) throw new Error(`FIRESTORE_${result.status}`);
  const payload = await result.json<FirestoreDocumentList>();
  return (payload.documents ?? []).map(document => ({
    id: document.name?.split('/').pop() ?? '',
    ...unpack(document.fields ?? {}),
  }));
}
async function campaign(env: Env, id: string): Promise<Record<string, unknown>> {
  const data = await firestore(env, `campaigns/${id}`); return unpack(data.fields ?? {});
}
function campaignAllowed(profile: Profile, campaignData: Record<string, unknown>): boolean {
  if (profile.role === 'ADMIN') return true;
  if (campaignData.companyId !== profile.companyId) return false;
  if (profile.role === 'JEFE_SELECCION') return true;
  if (profile.role === 'RECLUTADOR') return Array.isArray(campaignData.assignedUserIds) && campaignData.assignedUserIds.includes(profile.uid);
  if (profile.role !== 'ANALISTA_SELECCION') return false;
  const analystId = typeof campaignData.assignedAnalystId === 'string' ? campaignData.assignedAnalystId : '';
  return analystId === profile.uid || profile.scope.includes(String(campaignData.id ?? ''));
}
function requireSelectionManager(profile: Profile) {
  if (!['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION'].includes(profile.role) || !profile.allowedModules.includes('SELECCION')) throw new Error('FORBIDDEN');
}
function requireSelectionUser(profile: Profile) {
  if (!['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'].includes(profile.role) || !profile.allowedModules.includes('SELECCION')) throw new Error('FORBIDDEN');
}
function campaignId(): string { return `CMP-${crypto.randomUUID()}`; }
function numberValue(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function responsibleTargets(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, item) => total + (isRecord(item) ? numberValue(item.target) : 0), 0);
}
function validateCampaignEdit(data:Record<string,unknown>) {
  if(!String(data.title??'').trim())throw new Error('INVALID_CAMPAIGN');
  if(!Number.isInteger(Number(data.vacancies))||Number(data.vacancies)<0)throw new Error('INVALID_CAMPAIGN_AMOUNT');
  for(const k of ['salaryBase','variableBonus','adminBonus','mobilityBonus'])if(data[k]!=null&&(!Number.isFinite(Number(data[k]))||(k==='salaryBase'&&Number(data[k])<0)))throw new Error('INVALID_CAMPAIGN_AMOUNT');
  for(const k of ['requestDate','startDate','endDate'])if(data[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(String(data[k]))||!Number.isFinite(Date.parse(String(data[k])))||new Date(String(data[k])).toISOString().slice(0,10)!==data[k]))throw new Error('INVALID_CAMPAIGN_DATES');
  if(data.startDate&&data.endDate&&String(data.endDate)<String(data.startDate))throw new Error('INVALID_CAMPAIGN_DATES');
}
async function createCampaign(request: Request, env: Env, actor: Profile) {
  requireSelectionManager(actor); const input = await request.json<Record<string, unknown>>();
  const id = campaignId(); const vacancies = numberValue(input.vacancies, 0); const responsibles = input.responsibles;
  if(env.RELATIONAL_ACTOR?.managedCompany&&!env.RELATIONAL_ACTOR.companyCampaigns?.includes(String(input.companyCampaignId)))throw new Error('COMPANY_CAMPAIGN_REQUIRED');
  validateCampaignEdit(input);
  if (!String(input.title ?? '').trim() || vacancies <= 0) throw new Error('INVALID_CAMPAIGN');
  if (responsibleTargets(responsibles) > vacancies && input.allowOverTargetQuota !== true) throw new Error('TARGET_EXCEEDS_VACANCIES');
  const data = { ...input, id, companyId: actor.companyId, client: input.client ?? input.company, positionsCovered: numberValue(input.positionsCovered), positionsPending: Math.max(0, vacancies - numberValue(input.positionsCovered)), assignedUserIds: Array.isArray(responsibles) ? responsibles.filter(isRecord).map(entry => String(entry.userId ?? '')).filter(Boolean) : [], createdBy: actor.uid, createdAt: new Date().toISOString() };
  await firestore(env, `campaigns/${id}`, 'PATCH', { fields: fields(data) });
  return response(data, 201, cors(request, env));
}
async function updateCampaign(request: Request, env: Env, actor: Profile, id: string) {
  const existing = await campaign(env, id); requireSelectionManager(actor); if (!campaignAllowed(actor, existing)) throw new Error('FORBIDDEN');
  const input = await request.json<Record<string, unknown>>();
  const editableFields = ['code', 'company', 'client', 'title', 'area', 'serviceType', 'salaryBase', 'variableBonus', 'adminBonus', 'mobilityBonus', 'additionalConditions', 'requestDate', 'startDate', 'endDate', 'processType', 'managementType', 'vacancies', 'location', 'shift', 'observations', 'status', 'assignedAnalystId', 'assignedAnalystName', 'requirements'];
  const patch: Record<string, unknown> = {};
  for (const field of editableFields) if (input[field] !== undefined) patch[field] = input[field];
  if (!Object.keys(patch).length) throw new Error('INVALID_CAMPAIGN');
  validateCampaignEdit({...existing,...patch});
  const validStatuses = ['EN_PROCESO', 'PUBLICADO', 'CERRADO', 'ANULADO', 'ACTIVA', 'EN_PAUSA'];
  if (patch.status !== undefined && !validStatuses.includes(String(patch.status))) throw new Error('INVALID_STATUS');
  const vacancies = numberValue(patch.vacancies, numberValue(existing.vacancies)); const responsibles = existing.responsibles;
  if (responsibleTargets(responsibles) > vacancies && input.allowOverTargetQuota !== true && existing.allowOverTargetQuota !== true) throw new Error('TARGET_EXCEEDS_VACANCIES');
  const covered = numberValue(existing.positionsCovered); const data = { ...patch, positionsPending: Math.max(0, vacancies - covered), updatedAt: new Date().toISOString(), updatedBy: actor.uid };
  await firestore(env, `campaigns/${id}`, 'PATCH', { fields: fields(data) }); return response({ ok: true }, 200, cors(request, env));
}
async function updateCampaignStatus(request: Request, env: Env, actor: Profile, id: string) {
  const existing = await campaign(env, id); requireSelectionManager(actor); if (!campaignAllowed(actor, existing)) throw new Error('FORBIDDEN');
  const input = await request.json<{ status?: unknown; reason?: unknown }>(); if (typeof input.status !== 'string') throw new Error('INVALID_STATUS');
  const history = Array.isArray(existing.statusHistory) ? existing.statusHistory : [];
  const statusHistory = [...history, { date: new Date().toISOString().slice(0, 10), previousStatus: existing.status, newStatus: input.status, changedBy: actor.displayName, reason: typeof input.reason === 'string' ? input.reason : `Cambio de estado a ${input.status}` }];
  await firestore(env, `campaigns/${id}`, 'PATCH', { fields: fields({ status: input.status, statusHistory, updatedAt: new Date().toISOString(), updatedBy: actor.uid }) }); return response({ ok: true }, 200, cors(request, env));
}
async function updateCampaignResponsibles(request: Request, env: Env, actor: Profile, id: string) {
  const existing = await campaign(env, id); requireSelectionManager(actor); if (!campaignAllowed(actor, existing)) throw new Error('FORBIDDEN');
  const input = await request.json<{ responsibles?: unknown; allowOverTarget?: unknown }>(); if (!Array.isArray(input.responsibles)) throw new Error('INVALID_RESPONSIBLES');
  const overTarget = input.allowOverTarget === true; if (responsibleTargets(input.responsibles) > numberValue(existing.vacancies) && !(overTarget && ['ADMIN', 'JEFE_SELECCION'].includes(actor.role))) throw new Error('TARGET_EXCEEDS_VACANCIES');
  const assignedUserIds = input.responsibles.filter(isRecord).map(entry => String(entry.userId ?? '')).filter(Boolean);
  await firestore(env, `campaigns/${id}`, 'PATCH', { fields: fields({ responsibles: input.responsibles, assignedUserIds, allowOverTargetQuota: overTarget, updatedAt: new Date().toISOString(), updatedBy: actor.uid }) }); return response({ ok: true }, 200, cors(request, env));
}
async function updateCampaignSource(request: Request, env: Env, actor: Profile, id: string) {
  const existing = await campaign(env, id); requireSelectionManager(actor); if (!campaignAllowed(actor, existing)) throw new Error('FORBIDDEN');
  const input = await request.json<{ sourceName?: unknown; isEnabled?: unknown }>(); if (typeof input.sourceName !== 'string' || typeof input.isEnabled !== 'boolean') throw new Error('INVALID_SOURCE');
  const sources = Array.isArray(existing.sources) ? existing.sources.map(item => isRecord(item) && item.sourceName === input.sourceName ? { ...item, isEnabled: input.isEnabled } : item) : [];
  await firestore(env, `campaigns/${id}`, 'PATCH', { fields: fields({ sources, updatedAt: new Date().toISOString(), updatedBy: actor.uid }) }); return response({ ok: true }, 200, cors(request, env));
}
async function candidate(env: Env, id: string): Promise<Record<string, unknown>> { const data = await firestore(env, `candidates/${id}`); return { ...unpack(data.fields ?? {}), __updateTime: data.updateTime }; }
function candidateAllowed(profile: Profile, data: Record<string, unknown>): boolean {
  if (profile.role === 'ADMIN') return true;
  if (data.companyId !== profile.companyId) return false;
  if (profile.role === 'JEFE_SELECCION') return true;
  if (profile.role === 'ANALISTA_SELECCION') return profile.scope.includes(String(data.campaignId ?? '')) || data.analystId === profile.uid;
  return profile.role === 'RECLUTADOR' && data.recruiterId === profile.uid;
}
async function candidateAllowedWithAssignment(env: Env, profile: Profile, data: Record<string, unknown>): Promise<boolean> {
  if (candidateAllowed(profile, data)) return true;
  if (profile.role !== 'RECLUTADOR' || data.companyId !== profile.companyId || typeof data.campaignId !== 'string') return false;
  const campaignData = await campaign(env, data.campaignId); return Array.isArray(campaignData.assignedUserIds) && campaignData.assignedUserIds.includes(profile.uid);
}
const selectionStages = ['NUEVO', 'CONTACTADO', 'ENTREVISTA', 'VERIFICACION_TECNICA', 'EVALUACIONES', 'APTO_CAPACITACION', 'NO_APTO', 'DESCARTADO'];
const selectionTransitions: Record<string, string[]> = {
  NUEVO: ['CONTACTADO', 'NO_APTO', 'DESCARTADO'], CONTACTADO: ['ENTREVISTA', 'NO_APTO', 'DESCARTADO'],
  ENTREVISTA: ['VERIFICACION_TECNICA', 'NO_APTO', 'DESCARTADO'], VERIFICACION_TECNICA: ['EVALUACIONES', 'NO_APTO', 'DESCARTADO'],
  EVALUACIONES: ['APTO_CAPACITACION', 'NO_APTO', 'DESCARTADO'], NO_APTO: ['NUEVO'], DESCARTADO: ['NUEVO'], APTO_CAPACITACION: [],
};
async function createCandidate(request: Request, env: Env, actor: Profile) {
  requireSelectionUser(actor); const input = await request.json<Record<string, unknown>>();
  const dni = typeof input.dni === 'string' ? input.dni.replace(/\D/g, '') : ''; const campaignId = typeof input.campaignId === 'string' ? input.campaignId : '';
  if (!dni || !campaignId || !String(input.fullName ?? '').trim()) throw new Error('INVALID_CANDIDATE');
  if (input.age !== undefined && (typeof input.age !== 'number' || !Number.isInteger(input.age) || input.age < 1 || input.age > 120)) throw new Error('INVALID_CANDIDATE_AGE');
  const campaignData = await campaign(env, campaignId); const assignedUsers = Array.isArray(campaignData.assignedUserIds) ? campaignData.assignedUserIds : []; const recruiterAllowed = actor.role === 'RECLUTADOR' && campaignData.companyId === actor.companyId && assignedUsers.includes(actor.uid); if (!campaignAllowed(actor, campaignData) && !recruiterAllowed) throw new Error('FORBIDDEN');
  const id = `CAN-${dni}`;
  try { await candidate(env, id); throw new Error('DUPLICATE_CANDIDATE'); } catch (error) { if (!(error instanceof Error) || error.message !== 'FIRESTORE_404') throw error; }
  const now = new Date(); const date = now.toISOString().slice(0, 10); const time = now.toISOString().slice(11, 16);
  const requestedRecruiterId = typeof input.recruiterId === 'string' ? input.recruiterId : actor.uid;
  const recruiterId = actor.role === 'RECLUTADOR' ? actor.uid : requestedRecruiterId;
  let recruiterName = actor.displayName;
  if (recruiterId !== actor.uid) {
    const recruiter = unpack((await firestore(env, `users/${recruiterId}`)).fields ?? {});
    const recruiterModules = strings(recruiter.allowedModules).length ? strings(recruiter.allowedModules) : strings(recruiter.module);
    if (recruiter.role !== 'RECLUTADOR' || recruiter.companyId !== actor.companyId || recruiter.enabled === false || recruiter.status !== 'ACTIVO' || !recruiterModules.includes('SELECCION')) throw new Error('RECRUITER_NOT_AVAILABLE');
    recruiterName = String(recruiter.displayName ?? recruiter.name ?? recruiter.username ?? 'Reclutador');
  }
  const traceability = [{ id: `TR-${crypto.randomUUID()}`, date, time, user: actor.displayName, previousStage: 'N/A', newStage: 'NUEVO', observation: 'Postulación registrada.' }];
  const allowedFields = ['fullName', 'firstName', 'lastName', 'email', 'phone', 'city', 'district', 'address', 'birthDate', 'age', 'campaignCode', 'campaignName', 'jobProfile', 'source', 'cvUrl', 'observationsGeneral'];
  const safeInput: Record<string, unknown> = { ...candidatePreferences(input) };
  for (const field of allowedFields) if (input[field] !== undefined) safeInput[field] = input[field];
  const data = { ...safeInput, id, dni, companyId: actor.companyId, campaignId, recruiterId, recruiterName, analystId: campaignData.assignedAnalystId ?? '', analystName: campaignData.assignedAnalystName ?? '', applicationDate: typeof input.applicationDate === 'string' ? input.applicationDate : date, currentProcess: 'SELECCION', currentStage: 'SELECCION', selection: { callId: campaignId, stage: 'NUEVO', status: 'ACTIVO', traceability, contactHistory: [], evaluations: [], evaluationsList: [] }, createdAt: now.toISOString(), createdBy: actor.uid };
  await firestore(env, `candidates/${id}`, 'PATCH', { fields: fields(data) }); return response(data, 201, cors(request, env));
}
async function candidateStage(request: Request, env: Env, actor: Profile, id: string) {
  const current = await candidate(env, id); requireSelectionUser(actor); if (!await candidateAllowedWithAssignment(env, actor, current)) throw new Error('FORBIDDEN'); const input = await request.json<{ stage?: unknown; discardReason?: unknown; discardDetail?: unknown; observation?: unknown; date?: unknown; time?: unknown }>();
  if (typeof input.stage !== 'string' || !selectionStages.includes(input.stage)) throw new Error('INVALID_STAGE');
  checkProcessStage(current, input.stage, actor);
  const selection = isRecord(current.selection) ? current.selection : {}; const previousStage = typeof selection.stage === 'string' ? selection.stage : 'NUEVO'; const discarded = input.stage === 'NO_APTO' || input.stage === 'DESCARTADO'; const history = Array.isArray(selection.traceability) ? selection.traceability : [];
  if (current.selectionActive === false) throw new CaptureError('Esta participación está cerrada. Vincula otra convocatoria manualmente.', 409);
  const directApto = input.stage === 'APTO_CAPACITACION' && selection.status !== 'NO_APTO' && current.currentStage !== 'DESCARTADO' && !['NO_APTO', 'DESCARTADO', 'APTO_CAPACITACION'].includes(previousStage);
  if (!directApto && !selectionTransitions[previousStage]?.includes(input.stage)) throw new Error('INVALID_STAGE_TRANSITION');
  if (input.stage === 'APTO_CAPACITACION') {
    const missing = [
      !String(current.fullName ?? '').trim() && 'nombres y apellidos',
      !String(current.dni ?? '').trim() && 'documento de identidad',
      !String(current.phone ?? '').trim() && 'celular',
      !String(current.campaignId ?? '').trim() && 'convocatoria',
    ].filter((field): field is string => typeof field === 'string');
    if (missing.length) throw new CaptureError(`Completa los datos del postulante: ${missing.join(', ')}.`, 409);
  }
  const now = new Date().toISOString(); const trace = { id: `TR-${crypto.randomUUID()}`, date: now.slice(0, 10), time: now.slice(11, 16), user: actor.displayName, previousStage, newStage: input.stage, observation: typeof input.observation === 'string' ? input.observation : `Cambio de etapa a ${input.stage}` };
  const next = { ...selection, stage: input.stage, status: discarded ? 'NO_APTO' : 'ACTIVO', discardReason: discarded && typeof input.discardReason === 'string' ? input.discardReason : selection.discardReason, traceability: [...history, trace] };
  await firestore(env, `candidates/${id}`, 'PATCH', { fields: fields({ selection: next, currentStage: discarded ? 'DESCARTADO' : 'SELECCION', updatedAt: new Date().toISOString(), updatedBy: actor.uid }) }, current.__updateTime as string | undefined); return response({ ok: true }, 200, cors(request, env));
}
async function appendCandidateItem(request: Request, env: Env, actor: Profile, id: string, kind: 'contacts' | 'evaluations' | 'observations') {
  const current = await candidate(env, id); requireSelectionUser(actor); if (!await candidateAllowedWithAssignment(env, actor, current)) throw new Error('FORBIDDEN'); const item = await request.json<Record<string, unknown>>(); const selection = isRecord(current.selection) ? current.selection : {};
  if (current.selectionProcessSnapshot && kind === 'evaluations' && item.definitionId !== undefined) throw new CaptureError('Usa la evaluación configurada en Gestión avanzada.', 409);
  if (current.selectionActive === false) throw new CaptureError('Esta participación está cerrada.', 409);
  const field = kind === 'contacts' ? 'contactHistory' : kind === 'evaluations' ? 'evaluationsList' : 'observations'; const oldItems = Array.isArray(selection[field]) ? selection[field] : []; const prefix = kind === 'contacts' ? 'CNT' : kind === 'evaluations' ? 'EV' : 'OBS'; const created = { ...item, id: `${prefix}-${crypto.randomUUID()}`, responsibleId: actor.uid, responsibleName: actor.displayName, recordedAt: new Date().toISOString() };
  const next = kind === 'contacts' ? { ...selection, contactHistory: [...oldItems, created] } : kind === 'evaluations' ? { ...selection, evaluationsList: [...oldItems, created], evaluations: [...oldItems, created] } : { ...selection, observations: [...oldItems, created] };
  await firestore(env, `candidates/${id}`, 'PATCH', { fields: fields({ selection: next, updatedAt: new Date().toISOString(), updatedBy: actor.uid }) }, current.__updateTime as string | undefined); return response({ ok: true }, 201, cors(request, env));
}
async function updateSelectionRecord(request: Request, env: Env, actor: Profile, id: string) {
  const current = await candidate(env, id); requireSelectionUser(actor); if (!await candidateAllowedWithAssignment(env, actor, current)) throw new Error('FORBIDDEN'); const input = await request.json<{ kind?: unknown; value?: unknown }>(); if (!['INTERVIEW', 'TECHNICAL'].includes(String(input.kind)) || !isRecord(input.value)) throw new Error('INVALID_SELECTION_RECORD');
  if (current.selectionActive === false) throw new CaptureError('Esta participación está cerrada.', 409);
  if (current.selectionProcessSnapshot && input.kind === 'INTERVIEW') throw new CaptureError('Usa el formulario configurado en Gestión avanzada.', 409);
  const selection = isRecord(current.selection) ? current.selection : {}; const field = input.kind === 'INTERVIEW' ? 'interviewResult' : 'technicalVerification'; const rejected = input.kind === 'INTERVIEW' ? input.value.status === 'NO_APTO' : input.value.status === 'NO_APRUEBA'; const now = new Date().toISOString(); const traceability = Array.isArray(selection.traceability) ? selection.traceability : []; const newStage = rejected ? 'DESCARTADO' : input.kind === 'INTERVIEW' ? 'ENTREVISTA' : 'VERIFICACION_TECNICA';
  const trace = { id: `TR-${crypto.randomUUID()}`, date: now.slice(0, 10), time: now.slice(11, 16), user: actor.displayName, previousStage: selection.stage, newStage, observation: `${input.kind === 'INTERVIEW' ? 'Entrevista' : 'Verificación técnica'} registrada: ${String(input.value.status ?? '')}.` };
  await firestore(env, `candidates/${id}`, 'PATCH', { fields: fields({ currentStage: rejected ? 'DESCARTADO' : current.currentStage, selection: { ...selection, [field]: input.value, status: rejected ? 'NO_APTO' : 'ACTIVO', traceability: [...traceability, trace] }, updatedAt: now, updatedBy: actor.uid }) }, current.__updateTime as string | undefined); return response({ ok: true }, 200, cors(request, env));
}
async function updateCandidatePersonalData(request: Request, env: Env, actor: Profile, id: string) {
  let current: Record<string,unknown>;
  if(['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'].includes(actor.role)) {
    requireSelectionUser(actor);current=await candidate(env,id);
    if(!await candidateAllowedWithAssignment(env,actor,current))throw new Error('FORBIDDEN');
  } else current=await requireDocumentAccess(env,actor,id);
  const input = await request.json<Record<string, unknown>>(); const allowed = ['dni', 'fullName', 'firstName', 'lastName', 'email', 'phone', 'birthDate', 'age', 'city', 'district', 'address']; const patch: Record<string, unknown> = {};
  Object.assign(patch, candidatePreferences(input));
  for (const field of allowed) if (input[field] !== undefined) patch[field] = input[field];
  if (!Object.keys(patch).length) throw new Error('INVALID_PERSONAL_DATA'); const newDni = typeof patch.dni === 'string' ? patch.dni.replace(/\D/g, '') : ''; if (newDni && newDni !== String(current.dni ?? '').replace(/\D/g, '')) { try { await candidate(env, `CAN-${newDni}`); throw new Error('DUPLICATE_CANDIDATE'); } catch (error) { if (!(error instanceof Error) || error.message !== 'FIRESTORE_404') throw error; } }
  const selection = isRecord(current.selection) ? current.selection : {}; const traceability = Array.isArray(selection.traceability) ? selection.traceability : []; const now = new Date().toISOString(); const trace = { id: `TR-${crypto.randomUUID()}`, date: now.slice(0, 10), time: now.slice(11, 16), user: actor.displayName, action: 'EDICION', previousStage: current.currentStage, newStage: current.currentStage, observation: 'Datos personales del expediente actualizados.' };
  await firestore(env, `candidates/${id}`, 'PATCH', { fields: fields({ ...patch, selection: { ...selection, traceability: [...traceability, trace] }, updatedAt: now, updatedBy: actor.uid }) }); return response({ ok: true }, 200, cors(request, env));
}
async function createTrainingFromSelection(request: Request, env: Env, actor: Profile) {
  const formationManager=['JEFE_FORMACION','COORDINADOR_FORMACION'].includes(actor.role);
  if(formationManager)requireFormationManager(actor);else requireSelectionManager(actor);
  const input = await request.json<Record<string, unknown>>(); const campaignId = typeof input.campaignId === 'string' ? input.campaignId : ''; const participantIds = Array.isArray(input.candidateIds) ? input.candidateIds.filter((id): id is string => typeof id === 'string') : [];
  const uniqueParticipantIds = [...new Set(participantIds)];
  if (!campaignId || uniqueParticipantIds.length === 0 || typeof input.startDate !== 'string' || typeof input.modality !== 'string') throw new Error('INVALID_TRAINING');
  const campaignData = await campaign(env, campaignId);
  if(formationManager ? campaignData.companyId!==actor.companyId||(actor.role==='COORDINADOR_FORMACION'&&!actor.scope.includes(campaignId)) : !campaignAllowed(actor,campaignData))throw new Error('FORBIDDEN');
  const participants: Record<string, unknown>[] = [];
  for (const id of uniqueParticipantIds) {
    const candidateData = await candidate(env, id); if ((formationManager?candidateData.companyId!==actor.companyId:!candidateAllowed(actor, candidateData)) || candidateData.campaignId !== campaignId) throw new Error('FORBIDDEN'); const selection = isRecord(candidateData.selection) ? candidateData.selection : {};
    if (candidateData.trainingId) throw new Error('CANDIDATE_ALREADY_IN_TRAINING');
    if (selection.stage !== 'APTO_CAPACITACION') throw new Error('CANDIDATE_NOT_READY_FOR_TRAINING');
    participants.push(candidateData);
  }
  if(input.maxCapacity!==undefined&&(numberValue(input.maxCapacity)<=0||numberValue(input.maxCapacity)<uniqueParticipantIds.length))throw new Error('INVALID_CAPACITY');
  const trainingFields = ['name', 'code', 'startDate', 'endDate', 'schedule', 'modality', 'location', 'roomOrLink', 'ojtStartDate', 'ojtEndDate', 'observations', 'passingMinGrade', 'totalDays', 'maxCapacity', 'ojtTotalDays', 'evaluationsConfig'];
  const safeTrainingInput: Record<string, unknown> = {};
  for (const field of trainingFields) if (input[field] !== undefined) safeTrainingInput[field] = input[field];
  const id = `TRN-${crypto.randomUUID()}`; const createdAt = new Date().toISOString(); const training = { ...safeTrainingInput, id, campaignId, companyId: actor.companyId, participantIds: uniqueParticipantIds, status: 'PENDIENTE_ASIGNACION', createdAt, createdBy: actor.uid };
  await firestore(env, `trainings/${id}`, 'PATCH', { fields: fields(training) });
  for (const candidateData of participants) {
    const selection = isRecord(candidateData.selection) ? candidateData.selection : {}; const history = Array.isArray(selection.traceability) ? selection.traceability : [];
    const trace = { id: `TR-${crypto.randomUUID()}`, date: createdAt.slice(0, 10), time: createdAt.slice(11, 16), user: actor.displayName, previousStage: 'APTO_CAPACITACION', newStage: 'APTO_CAPACITACION', observation: `Enviado a Formación: ${id}.` };
    const candidateId = String(candidateData.id);
    const participant = { candidateId, companyId: actor.companyId, campaignId, status: 'PENDIENTE_INICIO', attendance: [], evaluations: [], traceability: [], ojt: { status: 'NO_INICIADO', dailyMetrics: [], traceability: [] }, createdAt };
    await firestore(env, `trainings/${id}/participants/${candidateId}`, 'PATCH', { fields: fields(participant) });
    await firestore(env, `candidates/${candidateId}`, 'PATCH', { fields: fields({ currentProcess: 'FORMACION', trainingId: id, training: { cohortId: id, status: 'PENDIENTE_INICIO', attendance: [], evaluations: [] }, ojt: { status: 'NO_INICIADO', dailyMetrics: [], skillsMatrix: {}, coachingFeedbacks: [] }, selection: { ...selection, traceability: [...history, trace] }, updatedAt: createdAt, updatedBy: actor.uid }) });
  }
  return response(training, 201, cors(request, env));
}
async function assignTrainingTrainer(request: Request, env: Env, actor: Profile, id: string) {
  const training = await requireTrainingManagerAccess(env, actor, id);
  const input = await request.json<{ trainerId?: unknown; notes?: unknown }>();
  const trainerId = typeof input.trainerId === 'string' ? input.trainerId.trim() : '';
  if (!trainerId) throw new Error('INVALID_TRAINER');
  const trainer = unpack((await firestore(env, `users/${trainerId}`)).fields ?? {});
  const trainerModules = strings(trainer.allowedModules).length ? strings(trainer.allowedModules) : strings(trainer.module);
  const trainerActive = trainer.enabled !== false && trainer.status === 'ACTIVO';
  if (trainer.role !== 'FORMADOR' || !trainerActive || !trainerModules.includes('FORMACION')) throw new Error('TRAINER_NOT_AVAILABLE');
  if (trainer.companyId !== training.companyId) throw new Error('TRAINER_COMPANY_MISMATCH');
  const now = new Date().toISOString();
  const previousTrainerId = String(training.trainerId ?? '');
  const trainerName = String(trainer.displayName ?? trainer.name ?? trainer.username ?? 'Formador');
  if (previousTrainerId === trainerId) return response({ ok: true, alreadyAssigned: true, training }, 200, cors(request, env));
  const nextStatus = training.status === 'PENDIENTE_ASIGNACION' ? 'PROGRAMADA' : training.status;
  const history = Array.isArray(training.managementHistory) ? training.managementHistory : [];
  const assignment = { id: `TR-${crypto.randomUUID()}`, action: previousTrainerId ? 'REASIGNACION_FORMADOR' : 'ASIGNACION_FORMADOR', previousTrainerId, trainerId, trainerName, notes: typeof input.notes === 'string' ? input.notes.trim() : '', at: now, by: actor.uid, byName: actor.displayName };
  const patch = { trainerId, trainerName, trainerEmail: String(trainer.username ?? ''), trainerAssignmentNotes: assignment.notes, trainerAssignedAt: now, trainerAssignedBy: actor.uid, status: nextStatus, managementHistory: [...history, assignment], updatedAt: now, updatedBy: actor.uid };
  await firestore(env, `trainings/${id}`, 'PATCH', { fields: fields(patch) });
  await writeAdminAudit(env, actor, previousTrainerId ? 'TRAINER_REASSIGNED' : 'TRAINER_ASSIGNED', id, { trainerId: previousTrainerId, trainerName: training.trainerName }, { trainerId, trainerName }, 'FORMACION', 'training');
  return response({ ok: true, training: { ...training, ...patch } }, 200, cors(request, env));
}

async function availableTrainingTrainers(request: Request, env: Env, actor: Profile, id: string) {
  const training = await requireTrainingManagerAccess(env, actor, id);
  const users = await listFirestore(env, 'users');
  const trainers = users.filter(user => {
    const userModules = strings(user.allowedModules).length ? strings(user.allowedModules) : strings(user.module);
    return user.role === 'FORMADOR' && user.companyId === training.companyId && user.enabled !== false && user.status === 'ACTIVO' && userModules.includes('FORMACION');
  }).map(user => ({ id: String(user.id ?? ''), companyId: String(user.companyId ?? ''), name: String(user.displayName ?? user.name ?? user.username ?? 'Formador'), email: String(user.username ?? ''), avatarUrl: String(user.avatarUrl ?? ''), role: 'FORMADOR', status: 'ACTIVO', allowedModules: ['FORMACION'] }));
  return response({ trainers }, 200, cors(request, env));
}

async function listAssignableUsers(request: Request, env: Env, actor: Profile) {
  const roleGroups: Partial<Record<Role, Role[]>> = {
    JEFE_SELECCION: ['JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'],
    ANALISTA_SELECCION: ['ANALISTA_SELECCION', 'RECLUTADOR'],
    JEFE_FORMACION: ['JEFE_FORMACION', 'COORDINADOR_FORMACION', 'FORMADOR'],
    COORDINADOR_FORMACION: ['COORDINADOR_FORMACION', 'FORMADOR'],
    JEFE_TALENTO: ['JEFE_TALENTO', 'ANALISTA_TALENTO'],
  };
  const allowedRoles = actor.role === 'ADMIN' ? Object.keys(modulesByRole) as Role[] : roleGroups[actor.role];
  if (!allowedRoles) throw new Error('FORBIDDEN');
  const users = (await listFirestore(env, 'users')).filter(user => allowedRoles.includes(user.role as Role) && (actor.role === 'ADMIN' || user.companyId === actor.companyId));
  const safeUsers = users.map(user => ({
    id: String(user.id ?? ''),
    companyId: String(user.companyId ?? ''),
    name: String(user.displayName ?? user.name ?? user.username ?? 'Usuario'),
    email: String(user.username ?? ''),
    avatarUrl: String(user.avatarUrl ?? ''),
    jobTitle: String(user.jobTitle ?? ''),
    role: user.role,
    status: user.enabled === false || user.status === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
    allowedModules: strings(user.allowedModules).length ? strings(user.allowedModules) : strings(user.module),
    scopeCampaignIds: strings(user.scope).length ? strings(user.scope) : strings(user.scopeCampaignIds),
  }));
  return response({ users: safeUsers }, 200, cors(request, env));
}
async function trainingParticipant(env: Env, trainingId: string, candidateId: string): Promise<Record<string, unknown>> {
  try { const data = await firestore(env, `trainings/${trainingId}/participants/${candidateId}`); return unpack(data.fields ?? {}); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== 'FIRESTORE_404') throw error;
    const training = unpack((await firestore(env, `trainings/${trainingId}`)).fields ?? {}); const participantIds = Array.isArray(training.participantIds) ? training.participantIds : [];
    if (!participantIds.includes(candidateId)) throw new Error('PARTICIPANT_NOT_FOUND');
    const created = { candidateId, companyId: training.companyId, campaignId: training.campaignId, status: 'PENDIENTE_INICIO', attendance: [], evaluations: [], traceability: [], ojt: { status: 'NO_INICIADO', dailyMetrics: [], traceability: [] }, createdAt: new Date().toISOString() };
    await firestore(env, `trainings/${trainingId}/participants/${candidateId}`, 'PATCH', { fields: fields(created) }); return created;
  }
}
async function requireTrainingAccess(env: Env, actor: Profile, trainingId: string): Promise<Record<string, unknown>> {
  const training = unpack((await firestore(env, `trainings/${trainingId}`)).fields ?? {});
  const allowed = actor.role === 'ADMIN' || actor.role === 'JEFE_FORMACION' || (actor.role === 'COORDINADOR_FORMACION' && (actor.scope.includes(String(training.campaignId ?? '')) || training.coordinatorId === actor.uid)) || (actor.role === 'FORMADOR' && training.trainerId === actor.uid);
  if (!allowed || !actor.allowedModules.includes('FORMACION') || (training.companyId !== actor.companyId && actor.role !== 'ADMIN')) throw new Error('FORBIDDEN'); return training;
}
async function requireTrainingManagerAccess(env: Env, actor: Profile, trainingId: string): Promise<Record<string, unknown>> {
  const training = await requireTrainingAccess(env, actor, trainingId); if (!['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION'].includes(actor.role)) throw new Error('FORBIDDEN'); return training;
}

type AttendanceWindowState = 'UPCOMING' | 'OPEN' | 'LOCKED' | 'UNLOCKED';
type AttendanceUnlock = Record<string, unknown> & { status?: string };
const attendanceUnlockId = (trainingId: string, date: string) => `${trainingId.replace(/[^a-zA-Z0-9_-]/g, '_')}--${date}`;
async function attendanceUnlock(env: Env, trainingId: string, date: string): Promise<AttendanceUnlock | null> {
  try { return unpack((await firestore(env, `attendanceUnlockRequests/${attendanceUnlockId(trainingId, date)}`)).fields ?? {}); }
  catch (error) { if (error instanceof Error && error.message === 'FIRESTORE_404') return null; throw error; }
}
async function attendanceWindow(env: Env, trainingId: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_ATTENDANCE_DATE');
  // La marcación es una ventana diaria fija, independiente del horario de clases.
  const startAt = new Date(`${date}T09:00:00-05:00`);
  if (Number.isNaN(startAt.getTime())) throw new Error('INVALID_ATTENDANCE_SCHEDULE');
  const closesAt = new Date(`${date}T21:30:00-05:00`);
  const serverNow = new Date();
  const unlock = await attendanceUnlock(env, trainingId, date);
  const state: AttendanceWindowState = unlockIsActive(unlock, serverNow.getTime())
    ? 'UNLOCKED'
    : serverNow < startAt ? 'UPCOMING' : serverNow <= closesAt ? 'OPEN' : 'LOCKED';
  return { serverNow: serverNow.toISOString(), startAt: startAt.toISOString(), closesAt: closesAt.toISOString(), state, unlock };
}
async function attendanceWindowResponse(request: Request, env: Env, actor: Profile, trainingId: string, date: string) {
  await requireTrainingAccess(env, actor, trainingId);
  return response(await attendanceWindow(env, trainingId, date), 200, cors(request, env));
}
async function requestAttendanceUnlock(request: Request, env: Env, actor: Profile, trainingId: string, date: string) {
  const training = await requireTrainingAccess(env, actor, trainingId);
  if (actor.role !== 'FORMADOR' || training.trainerId !== actor.uid) throw new Error('FORBIDDEN');
  const input = await request.json<Record<string, unknown>>(); const reason = String(input.reason ?? '').trim();
  if (reason.length < 5) throw new Error('ATTENDANCE_UNLOCK_REASON_REQUIRED');
  const window = await attendanceWindow(env, trainingId, date);
  if (window.state === 'OPEN' || window.state === 'UPCOMING') throw new Error('ATTENDANCE_WINDOW_NOT_LOCKED');
  const now = new Date().toISOString(); const id = attendanceUnlockId(trainingId, date);
  if (window.unlock?.status === 'PENDIENTE' || window.state === 'UNLOCKED') throw new Error('ATTENDANCE_UNLOCK_ALREADY_REQUESTED');
  if (env.RELATIONAL_RUNTIME) {
    const record = await env.RELATIONAL_RUNTIME.requestUnlock(trainingId, date, reason);
    return response(record, 201, cors(request, env));
  }
  const record = { id, trainingId, date, companyId: actor.companyId, campaignId: training.campaignId, trainerId: actor.uid, trainerName: actor.displayName, reason, status: 'PENDIENTE', requestedAt: now, requestedBy: actor.uid, audit: [{ action: 'SOLICITADA', at: now, by: actor.uid, byName: actor.displayName, reason }] };
  await firestore(env, `attendanceUnlockRequests/${id}`, 'PATCH', { fields: fields(record) });
  await writeAdminAudit(env, actor, 'ATTENDANCE_UNLOCK_REQUESTED', id, null, { trainingId, date, reason });
  return response(record, 201, cors(request, env));
}
async function decideAttendanceUnlock(request: Request, env: Env, actor: Profile, trainingId: string, date: string) {
  await requireTrainingManagerAccess(env, actor, trainingId); const current = await attendanceUnlock(env, trainingId, date);
  if (!current) throw new Error('ATTENDANCE_UNLOCK_NOT_FOUND');
  if (current.status !== 'PENDIENTE') throw new Error('ATTENDANCE_UNLOCK_ALREADY_REQUESTED');
  const input = await request.json<Record<string, unknown>>(); const decision = String(input.decision ?? ''); const reason = String(input.reason ?? '').trim();
  if (!['APROBADA', 'RECHAZADA'].includes(decision)) throw new Error('INVALID_ATTENDANCE_UNLOCK_DECISION');
  const now = new Date().toISOString(); const id = attendanceUnlockId(trainingId, date); const audit = Array.isArray(current.audit) ? current.audit : [];
  if (env.RELATIONAL_RUNTIME) {
    const next = await env.RELATIONAL_RUNTIME.decideUnlock(id, decision === 'APROBADA', reason || (decision === 'APROBADA' ? 'Corrección de asistencia autorizada.' : 'Solicitud rechazada.'), decision === 'APROBADA' ? new Date(Date.now()+30*60000).toISOString() : null);
    return response(next, 200, cors(request, env));
  }
  const next = { ...current, status: decision, expiresAt: decision === 'APROBADA' ? new Date(Date.now() + 30 * 60000).toISOString() : null, decisionReason: reason, decidedAt: now, decidedBy: actor.uid, decidedByName: actor.displayName, audit: [...audit, { action: decision, at: now, by: actor.uid, byName: actor.displayName, reason }] };
  await firestore(env, `attendanceUnlockRequests/${id}`, 'PATCH', { fields: fields(next) });
  await writeAdminAudit(env, actor, decision === 'APROBADA' ? 'ATTENDANCE_UNLOCK_APPROVED' : 'ATTENDANCE_UNLOCK_REJECTED', id, current, next);
  return response(next, 200, cors(request, env));
}
async function updateTrainingManagement(request: Request, env: Env, actor: Profile, trainingId: string) {
  const training = await requireTrainingManagerAccess(env, actor, trainingId); const input = await request.json<Record<string, unknown>>(); const operation = String(input.operation ?? ''); const now = new Date().toISOString();
  if (operation === 'COORDINATOR') { if (typeof input.coordinatorId !== 'string' || typeof input.coordinatorName !== 'string') throw new Error('INVALID_COORDINATOR'); await firestore(env, `trainings/${trainingId}`, 'PATCH', { fields: fields({ coordinatorId: input.coordinatorId, coordinatorName: input.coordinatorName, updatedAt: now, updatedBy: actor.uid }) }); }
  else if (operation === 'STATUS') { const status = String(input.status ?? ''); const transitions: Record<string, string[]> = { PENDIENTE_ASIGNACION: ['PROGRAMADA', 'CANCELADA'], PROGRAMADA: ['EN_CAPACITACION', 'CANCELADA'], EN_CAPACITACION: ['EN_OJT', 'CANCELADA'], EN_OJT: ['EXTENSION_OJT', 'FINALIZADA'], EXTENSION_OJT: ['FINALIZADA'] }; if (!transitions[String(training.status ?? '')]?.includes(status)) throw new Error('INVALID_TRAINING_TRANSITION'); await firestore(env, `trainings/${trainingId}`, 'PATCH', { fields: fields({ status, statusReason: typeof input.reason === 'string' ? input.reason : '', updatedAt: now, updatedBy: actor.uid }) }); }
  else if (operation === 'DETAILS') { const allowed = ['name', 'startDate', 'endDate', 'schedule', 'modality', 'location', 'roomOrLink', 'observations']; const patch: Record<string, unknown> = {}; for (const field of allowed) if (input[field] !== undefined) patch[field] = input[field]; if (!Object.keys(patch).length) throw new Error('INVALID_TRAINING_DATA'); await firestore(env, `trainings/${trainingId}`, 'PATCH', { fields: fields({ ...patch, updatedAt: now, updatedBy: actor.uid }) }); }
  else if (operation === 'EVALUATION_CONFIG') { const config = isRecord(input.config) ? input.config : {}; if (!validEvaluationDefinition(config)) throw new Error('INVALID_EVALUATION'); const list = Array.isArray(training.evaluationsConfig) ? training.evaluationsConfig : []; await firestore(env, `trainings/${trainingId}`, 'PATCH', { fields: fields({ evaluationsConfig: [...list, { ...config, id: `EV-${crypto.randomUUID()}` }], updatedAt: now, updatedBy: actor.uid }) }); }
  else if (operation === 'OJT_EXTENSION') { const days = numberValue(input.additionalDays); if (days < 1 || days > 30 || !String(input.reason ?? '').trim()) throw new Error('INVALID_OJT_EXTENSION'); await firestore(env, `trainings/${trainingId}`, 'PATCH', { fields: fields({ ojtExtensionDays: numberValue(training.ojtExtensionDays) + days, status: 'EXTENSION_OJT', extensionReason: input.reason, updatedAt: now, updatedBy: actor.uid }) }); }
  else throw new Error('INVALID_TRAINING_OPERATION');
  return response({ ok: true }, 200, cors(request, env));
}
async function syncCandidateTraining(env: Env, candidateId: string, participant: Record<string, unknown>, actor: Profile) {
  const current = await candidate(env, candidateId);
  const training = isRecord(current.training) ? current.training : {};
  const currentOjt = isRecord(current.ojt) ? current.ojt : {};
  const participantOjt = isRecord(participant.ojt) ? participant.ojt : currentOjt;
  const status = typeof participant.status === 'string' ? participant.status : training.status;
  const currentStage = status === 'EN_OJT' ? 'OJT' : ['OJT_APROBADO', 'APTO_ALTA'].includes(String(status)) ? 'APTO_ALTA' : ['NO_APTO', 'OJT_NO_APROBADO', 'DESERTO', 'NSP'].includes(String(status)) ? 'BAJA' : 'CAPACITACION';
  await firestore(env, `candidates/${candidateId}`, 'PATCH', { fields: fields({
    currentStage,
    training: { ...training, status, attendance: Array.isArray(participant.attendance) ? participant.attendance : [], evaluations: Array.isArray(participant.evaluations) ? participant.evaluations : [] },
    ojt: { ...currentOjt, ...participantOjt },
    updatedAt: new Date().toISOString(), updatedBy: actor.uid,
  }) });
}
async function appendParticipantHistory(request: Request, env: Env, actor: Profile, trainingId: string, candidateId: string, kind: 'attendance' | 'evaluations' | 'status') {
  const training = await requireTrainingAccess(env, actor, trainingId); const participant = await trainingParticipant(env, trainingId, candidateId); const input = await request.json<Record<string, unknown>>(); const now = new Date().toISOString();
  if (kind === 'status') {
    if (input.status === 'EN_CAPACITACION' && training.status !== 'EN_CAPACITACION') throw new Error('INVALID_PARTICIPANT_STATUS');
    const status = input.status;
    const transitions: Record<string, string[]> = { PENDIENTE_INICIO: ['EN_CAPACITACION', 'REPROGRAMADO'], EN_CAPACITACION: ['NO_APTO', 'REPROGRAMADO'], REPROGRAMADO: ['PENDIENTE_INICIO', 'EN_CAPACITACION'] };
    if (typeof status !== 'string' || !transitions[String(participant.status ?? 'PENDIENTE_INICIO')]?.includes(status)) throw new Error('INVALID_PARTICIPANT_STATUS');
    const traceability = Array.isArray(participant.traceability) ? participant.traceability : []; const item = { date: now, userId: actor.uid, userName: actor.displayName, status, reason: typeof input.reason === 'string' ? input.reason : '' };
    const next = { ...participant, candidateId, status, traceability: [...traceability, item], updatedAt: now };
    await firestore(env, `trainings/${trainingId}/participants/${candidateId}`, 'PATCH', { fields: fields(next) });
    await syncCandidateTraining(env, candidateId, next, actor);
  } else {
    const field = kind; const history = Array.isArray(participant[field]) ? participant[field] : []; const entry = { ...input, id: `${kind}-${crypto.randomUUID()}`, candidateId, recordedAt: now, trainerId: actor.uid, trainerName: actor.displayName };
    if (kind === 'attendance' && (typeof input.date !== 'string' || !['PRESENTE', 'TARDANZA', 'FALTA', 'JUSTIFICADO', 'NSP', 'FALTA_JUSTIFICADA', 'FALTA_INJUSTIFICADA'].includes(String(input.attendance ?? input.status)))) throw new Error('INVALID_ATTENDANCE');
    if (kind === 'evaluations') {
      if (participant.status !== 'EN_CAPACITACION' || ['FINALIZADA', 'CANCELADA'].includes(String(training.status))) throw new Error('INVALID_PARTICIPANT_STATUS');
      const evaluationId = String(input.evaluationId ?? '');
      const definition = evaluationDefinition(training.evaluationsConfig, evaluationId);
      if (!definition || !validEvaluationDefinition(definition)) throw new Error('INVALID_EVALUATION');
      const score = input.score;
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > Number(definition.maxScore)) throw new Error('INVALID_EVALUATION');
      if (history.some(item => isRecord(item) && String(item.evaluationId ?? item.definitionId ?? '') === evaluationId)) throw new Error('EVALUATION_ALREADY_RECORDED');
      // Never persist client-supplied thresholds, results or definition snapshots.
      Object.keys(entry).forEach(key => delete (entry as Record<string, unknown>)[key]);
      Object.assign(entry, { id: `evaluations-${crypto.randomUUID()}`, candidateId, evaluationId,
        name: definition.name, moduleName: definition.name, score, maxScore: definition.maxScore,
        minRequired: definition.minScore, result: score >= Number(definition.minScore) ? 'APROBADO' : 'NO_APROBADO',
        date: limaDay(), recordedAt: now, trainerId: actor.uid, trainerName: actor.displayName });
    }
    let nextHistory = [...history, entry];
    if (kind === 'attendance' && typeof input.date === 'string') {
      const window = await attendanceWindow(env, trainingId, input.date);
      if (window.state !== 'OPEN' && window.state !== 'UNLOCKED') throw new Error('ATTENDANCE_WINDOW_LOCKED');
      const previous = history.find(item => isRecord(item) && item.date === input.date);
      nextHistory = [...history.filter(item => !isRecord(item) || item.date !== input.date), { ...entry, dayNumber: trainingDayNumber(String(training.startDate ?? input.date), input.date), editedAfterUnlock: window.state === 'UNLOCKED', previousValue: previous ?? null }];
      if (window.state === 'UNLOCKED') await writeAdminAudit(env, actor, 'ATTENDANCE_UPDATED_AFTER_UNLOCK', `${trainingId}:${candidateId}:${input.date}`, previous ?? null, entry);
    }
    const next = { ...participant, candidateId, [field]: nextHistory, updatedAt: now };
    await firestore(env, `trainings/${trainingId}/participants/${candidateId}`, 'PATCH', { fields: fields(next) });
    await syncCandidateTraining(env, candidateId, next, actor);
  }
  return response({ ok: true }, 201, cors(request, env));
}
async function ojtParticipant(request: Request, env: Env, actor: Profile, trainingId: string, candidateId: string, action: 'start' | 'daily' | 'result') {
  const training = await requireTrainingAccess(env, actor, trainingId); const participant = await trainingParticipant(env, trainingId, candidateId); const input = await request.json<Record<string, unknown>>(); const now = new Date().toISOString();
  if (['FINALIZADA', 'CANCELADA'].includes(String(training.status))) throw new Error('INVALID_OJT_STATUS');
  const ojt = isRecord(participant.ojt) ? participant.ojt : {}; const traceability = Array.isArray(ojt.traceability) ? ojt.traceability : [];
  if (action === 'start') {
    const evaluationsApproved = trainingEvaluationsApproved(training.evaluationsConfig, participant.evaluations);
    if (participant.status !== 'EN_CAPACITACION' || !evaluationsApproved) throw new Error('PARTICIPANT_NOT_READY_FOR_OJT');
    const next = { ...ojt, status: 'EN_OJT', startDate: limaDay(), traceability: [...traceability, { date: now, userId: actor.uid, userName: actor.displayName, status: 'EN_OJT', reason: typeof input.reason === 'string' ? input.reason : '' }] };
    const updated = { ...participant, trainingApproved: true, status: 'EN_OJT', ojt: next, updatedAt: now };
    await firestore(env, `trainings/${trainingId}/participants/${candidateId}`, 'PATCH', { fields: fields(updated) });
    await syncCandidateTraining(env, candidateId, updated, actor);
  } else if (action === 'daily') {
    if (participant.status !== 'EN_OJT' || ojt.status !== 'EN_OJT') throw new Error('INVALID_OJT_STATUS');
    const hours = numberValue(input.hoursManaged); const sales = numberValue(input.sales); if (hours <= 0 || sales < 0 || typeof input.date !== 'string') throw new Error('INVALID_OJT_METRIC');
    const history = Array.isArray(ojt.dailyMetrics) ? ojt.dailyMetrics : []; if (history.some(item => isRecord(item) && item.date === input.date)) throw new Error('OJT_DAY_ALREADY_RECORDED');
    const extra: Record<string, number> = {};
    for (const key of ['ahtSeconds', 'qaScore', 'calls', 'leads', 'conversions']) {
      if (input[key] === undefined) continue;
      const value = input[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (key === 'qaScore' && value > 100) || (['calls', 'leads', 'conversions'].includes(key) && !Number.isInteger(value))) throw new Error('INVALID_OJT_METRIC');
      extra[key] = value;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date)) || !Number.isFinite(Date.parse(String(input.date)+'T12:00:00Z')) || !Number.isInteger(sales)) throw new Error('INVALID_OJT_METRIC');
    const metric = { ...extra, id: `OJT-${crypto.randomUUID()}`, date: input.date, attendance: input.attendance, hoursManaged: hours, sales, sph: Number((sales / hours).toFixed(2)), spd: Number(sales.toFixed(2)), feedback: input.feedback, observations: input.observations, trainerId: actor.uid, trainerName: actor.displayName, recordedAt: now };
    const updated = { ...participant, ojt: { ...ojt, dailyMetrics: [...history, metric] }, updatedAt: now };
    await firestore(env, `trainings/${trainingId}/participants/${candidateId}`, 'PATCH', { fields: fields(updated) });
    await syncCandidateTraining(env, candidateId, updated, actor);
  } else {
    if (participant.status !== 'EN_OJT' || ojt.status !== 'EN_OJT' || !trainingEvaluationsApproved(training.evaluationsConfig, participant.evaluations)) throw new Error('PARTICIPANT_NOT_READY_FOR_OJT');
    const status = input.status; if (typeof status !== 'string' || !['OJT_APROBADO', 'OJT_NO_APROBADO', 'DESERTO', 'NSP', 'REPROGRAMADO'].includes(status)) throw new Error('INVALID_OJT_STATUS');
    const next = { ...ojt, status, resultDate: limaDay(), traceability: [...traceability, { date: now, userId: actor.uid, userName: actor.displayName, status, reason: typeof input.reason === 'string' ? input.reason : '' }] };
    const updated = { ...participant, status, ojt: next, updatedAt: now };
    await firestore(env, `trainings/${trainingId}/participants/${candidateId}`, 'PATCH', { fields: fields(updated) });
    await syncCandidateTraining(env, candidateId, updated, actor);
  }
  return response({ ok: true }, 201, cors(request, env));
}
async function updateOjtSupplement(request: Request, env: Env, actor: Profile, trainingId: string, candidateId: string, action: 'skills' | 'feedback') {
  await requireTrainingAccess(env, actor, trainingId); const participant = await trainingParticipant(env, trainingId, candidateId); const input = await request.json<Record<string, unknown>>(); const ojt = isRecord(participant.ojt) ? participant.ojt : {}; const now = new Date().toISOString();
  const nextOjt = action === 'skills'
    ? { ...ojt, skillsMatrix: input, skillsUpdatedAt: now, skillsUpdatedBy: actor.uid }
    : { ...ojt, coachingFeedbacks: [...(Array.isArray(ojt.coachingFeedbacks) ? ojt.coachingFeedbacks : []), { ...input, id: `FB-${crypto.randomUUID()}`, trainerId: actor.uid, trainerName: actor.displayName, recordedAt: now }] };
  const updated = { ...participant, ojt: nextOjt, updatedAt: now }; await firestore(env, `trainings/${trainingId}/participants/${candidateId}`, 'PATCH', { fields: fields(updated) }); await syncCandidateTraining(env, candidateId, updated, actor); return response({ ok: true }, 201, cors(request, env));
}
async function registerParticipantDropout(request: Request, env: Env, actor: Profile, trainingId: string, candidateId: string) {
  await requireTrainingAccess(env, actor, trainingId); const participant = await trainingParticipant(env, trainingId, candidateId); const input = await request.json<Record<string, unknown>>(); if (!['CAPACITACION_TEORICA', 'OJT'].includes(String(input.stage)) || !String(input.category ?? '').trim() || !String(input.observation ?? '').trim()) throw new Error('INVALID_DROPOUT'); const now = new Date().toISOString(); const traceability = Array.isArray(participant.traceability) ? participant.traceability : []; const dropoutRecord = { id: `DRP-${crypto.randomUUID()}`, date: now.slice(0, 10), stage: input.stage, category: input.category, observation: input.observation, userId: actor.uid, userName: actor.displayName };
  const updated = { ...participant, status: 'DESERTO', dropoutRecord, traceability: [...traceability, { date: now, userId: actor.uid, userName: actor.displayName, status: 'DESERTO', reason: input.observation }], ojt: { ...(isRecord(participant.ojt) ? participant.ojt : {}), status: input.stage === 'OJT' ? 'DESERTO' : 'NO_INICIADO' }, updatedAt: now }; await firestore(env, `trainings/${trainingId}/participants/${candidateId}`, 'PATCH', { fields: fields(updated) }); await syncCandidateTraining(env, candidateId, updated, actor); return response({ ok: true }, 201, cors(request, env));
}
const documentStatuses = ['PENDING', 'UPLOADED', 'VALIDATED', 'OBSERVED'] as const;
type DocumentStatus = typeof documentStatuses[number];
function uiDocumentStatus(status: DocumentStatus): string {
  return ({ PENDING: 'PENDIENTE', UPLOADED: 'CARGADO', VALIDATED: 'VALIDADO', OBSERVED: 'OBSERVADO' } as const)[status];
}
function safeObjectPart(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100); }
function requireFormationManager(actor: Profile) {
  if (!['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION'].includes(actor.role) || !actor.allowedModules.includes('FORMACION')) throw new Error('FORBIDDEN');
}
async function requireDocumentAccess(env: Env, actor: Profile, candidateId: string): Promise<Record<string, unknown>> {
  const candidateData = await candidate(env, candidateId);
  if (['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION'].includes(actor.role)) { await candidateTrainingAccess(env, actor, candidateId); return candidateData; }
  if (talentAllowed(actor, candidateData) && (candidateData.currentProcess === 'GESTION_TALENTO' || candidateData.currentStage === 'GESTION_TALENTO')) return candidateData;
  throw new Error('FORBIDDEN');
}
async function candidateTrainingAccess(env: Env, actor: Profile, candidateId: string): Promise<{ candidateData: Record<string, unknown>; trainingId: string }> {
  const candidateData = await candidate(env, candidateId);
  const trainingId = typeof candidateData.trainingId === 'string' ? candidateData.trainingId : (isRecord(candidateData.training) && typeof candidateData.training.cohortId === 'string' ? candidateData.training.cohortId : '');
  if (!trainingId) throw new Error('CANDIDATE_NOT_IN_TRAINING');
  await requireTrainingAccess(env, actor, trainingId);
  return { candidateData, trainingId };
}
async function candidateDocuments(env: Env, candidateId: string): Promise<Record<string, unknown>[]> {
  return listFirestore(env, `candidates/${candidateId}/documents`);
}
async function projectDocumentsToCandidate(env: Env, candidateId: string, documents: Record<string, unknown>[], actor: Profile, observation: string) {
  const candidateData = await candidate(env, candidateId);
  const selection = isRecord(candidateData.selection) ? candidateData.selection : {}; const traceability = Array.isArray(selection.traceability) ? selection.traceability : []; const now = new Date().toISOString();
  const trace = { id: `TR-${crypto.randomUUID()}`, date: now.slice(0, 10), time: now.slice(11, 16), user: actor.displayName, action: 'DOCUMENTACION', previousStage: candidateData.currentStage, newStage: candidateData.currentStage, observation };
  const summary = { total: documents.length, uploaded: documents.filter(document => document.status === 'UPLOADED').length, validated: documents.filter(document => document.status === 'VALIDATED').length, observed: documents.filter(document => document.status === 'OBSERVED').length };
  await firestore(env, `candidates/${candidateId}`, 'PATCH', { fields: fields({ documentSummary: summary, selection: { ...selection, traceability: [...traceability, trace] }, updatedAt: now, updatedBy: actor.uid }) });
}
async function listCandidateDocumentsResponse(request: Request, env: Env, actor: Profile, candidateId: string) {
  const candidateData=await candidate(env,candidateId);
  const cvOnly=['JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'].includes(actor.role)||(actor.role==='ADMIN'&&!candidateData.trainingId);
  if(cvOnly){requireSelectionUser(actor);if(!await candidateAllowedWithAssignment(env,actor,candidateData))throw new Error('FORBIDDEN');}else await requireDocumentAccess(env,actor,candidateId);
  const documents=(await candidateDocuments(env,candidateId)).filter(d=>!cvOnly||d.type==='CV');
  const safeDocuments = documents.map(({ objectKey: _objectKey, ...document }) => ({ ...document, status: uiDocumentStatus(String(document.status) as DocumentStatus) }));
  return response(safeDocuments, 200, cors(request, env));
}
async function createCandidateDocument(request: Request, env: Env, actor: Profile, candidateId: string) {
  const form = await request.formData(); const fileValue = form.get('file'); const nameValue = form.get('name'); const typeValue = form.get('type');
  let candidateData:Record<string,unknown>;
  if(typeValue==='CV'&&['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'].includes(actor.role)){
    requireSelectionUser(actor);candidateData=await candidate(env,candidateId);if(!await candidateAllowedWithAssignment(env,actor,candidateData))throw new Error('FORBIDDEN');
  }else candidateData=await requireDocumentAccess(env,actor,candidateId);
  if (!(fileValue instanceof File) || typeof nameValue !== 'string' || typeof typeValue !== 'string') throw new Error('INVALID_DOCUMENT');
  const allowedMime = ['application/pdf', 'image/jpeg', 'image/png',...(typeValue==='CV'?['application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']:[])]; const maxBytes = Math.min(Number(env.MAX_UPLOAD_BYTES) || 10_485_760, 10_485_760);
  if (!allowedMime.includes(fileValue.type) || fileValue.size <= 0 || fileValue.size > maxBytes) throw new Error('INVALID_DOCUMENT_FILE');
  const documentId = `DOC-${crypto.randomUUID()}`; const objectKey = `companies/${safeObjectPart(String(candidateData.companyId))}/candidates/${safeObjectPart(candidateId)}/documents/${documentId}-${safeObjectPart(fileValue.name)}`; const now = new Date().toISOString();
  await env.DOCUMENTS.put(objectKey, fileValue.stream(), { httpMetadata: { contentType: fileValue.type }, customMetadata: { candidateId, documentId } });
  const document = { id: documentId, candidateId, companyId: candidateData.companyId, name: nameValue.trim(), type: typeValue, status: 'UPLOADED', isMandatory: form.get('isMandatory') === 'true', uploadDate: now.slice(0, 10), uploadedAt: now, uploadedBy: actor.uid, fileName: fileValue.name, fileSizeBytes: fileValue.size, mimeType: fileValue.type, objectKey };
  try {
    await firestore(env, `candidates/${candidateId}/documents/${documentId}`, 'PATCH', { fields: fields(document) });
  } catch (error) {
    await env.DOCUMENTS.delete(objectKey);
    throw error;
  }
  await projectDocumentsToCandidate(env, candidateId, await candidateDocuments(env, candidateId), actor, `Documento cargado: ${nameValue.trim()}.`);
  return response({ id: documentId, status: 'UPLOADED' }, 201, cors(request, env));
}
async function updateCandidateDocument(request: Request, env: Env, actor: Profile, candidateId: string, documentId: string) {
  await requireDocumentAccess(env, actor, candidateId);
  const current = unpack((await firestore(env, `candidates/${candidateId}/documents/${documentId}`)).fields ?? {}); const input = await request.json<Record<string, unknown>>();
  if (typeof input.status !== 'string' || !documentStatuses.includes(input.status as DocumentStatus)) throw new Error('INVALID_DOCUMENT_STATUS');
  const now = new Date().toISOString(); const status = input.status as DocumentStatus;
  const updated = { ...current, status, isMandatory: typeof input.isMandatory === 'boolean' ? input.isMandatory : current.isMandatory, notes: typeof input.notes === 'string' ? input.notes : current.notes, validatedBy: status === 'VALIDATED' ? actor.displayName : current.validatedBy, validatedAt: status === 'VALIDATED' ? now : current.validatedAt, observedBy: status === 'OBSERVED' ? actor.displayName : current.observedBy, observedAt: status === 'OBSERVED' ? now : current.observedAt, updatedAt: now, updatedBy: actor.uid };
  await firestore(env, `candidates/${candidateId}/documents/${documentId}`, 'PATCH', { fields: fields(updated) });
  await projectDocumentsToCandidate(env, candidateId, await candidateDocuments(env, candidateId), actor, `Documento ${documentId} actualizado a ${status}.`);
  return response({ ok: true, status }, 200, cors(request, env));
}
async function replaceCandidateDocument(request: Request, env: Env, actor: Profile, candidateId: string, documentId: string) {
  const candidateData = await requireDocumentAccess(env, actor, candidateId); const current = unpack((await firestore(env, `candidates/${candidateId}/documents/${documentId}`)).fields ?? {}); const form = await request.formData(); const fileValue = form.get('file');
  if (!(fileValue instanceof File)) throw new Error('INVALID_DOCUMENT'); const allowedMime = ['application/pdf', 'image/jpeg', 'image/png']; const maxBytes = Math.min(Number(env.MAX_UPLOAD_BYTES) || 10_485_760, 10_485_760); if (!allowedMime.includes(fileValue.type) || fileValue.size <= 0 || fileValue.size > maxBytes) throw new Error('INVALID_DOCUMENT_FILE');
  const objectKey = `companies/${safeObjectPart(String(candidateData.companyId))}/candidates/${safeObjectPart(candidateId)}/documents/${documentId}-${crypto.randomUUID()}-${safeObjectPart(fileValue.name)}`; await env.DOCUMENTS.put(objectKey, fileValue.stream(), { httpMetadata: { contentType: fileValue.type }, customMetadata: { candidateId, documentId } });
  const updated = { ...current, status: 'UPLOADED', objectKey, fileName: fileValue.name, fileSizeBytes: fileValue.size, mimeType: fileValue.type, uploadedAt: new Date().toISOString(), uploadedBy: actor.uid, validatedAt: null, validatedBy: null, observedAt: null, observedBy: null };
  try {
    await firestore(env, `candidates/${candidateId}/documents/${documentId}`, 'PATCH', { fields: fields(updated) });
  } catch (error) {
    await env.DOCUMENTS.delete(objectKey);
    throw error;
  }
  if (typeof current.objectKey === 'string' && current.objectKey !== objectKey) await env.DOCUMENTS.delete(current.objectKey);
  await projectDocumentsToCandidate(env, candidateId, await candidateDocuments(env, candidateId), actor, `Documento reemplazado: ${String(current.name ?? documentId)}.`);
  return response({ ok: true, status: 'UPLOADED' }, 200, cors(request, env));
}
async function downloadCandidateDocument(request: Request, env: Env, actor: Profile, candidateId: string, documentId: string) {
  const candidateData=await candidate(env,candidateId);
  const document = unpack((await firestore(env, `candidates/${candidateId}/documents/${documentId}`)).fields ?? {}); const objectKey = typeof document.objectKey === 'string' ? document.objectKey : '';
  if(document.type==='CV'&&['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'].includes(actor.role)){requireSelectionUser(actor);if(!await candidateAllowedWithAssignment(env,actor,candidateData))throw new Error('FORBIDDEN');}else await requireDocumentAccess(env,actor,candidateId);
  if (!objectKey) throw new Error('DOCUMENT_FILE_NOT_FOUND'); const object = await env.DOCUMENTS.get(objectKey); if (!object) throw new Error('DOCUMENT_FILE_NOT_FOUND');
  const headers = new Headers(cors(request, env)); object.writeHttpMetadata(headers); headers.set('content-disposition', `attachment; filename="${safeObjectPart(String(document.fileName ?? 'documento'))}"`); headers.set('cache-control', 'private, no-store');
  return new Response(object.body, { headers });
}
async function saveSalaryAccount(request: Request, env: Env, actor: Profile, candidateId: string) {
  requireFormationManager(actor); const { candidateData } = await candidateTrainingAccess(env, actor, candidateId); const input = await request.json<Record<string, unknown>>(); const option = input.hasAccount === true ? 'HAS_ACCOUNT' : input.requestOpening === true ? 'REQUEST_OPENING' : '';
  if (!option) throw new Error('INVALID_SALARY_ACCOUNT');
  if (option === 'HAS_ACCOUNT' && (!String(input.bank ?? '').trim() || String(input.accountNumber ?? '').trim().length < 6 || !['PEN', 'USD'].includes(String(input.currency ?? '')))) throw new Error('INVALID_SALARY_ACCOUNT');
  const salaryAccount = { ...input, option, updatedAt: new Date().toISOString(), updatedBy: actor.uid };
  const selection = isRecord(candidateData.selection) ? candidateData.selection : {}; const traceability = Array.isArray(selection.traceability) ? selection.traceability : [];
  const trace = { id: `TR-${crypto.randomUUID()}`, date: new Date().toISOString().slice(0, 10), time: new Date().toISOString().slice(11, 16), user: actor.displayName, action: 'EDICION', previousStage: candidateData.currentStage, newStage: candidateData.currentStage, observation: `Cuenta sueldo registrada: ${option}.` };
  await firestore(env, `candidates/${candidateId}`, 'PATCH', { fields: fields({ salaryAccount, selection: { ...selection, traceability: [...traceability, trace] }, updatedAt: new Date().toISOString(), updatedBy: actor.uid }) });
  return response({ ok: true }, 200, cors(request, env));
}
type Eligibility = { eligible: boolean; trainingApproved: boolean; ojtApproved: boolean; documentsComplete: boolean; salaryAccountComplete: boolean; documentProgress: number; pending: string[] };
async function calculateEligibility(env: Env, actor: Profile, candidateId: string): Promise<Eligibility> {
  const { candidateData, trainingId } = await candidateTrainingAccess(env, actor, candidateId); const participant = await trainingParticipant(env, trainingId, candidateId); const documents = await candidateDocuments(env, candidateId);
  const ojt = isRecord(participant.ojt) ? participant.ojt : {}; const salary = isRecord(candidateData.salaryAccount) ? candidateData.salaryAccount : {};
  const training = await requireTrainingAccess(env, actor, trainingId);
  const trainingApproved = participant.trainingApproved === true && trainingEvaluationsApproved(training.evaluationsConfig, participant.evaluations);
  const ojtApproved = ojt.status === 'OJT_APROBADO' || participant.status === 'OJT_APROBADO';
  const defaultRequiredTypes = ['DNI', 'CV', 'CUL_ANTECEDENTES', 'RECIBO_SERVICIOS']; const requiredDocuments = documents.filter(document => document.isMandatory === true || defaultRequiredTypes.includes(String(document.type))); const validatedRequired = requiredDocuments.filter(document => document.status === 'VALIDATED');
  const validatedTypes = new Set(validatedRequired.map(document => String(document.type))); const documentsComplete = defaultRequiredTypes.every(type => validatedTypes.has(type)) && requiredDocuments.every(document => document.status === 'VALIDATED');
  const salaryAccountComplete = salary.option === 'REQUEST_OPENING' || salary.requestOpening === true || (salary.option === 'HAS_ACCOUNT' && String(salary.bank ?? '').length > 0 && String(salary.accountNumber ?? '').length >= 6) || (salary.hasAccount === true && String(salary.bank ?? '').length > 0 && String(salary.accountNumber ?? '').length >= 6);
  const pending: string[] = []; if (!trainingApproved) pending.push('Capacitación inicial aprobada'); if (!ojtApproved) pending.push('OJT aprobado'); if (!documentsComplete) pending.push('Documentos obligatorios validados'); if (!salaryAccountComplete) pending.push('Cuenta sueldo o solicitud de apertura');
  return { eligible: pending.length === 0, trainingApproved, ojtApproved, documentsComplete, salaryAccountComplete, documentProgress: Math.round((defaultRequiredTypes.filter(type => validatedTypes.has(type)).length / defaultRequiredTypes.length) * 100), pending };
}
async function eligibilityResponse(request: Request, env: Env, actor: Profile, candidateId: string) { return response(await calculateEligibility(env, actor, candidateId), 200, cors(request, env)); }
async function giveCandidateAlta(request: Request, env: Env, actor: Profile, candidateId: string) {
  if (!['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION', 'FORMADOR'].includes(actor.role) || !actor.allowedModules.includes('FORMACION')) throw new Error('FORBIDDEN');
  const { candidateData } = await candidateTrainingAccess(env, actor, candidateId); if (candidateData.currentProcess === 'GESTION_TALENTO' || candidateData.currentStage === 'GESTION_TALENTO') return response({ ok: true, alreadyProcessed: true }, 200, cors(request, env)); const eligibility = await calculateEligibility(env, actor, candidateId); if (!eligibility.eligible) return response({ message: 'CANDIDATE_NOT_ELIGIBLE', pending: eligibility.pending }, 409, cors(request, env));
  const input = await request.json<{ notes?: unknown }>(); const now = new Date().toISOString(); const selection = isRecord(candidateData.selection) ? candidateData.selection : {}; const traceability = Array.isArray(selection.traceability) ? selection.traceability : [];
  const trace = { id: `TR-${crypto.randomUUID()}`, date: now.slice(0, 10), time: now.slice(11, 16), user: actor.displayName, action: 'PASE_ETAPA', previousStage: candidateData.currentStage, newStage: 'GESTION_TALENTO', observation: 'Candidato enviado a Gestión de Talento, pendiente de contratación.', details: typeof input.notes === 'string' ? input.notes : '' };
  const hiring = isRecord(candidateData.hiring) ? candidateData.hiring : {};
  await firestore(env, `candidates/${candidateId}`, 'PATCH', { fields: fields({ currentProcess: 'GESTION_TALENTO', currentStage: 'GESTION_TALENTO', hiring: { ...hiring, status: 'PENDIENTE_CONTRATACION', receivedFromOjtDate: now.slice(0, 10), documentsValidated: true }, eligibility, selection: { ...selection, traceability: [...traceability, trace] }, updatedAt: now, updatedBy: actor.uid }) });
  return response({ ok: true }, 200, cors(request, env));
}
function talentAllowed(actor: Profile, candidateData: Record<string, unknown>): boolean {
  if (actor.role === 'ADMIN') return true;
  if (!actor.allowedModules.includes('TALENTO') || candidateData.companyId !== actor.companyId) return false;
  if (actor.role === 'JEFE_TALENTO') return true;
  return actor.role === 'ANALISTA_TALENTO' && (actor.scope.includes(String(candidateData.campaignId ?? '')) || actor.scope.includes(String(candidateData.companyId ?? '')) || actor.scope.includes(String(isRecord(candidateData.hiring) ? candidateData.hiring.area ?? '' : '')));
}
async function requireTalentCandidate(env: Env, actor: Profile, candidateId: string): Promise<Record<string, unknown>> {
  const candidateData = await candidate(env, candidateId); if (!talentAllowed(actor, candidateData)) throw new Error('FORBIDDEN');
  if (candidateData.currentProcess !== 'GESTION_TALENTO' && candidateData.currentStage !== 'GESTION_TALENTO') throw new Error('CANDIDATE_NOT_IN_TALENT'); return candidateData;
}
function hiringTrace(candidateData: Record<string, unknown>, actor: Profile, previousStatus: string, status: string, reason: string) {
  const now = new Date().toISOString(); const selection = isRecord(candidateData.selection) ? candidateData.selection : {}; const traceability = Array.isArray(selection.traceability) ? selection.traceability : [];
  return { now, selection: { ...selection, traceability: [...traceability, { id: `TR-${crypto.randomUUID()}`, date: now.slice(0, 10), time: now.slice(11, 16), user: actor.displayName, action: 'CONTRATACION', previousStage: previousStatus, newStage: status, observation: reason }] } };
}
async function saveHiringLaborData(request: Request, env: Env, actor: Profile, candidateId: string) {
  const candidateData = await requireTalentCandidate(env, actor, candidateId); const input = await request.json<Record<string, unknown>>();
  if(env.RELATIONAL_ACTOR?.managedCompany){const employer=await env.RELATIONAL_RUNTIME!.get('companies/'+actor.companyId);if(!employer?.legalName||!employer.taxId)throw new Error('COMPANY_LEGAL_REQUIRED');input.company=employer.legalName;input.companyId=actor.companyId;input.companyTaxId=employer.taxId;}
  const required = ['company', 'position', 'campaignOrArea', 'plannedStartDate', 'modality', 'site']; if (required.some(field => !String(input[field] ?? '').trim()) || numberValue(input.remuneration) <= 0 || !['PRESENCIAL', 'REMOTO', 'HIBRIDO'].includes(String(input.modality))) throw new Error('INVALID_LABOR_DATA');
  const hiring = isRecord(candidateData.hiring) ? candidateData.hiring : {}; const previousStatus = String(hiring.status ?? 'PENDIENTE_CONTRATACION'); if (!['PENDIENTE_CONTRATACION', 'REPROGRAMADO', 'EN_REVISION'].includes(previousStatus)) throw new Error('LABOR_DATA_LOCKED'); const status = ['PENDIENTE_CONTRATACION', 'REPROGRAMADO'].includes(previousStatus) ? 'EN_REVISION' : previousStatus; const trace = hiringTrace(candidateData, actor, previousStatus, status, 'Datos laborales revisados y guardados.');
  await firestore(env, `candidates/${candidateId}`, 'PATCH', { fields: fields({ hiring: { ...hiring, status, laborData: { ...input, baseSalary: numberValue(input.remuneration), officialStartDate: input.plannedStartDate, workLocation: input.site }, updatedAt: trace.now, updatedBy: actor.uid }, selection: trace.selection, updatedAt: trace.now, updatedBy: actor.uid }) });
  return response({ ok: true, status }, 200, cors(request, env));
}
const hiringTransitions: Record<string, string[]> = { PENDIENTE_CONTRATACION: ['EN_REVISION', 'CANCELADO', 'REPROGRAMADO'], EN_REVISION: ['CANCELADO', 'REPROGRAMADO'], CONTRATO_GENERADO: ['PENDIENTE_FIRMA', 'CANCELADO', 'REPROGRAMADO'], PENDIENTE_FIRMA: ['CANCELADO', 'REPROGRAMADO'], REPROGRAMADO: ['EN_REVISION', 'CANCELADO'] };
async function changeHiringStatus(request: Request, env: Env, actor: Profile, candidateId: string) {
  const candidateData = await requireTalentCandidate(env, actor, candidateId); const input = await request.json<{ status?: unknown; reason?: unknown }>(); const hiring = isRecord(candidateData.hiring) ? candidateData.hiring : {}; const previousStatus = String(hiring.status ?? 'PENDIENTE_CONTRATACION'); const status = typeof input.status === 'string' ? input.status : ''; const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!hiringTransitions[previousStatus]?.includes(status) || !reason) throw new Error('INVALID_HIRING_TRANSITION'); const trace = hiringTrace(candidateData, actor, previousStatus, status, reason);
  await firestore(env, `candidates/${candidateId}`, 'PATCH', { fields: fields({ hiring: { ...hiring, status, updatedAt: trace.now, updatedBy: actor.uid }, selection: trace.selection, updatedAt: trace.now, updatedBy: actor.uid }) }); return response({ ok: true, status }, 200, cors(request, env));
}
async function generateHiringContract(request: Request, env: Env, actor: Profile, candidateId: string) {
  let employer:Record<string,unknown>|undefined;
  if(env.RELATIONAL_ACTOR?.managedCompany){const company=await env.RELATIONAL_RUNTIME!.get('companies/'+actor.companyId);if(!company?.legalName||!company.taxId)throw new Error('COMPANY_LEGAL_REQUIRED');employer={companyId:actor.companyId,legalName:company.legalName,taxId:company.taxId};}
  const candidateData = await requireTalentCandidate(env, actor, candidateId); const hiring = isRecord(candidateData.hiring) ? candidateData.hiring : {}; if (hiring.status !== 'EN_REVISION' || !isRecord(hiring.laborData)) throw new Error('HIRING_NOT_READY_FOR_CONTRACT');
  const documents = await candidateDocuments(env, candidateId); const requiredTypes = ['DNI', 'CV', 'CUL_ANTECEDENTES', 'RECIBO_SERVICIOS']; const validated = new Set(documents.filter(document => document.status === 'VALIDATED').map(document => String(document.type))); if (!requiredTypes.every(type => validated.has(type))) throw new Error('DOCUMENTS_NOT_VALIDATED');
  const now = new Date().toISOString(); const contract = { contractNumber: `CTR-${now.slice(0, 4)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, generatedDate: now.slice(0, 10), signatureStatus: 'PENDIENTE', contractVersion: '1.0', generatedBy: actor.uid, fileGenerated: false, ...(employer?{employer}:{}) }; const trace = hiringTrace(candidateData, actor, 'EN_REVISION', 'CONTRATO_GENERADO', 'Datos contractuales registrados. No se generó un archivo contractual.');
  await firestore(env, `candidates/${candidateId}`, 'PATCH', { fields: fields({ hiring: { ...hiring, status: 'CONTRATO_GENERADO', contract, documentsValidated: true, updatedAt: now, updatedBy: actor.uid }, selection: trace.selection, updatedAt: now, updatedBy: actor.uid }) }); return response({ ok: true, status: 'CONTRATO_GENERADO', contractNumber: contract.contractNumber }, 201, cors(request, env));
}
async function signHiringContract(request: Request, env: Env, actor: Profile, candidateId: string) {
  const candidateData = await requireTalentCandidate(env, actor, candidateId); const hiring = isRecord(candidateData.hiring) ? candidateData.hiring : {}; if (hiring.status !== 'PENDIENTE_FIRMA' || !isRecord(hiring.contract)) throw new Error('CONTRACT_NOT_PENDING_SIGNATURE'); const input = await request.json<{ signatureType?: unknown; reason?: unknown }>(); if (!['FIRMADO_DIGITAL', 'FIRMADO_FISICO'].includes(String(input.signatureType))) throw new Error('INVALID_SIGNATURE');
  const now = new Date().toISOString(); const trace = hiringTrace(candidateData, actor, 'PENDIENTE_FIRMA', 'CONTRATADO', typeof input.reason === 'string' && input.reason.trim() ? input.reason : 'Contrato firmado por las partes.');
  await firestore(env, `candidates/${candidateId}`, 'PATCH', { fields: fields({ currentProcess: 'CONTRATADO', currentStage: 'CONTRATADO', hiring: { ...hiring, status: 'CONTRATADO', contractStatus: 'CONTRATADO', contractedAt: now, hiredDate: now.slice(0, 10), contract: { ...hiring.contract, signatureStatus: input.signatureType, signedDate: now.slice(0, 10) }, updatedAt: now, updatedBy: actor.uid }, selection: trace.selection, updatedAt: now, updatedBy: actor.uid }) }); return response({ ok: true, status: 'CONTRATADO' }, 200, cors(request, env));
}
async function identityAdmin(env: Env, action: 'create' | 'update' | 'delete' | 'lookup', body: Record<string, unknown>) {
  if(env.DATA_PROVIDER!=='firebase') return relationalIdentity(env,action,body);
  const token = await googleAccessToken(env);
  const suffix = action === 'create' ? 'accounts' : `accounts:${action}`;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/${suffix}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await r.json<GoogleErrorPayload & Record<string, unknown>>();
  if (!r.ok) throw new Error(providerErrorCode('IDENTITY', r.status, data));
  return data;
}
async function profileFor(request: Request, env: Env) {
  if(env.DATA_PROVIDER!=='firebase') {
    const verified=env.RELATIONAL_ACTOR||await relationalSession(request,env);
    const data=await env.RELATIONAL_RUNTIME?.get('users/'+verified.id);
    if(!data||data.uid!==verified.authUserId)throw new Error('PROFILE_NOT_FOUND');
    if(data.enabled===false||data.status!=='ACTIVO')throw new Error('ACCOUNT_DISABLED');
    if(data.mustChangePassword===true)throw new Error('PASSWORD_CHANGE_REQUIRED');
    return {uid:verified.id,username:data.username,displayName:data.displayName,role:verified.role,companyId:verified.companyId,module:verified.allowedModules||data.module||[],allowedModules:verified.allowedModules||data.allowedModules||[],scope:verified.managedCompany?verified.scope||[]:data.scope||[],subordinateUserIds:data.subordinateUserIds||[],enabled:true,status:'ACTIVO'} as Profile;
  }
  const uid = await verifyToken(request, env);
  let doc: FirestoreDocument;
  try {
    doc = await firestore(env, `users/${uid}`);
  } catch (error) {
    if (error instanceof Error && error.message === 'FIRESTORE_404') throw new Error('PROFILE_NOT_FOUND');
    throw error;
  }
  const values = unpack(doc.fields ?? {});
  const string = (key: string) => typeof values[key] === 'string' ? values[key] : '';
  const strings = (key: string) => Array.isArray(values[key]) ? values[key].filter((item): item is string => typeof item === 'string') : [];
  const legacyModules = strings('module'); const configuredModules = strings('allowedModules');
  const profile: Profile = { uid: string('uid') || uid, username: string('username'), displayName: string('displayName'), role: string('role') as Role, companyId: string('companyId'), module: legacyModules, allowedModules: configuredModules.length ? configuredModules : legacyModules, scope: strings('scope'), enabled: values.enabled !== false, status: string('status') || 'ACTIVO' };
  profile.subordinateUserIds = strings('subordinateUserIds');
  if (profile.enabled === false || profile.status !== 'ACTIVO') throw new Error('ACCOUNT_DISABLED'); return profile;
}
function requireAdmin(profile: Profile) { if (profile.role !== 'ADMIN') throw new Error('FORBIDDEN'); }
type SystemSettings = { companyName: string; minPassGrade: number; minAttendancePct: number; slaSelectionDays: number; ojtDurationDays: number };
const defaultSystemSettings: SystemSettings = { companyName: '', minPassGrade: 80, minAttendancePct: 85, slaSelectionDays: 5, ojtDurationDays: 5 };
const settingsPath = (actor: Profile) => `systemSettings/${safeObjectPart(actor.companyId || 'global')}`;
async function getSystemSettings(request: Request, env: Env, actor: Profile) {
  requireAdmin(actor);
  try {
    const stored = unpack((await firestore(env, settingsPath(actor))).fields ?? {});
    return response({ ...defaultSystemSettings, ...stored }, 200, cors(request, env));
  } catch (error) {
    if (error instanceof Error && error.message === 'FIRESTORE_404') return response(defaultSystemSettings, 200, cors(request, env));
    throw error;
  }
}
async function updateSystemSettings(request: Request, env: Env, actor: Profile) {
  requireAdmin(actor);
  const input = await request.json<Record<string, unknown>>();
  const settings: SystemSettings = {
    companyName: typeof input.companyName === 'string' ? input.companyName.trim() : '',
    minPassGrade: numberValue(input.minPassGrade, -1),
    minAttendancePct: numberValue(input.minAttendancePct, -1),
    slaSelectionDays: numberValue(input.slaSelectionDays, -1),
    ojtDurationDays: numberValue(input.ojtDurationDays, -1),
  };
  if (!settings.companyName || settings.minPassGrade < 0 || settings.minPassGrade > 100 || settings.minAttendancePct < 0 || settings.minAttendancePct > 100 || settings.slaSelectionDays < 1 || settings.ojtDurationDays < 1) throw new Error('INVALID_SETTINGS');
  await firestoreServerWrite(env, settingsPath(actor), { ...settings, companyId: actor.companyId, updatedBy: actor.uid }, ['updatedAt']);
  await writeAdminAudit(env, actor, 'SYSTEM_SETTINGS_UPDATED', actor.companyId || 'global', null, settings, 'ADMINISTRACION', 'systemSettings');
  return response(settings, 200, cors(request, env));
}
const validUsername = (name: unknown) => typeof name === 'string' && /^[a-z0-9][a-z0-9._-]{2,31}$/.test(name);
const modulesByRole: Record<Role, string[]> = {
  ADMIN: ['SELECCION', 'FORMACION', 'TALENTO', 'ANALITICA', 'ADMINISTRACION', 'OPERACIONES'],
  JEFE_OPERACIONES: ['OPERACIONES'],
  COORDINADOR_OPERACIONES: ['OPERACIONES'],
  JEFE_SELECCION: ['SELECCION', 'ANALITICA'],
  ANALISTA_SELECCION: ['SELECCION'],
  RECLUTADOR: ['SELECCION'],
  JEFE_FORMACION: ['FORMACION', 'ANALITICA'],
  COORDINADOR_FORMACION: ['FORMACION'],
  FORMADOR: ['FORMACION'],
  JEFE_TALENTO: ['TALENTO', 'ANALITICA'],
  ANALISTA_TALENTO: ['TALENTO'],
};
const normalizeUsername = (value: string) => value.trim().toLowerCase();
const authEmailForUsername = (username: string) => `${username}@auth.talentcc.invalid`;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const profileText = (value: unknown, label: string, maxLength: number): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${label} inválido.`);
  const normalized = value
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F\uFFFD]/g, '')
    .replace(/\^+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length > maxLength) throw new Error(`${label} excede el límite permitido.`);
  return normalized;
};
const profileAvatar = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('La foto de perfil no es válida.');
  const avatar = value.trim();
  if (!avatar) return '';
  if (avatar.length > 200_000) throw new Error('La foto de perfil es demasiado grande.');
  const remoteImage = /^https:\/\/[^\s]+$/i.test(avatar);
  const embeddedImage = /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(avatar);
  if (!remoteImage && !embeddedImage) throw new Error('La foto de perfil no es válida.');
  return avatar;
};

async function userIdsByUsername(env: Env, username: string): Promise<string[]> {
  if(env.DATA_PROVIDER!=='firebase') return (await env.RELATIONAL_RUNTIME!.query('users',{username})).map(u=>u.id);
  const token = await googleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents:runQuery`;
  const result = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'username' }, op: 'EQUAL', value: { stringValue: username } } }, limit: 1 } }),
  });
  const payload = await result.json<Array<{ document?: FirestoreDocument }> | GoogleErrorPayload>();
  if (!result.ok || !Array.isArray(payload)) throw new Error(providerErrorCode('FIRESTORE_QUERY', result.status, payload as GoogleErrorPayload));
  return payload.flatMap(item => item.document?.name ? [item.document.name.split('/').pop() || ''] : []).filter(Boolean);
}

async function authUserByEmail(env: Env, email: string): Promise<Record<string, unknown> | undefined> {
  const result = await identityAdmin(env, 'lookup', { email: [email] });
  return Array.isArray(result.users) && isRecord(result.users[0]) ? result.users[0] : undefined;
}

async function writeAdminAudit(env: Env, actor: Profile, action: string, entityId: string, previousValue: unknown, newValue: unknown, module = 'ADMINISTRACION', entityType = 'user') {
  await firestoreServerWrite(env, `auditLogs/${crypto.randomUUID()}`, {
    actorUid: actor.uid,
    actorName: actor.displayName || 'Usuario',
    action,
    module,
    entityType,
    entityId,
    previousValue,
    newValue,
  }, ['timestamp']);
}

function userCompanyGrants(env:Env,input:Record<string,unknown>):unknown[]|undefined{
  if(input.companyAccess===undefined)return;
  if(env.ORG_ENABLED!=='true'||!env.RELATIONAL_ACTOR?.globalAdmin)throw new SupabaseError(403,'FORBIDDEN');
  if(!Array.isArray(input.companyAccess)||input.companyAccess.length>100||input.companyAccess.some(g=>!g||typeof g.companyId!=='string'||typeof g.enabled!=='boolean'||typeof g.allCampaigns!=='boolean'||!Array.isArray(g.scopes)||g.scopes.some((s:unknown)=>typeof s!=='string')||!modulesByRole[g.role as Role]))throw new SupabaseError(400,'ORG_VALIDATION_FAILED');
  return input.companyAccess;
}
async function createUser(request: Request, env: Env, actor: Profile) {
  requireAdmin(actor);
  const input = await request.json<Record<string, unknown>>();
  const grants=userCompanyGrants(env,input);
  const username = normalizeUsername(typeof input.username === 'string' ? input.username : '');
  const password = typeof input.password === 'string' ? input.password : '';
  const displayName = typeof input.displayName === 'string' ? input.displayName : '';
  const dni = typeof input.dni === 'string' ? input.dni.trim() : '';
  const role = typeof input.role === 'string' ? input.role as Role : undefined;
  const status = input.status === undefined ? 'ACTIVO' : input.status;
  if (!validUsername(username)) throw new Error('El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.');
  if (!displayName || !/^\d{8}$/.test(dni) || !role || !modulesByRole[role] || !['ACTIVO', 'INACTIVO'].includes(String(status)) || password.length < 8) throw new Error('Datos de usuario inválidos. El DNI debe tener 8 dígitos y la contraseña al menos 8 caracteres.');
  if ((await userIdsByUsername(env, username)).length) throw new Error('El nombre de usuario ya está en uso.');
  const authEmail = authEmailForUsername(username);
  let authData = await authUserByEmail(env, authEmail);
  let authUserCreated = false;
  if (!authData) {
    authData = await identityAdmin(env, 'create', { email: authEmail, password, displayName, disabled: status === 'INACTIVO' });
    authUserCreated = true;
  }
  const uid = typeof authData.localId === 'string' ? authData.localId : '';
  if (!uid) throw new Error('IDENTITY_USER_ID_MISSING');
  const selectedModules = strings(input.module);
  const modules = role === 'JEFE_OPERACIONES' || role === 'COORDINADOR_OPERACIONES' ? ['OPERACIONES'] : selectedModules.length ? selectedModules : modulesByRole[role];
  const scope = strings(input.scope);
  const nickname = profileText(input.nickname, 'El apodo', 48) ?? '';
  const tagline = profileText(input.tagline, 'La frase de perfil', 120) ?? '';
  const avatarUrl = profileAvatar(input.avatarUrl) ?? '';
  const resolvedCompanyId = typeof input.companyId === 'string' && input.companyId ? input.companyId : actor.companyId || 'default';
  await identityAdmin(env, 'update', { localId: uid, displayName, disabled: status === 'INACTIVO' });
  try {
    await firestoreServerWrite(env, `users/${uid}`, {
      uid,
      username,
      dni,
      displayName,
      name: displayName,
      nickname,
      tagline,
      phone: typeof input.phone === 'string' ? input.phone : '',
      jobTitle: typeof input.jobTitle === 'string' ? input.jobTitle : '',
      role,
      module: modules,
      allowedModules: modules,
      companyId: resolvedCompanyId,
      scope,
      scopeCampaignIds: scope,
      subordinateUserIds: strings(input.subordinateUserIds),
      avatarUrl,
      enabled: status === 'ACTIVO',
      status,
    }, ['updatedAt', 'createdAt']);
  } catch (error) {
    if (authUserCreated) {
      try { await identityAdmin(env, 'delete', { localId: uid }); } catch { /* La causa original se conserva; evita ocultarla con el rollback. */ }
    }
    throw error;
  }
  await writeAdminAudit(env, actor, 'USER_PROVISIONED', uid, null, { username, role, status, companyId: resolvedCompanyId });
  if(grants)env.RELATIONAL_RUNTIME!.setCompanyGrants(uid,grants);
  return response({ ok: true }, 200, cors(request, env));
}
async function updateUser(request: Request, env: Env, actor: Profile, uid: string) {
  requireAdmin(actor);
  const input = await request.json<Record<string, unknown>>();
  const grants=userCompanyGrants(env,input);
  let existingDocument: FirestoreDocument;
  try { existingDocument = await firestore(env, `users/${uid}`); }
  catch (error) { if (error instanceof Error && error.message === 'FIRESTORE_404') throw new Error('Usuario no encontrado.'); throw error; }
  const existing = unpack(existingDocument.fields ?? {});
  const dni = typeof input.dni === 'string' ? input.dni.trim() : String(existing.dni ?? '');
  if (dni && !/^\d{8}$/.test(dni)) throw new Error('El DNI debe tener 8 dígitos.');
  if(env.ORG_ENABLED==='true')await organizationUserGuard(env,env.RELATIONAL_ACTOR!,uid);
  if(env.ORG_ENABLED==='true'&&existing.homeCompanyId&&existing.homeCompanyId!==actor.companyId)throw new Error('USER_HOME_COMPANY_REQUIRED');
  const role = typeof input.role === 'string' ? input.role as Role : undefined;
  const status = input.status === undefined ? 'ACTIVO' : input.status;
  if (!uid || !role || !modulesByRole[role] || !['ACTIVO', 'INACTIVO'].includes(String(status))) throw new Error('Actualización de usuario inválida.');
  if(env.DATA_PROVIDER!=='firebase'&&existing.role==='ADMIN'&&(role!=='ADMIN'||status!=='ACTIVO')){
    const peers=await env.RELATIONAL_RUNTIME!.query('users',{role:'ADMIN',status:'ACTIVO'});
    if(!peers.some(p=>p.id!==uid&&p.enabled!==false))throw new Error('LAST_ADMIN_REQUIRED');
  }
  const rawUsername = typeof input.username === 'string' ? input.username : undefined;
  const username = rawUsername ? normalizeUsername(rawUsername) : String(existing.username ?? '');
  if (rawUsername) {
    if (!validUsername(username)) throw new Error('El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.');
    const duplicateIds = await userIdsByUsername(env, username);
    if (duplicateIds.some(id => id !== uid)) throw new Error('El nombre de usuario ya está en uso.');
  }
  const selectedModules = strings(input.module);
  const modules = role === 'JEFE_OPERACIONES' || role === 'COORDINADOR_OPERACIONES' ? ['OPERACIONES'] : selectedModules.length ? selectedModules : modulesByRole[role];
  const scope = strings(input.scope);
  const displayName = typeof input.displayName === 'string' ? input.displayName : undefined;
  const nickname = profileText(input.nickname, 'El apodo', 48);
  const tagline = profileText(input.tagline, 'La frase de perfil', 120);
  const avatarUrl = profileAvatar(input.avatarUrl);
  const resolvedCompanyId = typeof input.companyId === 'string' && input.companyId ? input.companyId : actor.companyId || String(existing.companyId ?? '') || 'default';
  await identityAdmin(env, 'update', {
    localId: uid,
    disabled: status === 'INACTIVO',
    ...(displayName ? { displayName } : {}),
    ...(rawUsername ? { email: authEmailForUsername(username) } : {}),
  });
  await firestoreServerWrite(env, `users/${uid}`, {
    ...(rawUsername ? { username } : {}),
    ...(dni ? { dni } : {}),
    ...(displayName ? { displayName, name: displayName } : {}),
    ...(nickname !== undefined ? { nickname } : {}),
    ...(tagline !== undefined ? { tagline } : {}),
    phone: typeof input.phone === 'string' ? input.phone : '',
    jobTitle: typeof input.jobTitle === 'string' ? input.jobTitle : '',
    role,
    module: modules,
    allowedModules: modules,
    scope,
    scopeCampaignIds: scope,
    subordinateUserIds: strings(input.subordinateUserIds),
    ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    companyId: resolvedCompanyId,
    enabled: status === 'ACTIVO',
    status,
  }, ['updatedAt']);
  await writeAdminAudit(env, actor, 'USER_ACCESS_UPDATED', uid, null, { role, modules, scope, status, companyId: resolvedCompanyId });
  if(grants)env.RELATIONAL_RUNTIME!.setCompanyGrants(uid,grants);
  return response({ ok: true }, 200, cors(request, env));
}
async function resetPassword(request: Request, env: Env, actor: Profile, uid: string) {
  if(env.ORG_ENABLED==='true')await organizationUserGuard(env,env.RELATIONAL_ACTOR!,uid);
  if(env.ORG_ENABLED==='true'){const user=await env.RELATIONAL_RUNTIME!.get('users/'+uid);if(user?.homeCompanyId&&user.homeCompanyId!==actor.companyId)throw new Error('USER_HOME_COMPANY_REQUIRED');}
  requireAdmin(actor); const { newPassword } = await request.json<{ newPassword?: string }>();
  if (!uid || !newPassword || newPassword.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  await identityAdmin(env, 'update', { localId: uid, password: newPassword });
  await writeAdminAudit(env, actor, 'USER_PASSWORD_RESET', uid, null, 'RESET');
  return response({ ok: true }, 200, cors(request, env));
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const preflight = corsResponse(request, env); if (preflight) return preflight;
  const headers = cors(request, env);
  try {
    if (!originAllowed(request, env)) throw new Error('ORIGIN_NOT_ALLOWED');
    const url = new URL(request.url); if (url.pathname === '/health') return response({ ok: true, provider: env.DATA_PROVIDER === 'firebase' ? 'firebase' : 'supabase', modulesReady: true }, 200, headers);
    if (url.pathname.startsWith('/api/public/capture/')) {
      const result = await handleCapture(request, env, undefined, { token: googleAccessToken, encode: fields, decode: unpack });
      if (result) { Object.entries(headers).forEach(([k, v]) => result.headers.set(k, v)); return result; }
    }
    if (url.pathname === '/api/session' && request.method === 'GET') {
      return response(await relationalSession(request, env, true), 200, headers);
    }
    if (url.pathname === '/api/session/password' && request.method === 'POST') {
      await changeFirstPassword(request, env);
      return response({ ok: true }, 200, headers);
    }
    const actor = await profileFor(request, env);
    if (url.pathname==='/api/bootstrap'&&request.method==='GET') return await relationalBootstrap(request,env,actor);
    if (url.pathname.startsWith('/api/selection/')) {
      const result = await handleSelectionAdvanced(request, env, actor, { token: googleAccessToken, encode: fields, decode: unpack });
      Object.entries(headers).forEach(([k, v]) => result.headers.set(k, v)); return result;
    }
    if (url.pathname.startsWith('/api/capture')) {
      const result = await handleCapture(request, env, actor, { token: googleAccessToken, encode: fields, decode: unpack });
      if (result) { Object.entries(headers).forEach(([k, v]) => result.headers.set(k, v)); return result; }
    }
    if (request.method === 'GET' && url.pathname === '/api/settings') return await getSystemSettings(request, env, actor);
    if (request.method === 'PATCH' && url.pathname === '/api/settings') return await updateSystemSettings(request, env, actor);
    if (request.method === 'GET' && url.pathname === '/api/users/assignable') return await listAssignableUsers(request, env, actor);
    if (request.method === 'POST' && url.pathname === '/api/users') return await createUser(request, env, actor);
    const userAccessMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/access$/);
    if (request.method === 'PATCH' && userAccessMatch) return await updateUser(request, env, actor, decodeURIComponent(userAccessMatch[1]));
    const passwordMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/reset-password$/);
    if (request.method === 'POST' && passwordMatch) return await resetPassword(request, env, actor, decodeURIComponent(passwordMatch[1]));
    if (request.method === 'POST' && url.pathname === '/api/campaigns') return await createCampaign(request, env, actor);
    if (request.method === 'POST' && url.pathname === '/api/candidates') return await createCandidate(request, env, actor);
    if (request.method === 'POST' && url.pathname === '/api/trainings/from-selection') return await createTrainingFromSelection(request, env, actor);
    const bulkAttendance=url.pathname.match(/^\/api\/trainings\/([^/]+)\/attendance\/bulk$/);
    if(bulkAttendance&&request.method==='POST'){
      const trainingId=decodeURIComponent(bulkAttendance[1]);await requireTrainingAccess(env,actor,trainingId);
      const input=await request.json<Record<string,unknown>>();
      if(!Array.isArray(input.candidateIds)||input.candidateIds.length<1||input.candidateIds.length>100||input.candidateIds.some(id=>typeof id!=='string'))throw new Error('INVALID_ATTENDANCE_BATCH');
      for(const id of Array.from(new Set(input.candidateIds as string[]))){
        await appendParticipantHistory(new Request(request.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,candidateIds:undefined})}),env,actor,trainingId,id,'attendance');
      }
      return response({ok:true},201,headers);
    }
    const surveyMatch = url.pathname.match(/^\/api\/trainings\/([^/]+)\/survey$/);
    if (surveyMatch && request.method === 'GET') {
      const trainingId = decodeURIComponent(surveyMatch[1]);
      const training = await requireTrainingAccess(env, actor, trainingId);
      const exporting = url.searchParams.get('export') === '1';
      if (exporting && !['ADMIN','JEFE_FORMACION','COORDINADOR_FORMACION'].includes(actor.role)) throw new Error('FORBIDDEN');
      return response(await surveyRpc(env, 'talent_survey_detail', {p_company: training.companyId, p_group: trainingId, p_export_actor: exporting ? actor.uid : null}), 200, {...cors(request,env),'Cache-Control':'no-store'});
    }
    const trainerMatch = url.pathname.match(/^\/api\/trainings\/([^/]+)\/trainer$/);
    if (request.method === 'GET' && trainerMatch) return await availableTrainingTrainers(request, env, actor, decodeURIComponent(trainerMatch[1]));
    if (request.method === 'POST' && trainerMatch) return await assignTrainingTrainer(request, env, actor, decodeURIComponent(trainerMatch[1]));
    const trainingManagementMatch = url.pathname.match(/^\/api\/trainings\/([^/]+)\/management$/);
    if (request.method === 'PATCH' && trainingManagementMatch) return await updateTrainingManagement(request, env, actor, decodeURIComponent(trainingManagementMatch[1]));
    const attendanceWindowMatch = url.pathname.match(/^\/api\/trainings\/([^/]+)\/attendance-window$/);
    if (request.method === 'GET' && attendanceWindowMatch) return await attendanceWindowResponse(request, env, actor, decodeURIComponent(attendanceWindowMatch[1]), url.searchParams.get('date') ?? '');
    const attendanceUnlockMatch = url.pathname.match(/^\/api\/trainings\/([^/]+)\/attendance-unlocks\/(\d{4}-\d{2}-\d{2})$/);
    if (request.method === 'POST' && attendanceUnlockMatch) return await requestAttendanceUnlock(request, env, actor, decodeURIComponent(attendanceUnlockMatch[1]), attendanceUnlockMatch[2]);
    if (request.method === 'PATCH' && attendanceUnlockMatch) return await decideAttendanceUnlock(request, env, actor, decodeURIComponent(attendanceUnlockMatch[1]), attendanceUnlockMatch[2]);
    const participantMatch = url.pathname.match(/^\/api\/trainings\/([^/]+)\/participants\/([^/]+)\/(attendance|evaluations|status)$/);
    if (request.method === 'POST' && participantMatch) {
      const action = participantMatch[3];
      if (action === 'attendance' || action === 'evaluations' || action === 'status') return await appendParticipantHistory(request, env, actor, participantMatch[1], participantMatch[2], action);
    }
    const ojtMatch = url.pathname.match(/^\/api\/trainings\/([^/]+)\/participants\/([^/]+)\/ojt\/(start|daily|result)$/);
    if (request.method === 'POST' && ojtMatch) {
      const action = ojtMatch[3];
      if (action === 'start' || action === 'daily' || action === 'result') return await ojtParticipant(request, env, actor, ojtMatch[1], ojtMatch[2], action);
    }
    const ojtSupplementMatch = url.pathname.match(/^\/api\/trainings\/([^/]+)\/participants\/([^/]+)\/ojt\/(skills|feedback)$/);
    if (ojtSupplementMatch && (request.method === 'PATCH' || request.method === 'POST')) return await updateOjtSupplement(request, env, actor, decodeURIComponent(ojtSupplementMatch[1]), decodeURIComponent(ojtSupplementMatch[2]), ojtSupplementMatch[3] as 'skills' | 'feedback');
    const dropoutMatch = url.pathname.match(/^\/api\/trainings\/([^/]+)\/participants\/([^/]+)\/dropout$/);
    if (request.method === 'POST' && dropoutMatch) return await registerParticipantDropout(request, env, actor, decodeURIComponent(dropoutMatch[1]), decodeURIComponent(dropoutMatch[2]));
    const candidateDocumentsMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/documents$/);
    if (request.method === 'POST' && candidateDocumentsMatch) return await createCandidateDocument(request, env, actor, decodeURIComponent(candidateDocumentsMatch[1]));
    if (request.method === 'GET' && candidateDocumentsMatch) return await listCandidateDocumentsResponse(request, env, actor, decodeURIComponent(candidateDocumentsMatch[1]));
    const candidateDocumentMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/documents\/([^/]+)$/);
    if (request.method === 'PATCH' && candidateDocumentMatch) return await updateCandidateDocument(request, env, actor, decodeURIComponent(candidateDocumentMatch[1]), decodeURIComponent(candidateDocumentMatch[2]));
    if (request.method === 'GET' && candidateDocumentMatch) return await downloadCandidateDocument(request, env, actor, decodeURIComponent(candidateDocumentMatch[1]), decodeURIComponent(candidateDocumentMatch[2]));
    const candidateDocumentContentMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/documents\/([^/]+)\/content$/);
    if (request.method === 'POST' && candidateDocumentContentMatch) return await replaceCandidateDocument(request, env, actor, decodeURIComponent(candidateDocumentContentMatch[1]), decodeURIComponent(candidateDocumentContentMatch[2]));
    const salaryAccountMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/salary-account$/);
    if (request.method === 'POST' && salaryAccountMatch) return await saveSalaryAccount(request, env, actor, decodeURIComponent(salaryAccountMatch[1]));
    const eligibilityMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/eligibility$/);
    if (request.method === 'GET' && eligibilityMatch) return await eligibilityResponse(request, env, actor, decodeURIComponent(eligibilityMatch[1]));
    const altaMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/alta$/);
    if (request.method === 'POST' && altaMatch) return await giveCandidateAlta(request, env, actor, decodeURIComponent(altaMatch[1]));
    const hiringLaborMatch = url.pathname.match(/^\/api\/talent\/candidates\/([^/]+)\/labor-data$/);
    if (request.method === 'PATCH' && hiringLaborMatch) return await saveHiringLaborData(request, env, actor, decodeURIComponent(hiringLaborMatch[1]));
    const hiringStatusMatch = url.pathname.match(/^\/api\/talent\/candidates\/([^/]+)\/status$/);
    if (request.method === 'POST' && hiringStatusMatch) return await changeHiringStatus(request, env, actor, decodeURIComponent(hiringStatusMatch[1]));
    const hiringGenerateMatch = url.pathname.match(/^\/api\/talent\/candidates\/([^/]+)\/contract$/);
    if (request.method === 'POST' && hiringGenerateMatch) return await generateHiringContract(request, env, actor, decodeURIComponent(hiringGenerateMatch[1]));
    const hiringSignMatch = url.pathname.match(/^\/api\/talent\/candidates\/([^/]+)\/contract\/sign$/);
    if (request.method === 'POST' && hiringSignMatch) return await signHiringContract(request, env, actor, decodeURIComponent(hiringSignMatch[1]));
    const candidateStageMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/stage$/);
    if (request.method === 'POST' && candidateStageMatch) return await candidateStage(request, env, actor, candidateStageMatch[1]);
    const candidateContactsMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/contacts$/);
    if (request.method === 'POST' && candidateContactsMatch) return await appendCandidateItem(request, env, actor, candidateContactsMatch[1], 'contacts');
    const candidateEvaluationsMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/evaluations$/);
    if (request.method === 'POST' && candidateEvaluationsMatch) return await appendCandidateItem(request, env, actor, candidateEvaluationsMatch[1], 'evaluations');
    const candidateObservationsMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/observations$/);
    if (request.method === 'POST' && candidateObservationsMatch) return await appendCandidateItem(request, env, actor, decodeURIComponent(candidateObservationsMatch[1]), 'observations');
    const candidateSelectionRecordMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/selection-record$/);
    if (request.method === 'PATCH' && candidateSelectionRecordMatch) return await updateSelectionRecord(request, env, actor, decodeURIComponent(candidateSelectionRecordMatch[1]));
    const candidatePersonalMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/personal-data$/);
    if (request.method === 'PATCH' && candidatePersonalMatch) return await updateCandidatePersonalData(request, env, actor, decodeURIComponent(candidatePersonalMatch[1]));
    const campaignMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)$/);
    if (request.method === 'PATCH' && campaignMatch) return await updateCampaign(request, env, actor, campaignMatch[1]);
    const campaignStatusMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/status$/);
    if (request.method === 'POST' && campaignStatusMatch) return await updateCampaignStatus(request, env, actor, campaignStatusMatch[1]);
    const campaignResponsiblesMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/responsibles$/);
    if (request.method === 'POST' && campaignResponsiblesMatch) return await updateCampaignResponsibles(request, env, actor, campaignResponsiblesMatch[1]);
    const campaignSourcesMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/sources$/);
    if (request.method === 'POST' && campaignSourcesMatch) return await updateCampaignSource(request, env, actor, campaignSourcesMatch[1]);
    throw new Error('NOT_FOUND');
  } catch (error) {
    if(env.DATA_PROVIDER!=='firebase'&&error instanceof Error&&error.message==='FIRESTORE_404')return response({message:'NOT_FOUND'},404,headers);
    if (error instanceof SupabaseError) return response({ message: error.code }, error.status, headers);
    if (error instanceof CaptureError) return response({ message: error.message }, error.status, headers);
    const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const status = ['UNAUTHENTICATED', 'INVALID_TOKEN'].includes(message) ? 401
      : ['FORBIDDEN', 'ACCOUNT_DISABLED', 'PROFILE_NOT_FOUND', 'ORIGIN_NOT_ALLOWED'].includes(message) ? 403
        : ['NOT_FOUND', 'Usuario no encontrado.'].includes(message) ? 404
          : message === 'El nombre de usuario ya está en uso.' || ['DUPLICATE_CANDIDATE', 'EVALUATION_ALREADY_RECORDED', 'OJT_DAY_ALREADY_RECORDED', 'ATTENDANCE_UNLOCK_ALREADY_REQUESTED', 'CANDIDATE_ALREADY_IN_TRAINING', 'CANDIDATE_NOT_READY_FOR_TRAINING'].includes(message) ? 409
            : message.startsWith('GOOGLE_AUTH_') || message.startsWith('IDENTITY_') || message.startsWith('FIRESTORE_') ? 502
              : 400;
    return response({ message }, status, headers);
  }
}

async function relationalBootstrap(request:Request,env:Env,actor:Profile) {
  if(!env.RELATIONAL_RUNTIME)throw new Error('RELATIONAL_CONTEXT_MISSING');
  const selection=actor.role==='ADMIN'||actor.allowedModules.includes('SELECCION')&&['JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'].includes(actor.role);
  const formation=actor.role==='ADMIN'||actor.allowedModules.includes('FORMACION')&&['JEFE_FORMACION','COORDINADOR_FORMACION','FORMADOR'].includes(actor.role);
  const talent=actor.role==='ADMIN'||actor.allowedModules.includes('TALENTO')&&['JEFE_TALENTO','ANALISTA_TALENTO'].includes(actor.role);
  const cohorts=(await listFirestore(env,'trainings')).filter(t=>formation&&(actor.role==='ADMIN'||actor.role==='JEFE_FORMACION'||actor.role==='COORDINADOR_FORMACION'&&(t.coordinatorId===actor.uid||actor.scope.includes(String(t.campaignId)))||actor.role==='FORMADOR'&&t.trainerId===actor.uid)||selection&&actor.role==='JEFE_SELECCION');
  const campaigns=(await listFirestore(env,'campaigns')).filter(c=>selection&&campaignAllowed(actor,c)||formation&&(actor.role==='JEFE_FORMACION'||actor.role==='COORDINADOR_FORMACION'&&actor.scope.includes(String(c.id))||actor.role==='FORMADOR'&&cohorts.some(t=>t.campaignId===c.id))||talent&&(actor.role==='JEFE_TALENTO'||actor.scope.includes(String(c.id))||actor.scope.includes(actor.companyId)));
  const candidates=[] as Record<string,unknown>[];
  for(const c of await listFirestore(env,'candidates')){
    if(selection&&(actor.role==='ADMIN'||actor.role==='JEFE_SELECCION'||actor.role==='ANALISTA_SELECCION'&&(c.analystId===actor.uid||actor.scope.includes(String(c.campaignId)))||actor.role==='RECLUTADOR'&&(c.recruiterId===actor.uid||campaigns.some(cmp=>cmp.id===c.campaignId)))||formation&&(actor.role==='ADMIN'||actor.role==='JEFE_FORMACION'||cohorts.some(t=>t.id===c.trainingId))||talent&&(actor.role==='ADMIN'||actor.role==='JEFE_TALENTO'||actor.scope.includes(String(c.campaignId))||actor.scope.includes(actor.companyId)))candidates.push(c);
  }
  const rawUsers=await listFirestore(env,'users');
  const users=env.RELATIONAL_ACTOR?.globalAdmin&&!env.RELATIONAL_ACTOR.managedCompany
    ?await organizationRequest(new Request(new URL('/api/org/users',request.url)),env,env.RELATIONAL_ACTOR)
    :(actor.role==='ADMIN'?rawUsers:rawUsers.filter(u=>u.id===actor.uid||actor.subordinateUserIds?.includes(String(u.id)))).map(u=>({id:u.id,companyId:u.companyId,email:u.username,name:u.displayName,role:u.role,status:u.status,avatarUrl:u.avatarUrl||'',nickname:u.nickname,tagline:u.tagline,phone:u.phone,dni:u.dni,jobTitle:u.jobTitle,allowedModules:u.allowedModules,scopeCampaignIds:u.scope,subordinateUserIds:u.subordinateUserIds}));
  return response({campaigns,cohorts,candidates,users},200,cors(request,env));
}

const worker={async fetch(request:Request,env:Env):Promise<Response>{
  const path=new URL(request.url).pathname;
  const surveyToken=path.match(/^\/api\/public\/surveys\/([0-9a-f-]{36})$/)?.[1];
  if(surveyToken && request.method!=='OPTIONS'){
    try{
      if(!originAllowed(request,env))throw new SupabaseError(403,'ORIGIN_NOT_ALLOWED');
      return response(await publicSurvey(request,env,surveyToken),200,{...cors(request,env),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
    }catch(e){return response({message:e instanceof SupabaseError?e.code:'SURVEY_FAILED'},e instanceof SupabaseError?e.status:500,{...cors(request,env),'Cache-Control':'no-store'});}
  }
  if(request.method!=='OPTIONS'&&(path.startsWith('/api/operations/')||path.startsWith('/api/public/operations/'))){
    const result=await handleOperations(request,env);
    if(result){const headers=new Headers(result.headers);Object.entries(cors(request,env)).forEach(([key,value])=>headers.set(key,value));return new Response(result.body,{status:result.status,headers});}
  }
  if(env.ORG_ENABLED==='true'&&new URL(request.url).searchParams.get('unified')==='1'&&request.method!=='OPTIONS'&&!path.startsWith('/api/public/')&&path!=='/api/session/password'){
    try{
      if(!originAllowed(request,env))throw new SupabaseError(403,'ORIGIN_NOT_ALLOWED');
      const result=await unifiedRequest(request,env,worker.fetch);
      return new Response(result.body,{status:result.status,headers:{...Object.fromEntries(result.headers),...cors(request,env)}});
    }catch(e){return response({message:e instanceof SupabaseError?e.code:'UNIFIED_READ_FAILED'},e instanceof SupabaseError?e.status:500,cors(request,env));}
  }
  if(env.DATA_PROVIDER==='firebase'||request.method==='OPTIONS'||path==='/health'||path==='/api/session'||path==='/api/session/password')return handleRequest(request,env);
  const headers=cors(request,env);let store:RelationalRuntime|undefined;let scoped:Env|undefined;
  const newObjects=new Set<string>();
  const objectStore=env.DOCUMENTS?new Proxy(env.DOCUMENTS,{get(target,key){
    if(key==='put')return async(k:string,v:any,options:any)=>{const result=await target.put(k,v,options);newObjects.add(k);return result;};
    if(key==='delete')return async(k:string)=>{if(newObjects.has(k)){await target.delete(k);newObjects.delete(k);} }; // conservar versiones anteriores.
    const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
  }}):env.DOCUMENTS;
  const cleanup=async()=>{for(const key of newObjects)await env.DOCUMENTS.delete(key).catch(()=>{});};
  try{
    if(!originAllowed(request,env))throw new Error('ORIGIN_NOT_ALLOWED');
    const token=path.match(/^\/api\/public\/capture\/([a-f0-9]{48})$/)?.[1];
    let actor=token?undefined:env.VERIFIED_SESSION||await relationalSession(request,env);
    if(actor&&['JEFE_OPERACIONES','COORDINADOR_OPERACIONES'].includes(actor.role)&&path!=='/api/bootstrap')throw new SupabaseError(403,'FORBIDDEN');
    const adminTarget=path.match(/^\/api\/users\/([^/]+)\/(access|reset-password)$/);
    if(actor?.globalAdmin&&adminTarget&&['PATCH','POST'].includes(request.method)){
      const home=await organizationUserHome(env,actor,decodeURIComponent(adminTarget[1]));
      const contextHeaders=new Headers(request.headers);contextHeaders.set('X-Talent-Company',home);
      actor=await relationalSession(new Request(request.url,{headers:contextHeaders}),env);
    }
    if(actor?.managedCompany&&path==='/api/capture/links'&&request.method==='POST'){const input=await request.clone().json<{companyCampaignId?:string}>();if(!actor.companyCampaigns?.includes(input.companyCampaignId||''))throw new SupabaseError(403,'COMPANY_CAMPAIGN_REQUIRED');}
    if((path.startsWith('/api/org')||path==='/api/capture/forms')&&env.ORG_ENABLED==='true'&&actor)return response(await organizationRequest(request,env,actor),200,cors(request,env));
    const runtimeEnv={...env,ORG_COMPANY:actor?.companyId};
    store=await new RelationalRuntime(runtimeEnv,actor?.authUserId||null,token).load();
    scoped={...runtimeEnv,DOCUMENTS:objectStore,RELATIONAL_ACTOR:actor,RELATIONAL_RUNTIME:store};
    const result=await handleRequest(request,scoped);
    if(result.ok)await store.commit();
    else {await cleanup();for(const uid of store.newAuthIds)await relationalIdentity(scoped,'delete',{localId:uid}).catch(()=>{});}
    return result;
  }catch(error){
    await cleanup();
    if(store&&scoped&&!store.committed)for(const uid of store.newAuthIds)await relationalIdentity(scoped,'delete',{localId:uid}).catch(()=>{});
    const code=error instanceof SupabaseError?error.code:error instanceof Error?error.message:'INTERNAL_ERROR';
    const status=error instanceof SupabaseError?error.status:code==='ORIGIN_NOT_ALLOWED'?403:500;
    return response({message:code},status,headers);
  }
}};
export default worker;
