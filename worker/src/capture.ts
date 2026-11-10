import {captureIdentityIssue} from '../../shared/captureIdentity';
import type { Env } from './index';
import { TECH_CENTER_FORM, COMPANY_CAPTURE_FORM, validateTechCenterAnswers, type CaptureCampaignOption } from '../../shared/techCenterForm';
import {effectiveQuestions,validateFormAnswers,validateCaptureForm,defaultCaptureForm,visibleQuestions,sensitiveQuestionIds,type FormAnswers} from '../../shared/captureFormSchema';
import {publicCaptureConfig} from '../../shared/captureCampaignConfig';
import {readCaptureSubmission,verifyCaptureFile,type CaptureFile} from './captureAttachments';

export type Data = Record<string, any>;
type Actor = { uid: string; role: string; companyId: string; allowedModules: string[]; subordinateUserIds?: string[]; scope?: string[] };
export type Helpers = { token: (env: Env) => Promise<string>; encode: (data: Data) => any; decode: (data: any) => Data };
export const captureSources = ['Facebook', 'TikTok', 'LinkedIn', 'WhatsApp', 'Pauta pagada', 'Referidos', 'Otros'];
export const captureStates = ['Nuevo', 'Contactado', 'No responde', 'Interesado', 'No interesado'];
const defaultPublicCaptureForm = validateCaptureForm(defaultCaptureForm());
export class CaptureError extends Error { constructor(message: string, public status = 400, public field?:string) { super(message); } }
const text = (v: unknown, max: number) => typeof v === 'string' ? v.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, max) : '';
const digits = (v: unknown) => text(v, 40).replace(/\D/g, '');
const phone = (v: unknown) => { const n = digits(v); return n.length === 11 && n.startsWith('51') ? n.slice(2) : n; };
export function captureInput(v: Data, techCenter = false, campaigns?: CaptureCampaignOption[], validatedAnswers?:FormAnswers) {
  let techCenterAnswers: Record<string, string> | undefined;
  if (techCenter) {
    try { techCenterAnswers = validatedAnswers ? Object.fromEntries(Object.entries(validatedAnswers).filter((entry):entry is [string,string]=>typeof entry[1]==='string')) : validateTechCenterAnswers(v,campaigns); }
    catch (error) { throw new CaptureError((error as Error).message); }
    if (v.privacyAcknowledged !== true) throw new CaptureError('Confirma que has leído la información sobre el tratamiento de tus datos personales.');
  }
  const fullName = text(v.fullName, 120), documentType = text(v.documentType, 20);
  const documentNumber = text(v.documentNumber, 24).toUpperCase().replace(/[\s-]/g, '');
  const normalizedPhone = phone(v.phone), email = text(v.email, 160).toLowerCase(), district = text(v.district, techCenter ? 160 : 80);
  const issue=captureIdentityIssue(v,techCenter);
  if(issue)throw new CaptureError(issue.message,400,issue.field);
  if(!techCenter&&v.consent!==true)throw new CaptureError('Confirma la declaración de privacidad.',400,'consent');
  if(v.website)throw new CaptureError('No se pudo validar el envío. Contacta al responsable del enlace.');
  return { fullName, documentType, documentNumber, phone: normalizedPhone, email, district, ...(techCenterAnswers ? { techCenterAnswers } : {}) };
}
function allowed(actor: Actor) {
  if (actor.role !== 'ADMIN' && (!['RECLUTADOR', 'ANALISTA_SELECCION', 'JEFE_SELECCION'].includes(actor.role) || !actor.allowedModules.includes('SELECCION'))) throw new CaptureError('FORBIDDEN', 403);
}
export function owns(actor: Actor, record: Data) {
  allowed(actor);
  if (actor.role === 'ANALISTA_SELECCION') throw new CaptureError('FORBIDDEN', 403);
  if (actor.role !== 'ADMIN' && (record.ownerUid !== actor.uid || record.companyId !== actor.companyId)) throw new CaptureError('FORBIDDEN', 403);
}
async function digest(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
export function matchIdentity(applicant: Data, candidates: Data[]) {
  const documentMatches = candidates.filter(c => (c.documentType || 'DNI') === applicant.documentType && text(c.documentNumber || c.dni, 24).toUpperCase().replace(/[\s-]/g, '') === applicant.documentNumber);
  const contacts = candidates.filter(c => phone(c.phone) === applicant.phone || (applicant.email && text(c.email, 160).toLowerCase() === applicant.email));
  const confirmed = documentMatches.length === 1 ? documentMatches[0] : undefined;
  const conflict = documentMatches.length > 1 || contacts.some(c => c.id !== confirmed?.id);
  return { candidateId: confirmed?.id as string | undefined, conflict, possibleIds: [...new Set([...documentMatches, ...contacts].map(c => c.id))] };
}

export class Store {
  private root: string;
  constructor(private env: Env, private helpers: Helpers, private token: string) { this.root = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`; }
  private async call(path: string, body?: Data, method = 'POST'): Promise<any> {
    const r = await fetch(this.root + path, { method, headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (r.status === 404) return undefined;
    if (!r.ok) throw new CaptureError(r.status === 409 ? 'CAPTURE_RETRY' : 'Servicio de captación temporalmente no disponible.', r.status === 409 ? 409 : 502);
    return r.json();
  }
  async get(path: string, tx?: string): Promise<Data | undefined> {
    if(this.env.DATA_PROVIDER!=='firebase') return this.env.RELATIONAL_RUNTIME!.get(path);
    const d = await this.call(`/${path}${tx ? `?transaction=${encodeURIComponent(tx)}` : ''}`, undefined, 'GET');
    return d ? { ...this.helpers.decode(d.fields || {}), id: path.split('/').pop() } : undefined;
  }
  async query(collection: string, filters: Data, tx?: string, limit = 201): Promise<Data[]> {
    if(this.env.DATA_PROVIDER!=='firebase') return this.env.RELATIONAL_RUNTIME!.query(collection,filters,limit);
    const ff = Object.entries(filters).map(([fieldPath, value]) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: this.helpers.encode({ value }).value } }));
    const result = await this.call(':runQuery', { ...(tx ? { transaction: tx } : {}), structuredQuery: { from: [{ collectionId: collection }], ...(ff.length ? { where: ff.length === 1 ? ff[0] : { compositeFilter: { op: 'AND', filters: ff } } } : {}), limit } });
    return result.flatMap((item: any) => item.document ? [{ ...this.helpers.decode(item.document.fields || {}), id: item.document.name.split('/').pop() }] : []);
  }
  async queryAll(collection: string, filters: Data): Promise<Data[]> {
    if (this.env.DATA_PROVIDER !== 'firebase') return this.env.RELATIONAL_RUNTIME!.query(collection, filters, Number.MAX_SAFE_INTEGER);
    const ff = Object.entries(filters).map(([fieldPath, value]) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: this.helpers.encode({ value }).value } }));
    const result = await this.call(':runQuery', { structuredQuery: { from: [{ collectionId: collection }], ...(ff.length ? { where: ff.length === 1 ? ff[0] : { compositeFilter: { op: 'AND', filters: ff } } } : {}) } });
    return result.flatMap((item: any) => item.document ? [{ ...this.helpers.decode(item.document.fields || {}), id: item.document.name.split('/').pop() }] : []);
  }
  async atomic<T>(work: (tx: string) => Promise<{ result: T; writes: { path: string; data: Data; create?: boolean; patch?: boolean }[] }>): Promise<T> {
    if(this.env.DATA_PROVIDER!=='firebase') { const result=await work('RELATIONAL_REQUEST_TRANSACTION');for(const w of result.writes)await this.env.RELATIONAL_RUNTIME!.write(w.path,w.data,w.create);return result.result; }
    for (let attempt = 0; attempt < 3; attempt++) {
      const { transaction } = await this.call(':beginTransaction', { options: { readWrite: {} } });
      try {
        const { result, writes } = await work(transaction);
        await this.call(':commit', { transaction, writes: writes.map(w => ({ update: { name: this.root.replace('https://firestore.googleapis.com/v1/', '') + '/' + w.path, fields: this.helpers.encode(w.data) }, ...(w.create ? { currentDocument: { exists: false } } : {}), ...(w.patch ? { updateMask: { fieldPaths: Object.keys(w.data) } } : {}) })) });
        return result;
      } catch (e) {
        await this.call(':rollback', { transaction }).catch(() => undefined);
        if (!(e instanceof CaptureError) || e.message !== 'CAPTURE_RETRY' || attempt === 2) throw e;
      }
    }
    throw new CaptureError('Inténtalo nuevamente.', 409);
  }
}

export async function body(request: Request, limit=8192): Promise<Data> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new CaptureError('INVALID_CONTENT_TYPE');
  const reader = request.body?.getReader(); if (!reader) throw new CaptureError('INVALID_BODY');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > limit) { await reader.cancel(); throw new CaptureError('Solicitud demasiado grande.', 413); } chunks.push(chunk.value); }
  const bytes = new Uint8Array(size); let offset = 0; chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; }); const raw = new TextDecoder().decode(bytes);
  try { const data = JSON.parse(raw); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; } catch { throw new CaptureError('INVALID_BODY'); }
}
async function challenge(request: Request, env: Env, input: Data) {
  if (!env.CAPTURE_HASH_SECRET || !env.TURNSTILE_SECRET_KEY) throw new CaptureError('Captación pública pendiente de configuración.', 503);
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: text(input.turnstileToken, 2048), remoteip: request.headers.get('cf-connecting-ip') || '', idempotency_key: input.requestId }) });
  const verified = await result.json<{ success?: boolean; hostname?: string; action?: string }>();
  const hostnames = [env.ALLOWED_ORIGIN, env.PRODUCTION_ORIGIN].flatMap(s => (s || '').split(',')).map(s => { try { return new URL(s.trim()).hostname; } catch { return ''; } });
  if (!result.ok || !verified.success || verified.action !== 'capture' || !hostnames.includes(verified.hostname || '')) throw new CaptureError('No se pudo verificar el envío. Reintenta la verificación.', 403);
}

export async function handleCapture(request: Request, env: Env, actor: Actor | undefined, helpers: Helpers): Promise<Response | undefined> {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith('/api/capture') && !path.startsWith('/api/public/capture/')) return;
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  if (!actor && !path.startsWith('/api/public/')) return;
  if (actor) allowed(actor);
  if (actor?.role === 'JEFE_SELECCION' && !/^\/api\/capture\/(?:export|candidates\/[a-zA-Z0-9_-]{1,100}|attachments\/[a-f0-9-]{36}\/[a-zA-Z][a-zA-Z0-9_]{0,63})$/.test(path)) throw new CaptureError('FORBIDDEN', 403);
  const store = new Store(env, helpers, await helpers.token(env));
  const managerOwners = async () => {
    const users = await store.query('users', actor?.role === 'ADMIN' ? {} : { companyId: actor?.companyId }, undefined, 2001);
    if (users.length > 2000) throw new CaptureError('El equipo supera el límite de consulta gerencial. Requiere paginación.', 503);
    return users.filter(u => actor?.role === 'ADMIN' || (u.role === 'RECLUTADOR' && actor?.subordinateUserIds?.includes(u.id))).map(u => ({ uid: u.id, name: u.displayName || u.name || u.username || 'Sin nombre', companyId: u.companyId, role: u.role, active: u.status === 'ACTIVO' && u.enabled !== false }));
  };
  const mayReadEvent = (person: Data, event: Data, supervised: Set<string>) => {
    if (!actor) return false;
    return actor.role === 'ADMIN' || (
      event.companyId === actor.companyId && person.companyId === actor.companyId && (
        actor.role === 'JEFE_SELECCION' || event.ownerUid === actor.uid ||
        (actor.role === 'ANALISTA_SELECCION' && (supervised.has(event.ownerUid) || actor.scope?.includes(String(person.campaignId || '')) || person.analystId === actor.uid))
      )
    );
  };
  if (path === '/api/capture/export' && request.method === 'GET') {
    const [events, people] = await Promise.all([
      store.queryAll('captations', { companyId: actor!.companyId }),
      store.queryAll('candidates', { companyId: actor!.companyId }),
    ]);
    const byId = new Map(people.map(person => [person.id, person]));
    const supervised = actor!.role === 'ANALISTA_SELECCION' ? new Set((await managerOwners()).map(user => user.uid)) : new Set<string>();
    const items = events.filter(event => {
      const person = byId.get(event.candidateId);
      return person && mayReadEvent(person, event, supervised);
    }).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map(({ possibleIds, ...event }) => ({ ...event, applicant: {
        ...event.applicant,
        ...(event.applicant?.formSubmission ? { formSubmission: {
          ...event.applicant.formSubmission,
          attachments: (event.applicant.formSubmission.attachments || []).map(({ objectKey, ...attachment }: Data) => attachment),
        } } : {}),
      } }));
    return reply({ items, total: items.length });
  }
  if (path === '/api/capture/management' && request.method === 'GET') {
    if (!actor || !['ADMIN', 'ANALISTA_SELECCION'].includes(actor.role)) throw new CaptureError('FORBIDDEN', 403);
    const owners = await managerOwners(), ids = new Set(owners.map(u => u.uid));
    const scoped = (e: Data) => actor.role === 'ADMIN' || (e.companyId === actor.companyId && ids.has(e.ownerUid));
    const queryScope = actor.role === 'ADMIN' ? {} : { companyId: actor.companyId };
    const links = await store.query('captureLinks', queryScope, undefined, 2001), events = await store.query('captations', queryScope, undefined, 2001);
    if (links.length > 2000 || events.length > 2000) throw new CaptureError('Los registros superan el límite gerencial. Se requiere paginación antes de consolidar.', 503);
    return reply({ owners, links: links.filter(e => !e.deletedAt && scoped(e)), events: events.filter(scoped).map(({ possibleIds, ...e }) => actor.role === 'ADMIN' ? { ...e, possibleIds } : e), generatedAt: new Date().toISOString() });
  }
  const pub = path.match(/^\/api\/public\/capture\/([a-f0-9]{48})$/);
  if (pub && ['GET', 'POST'].includes(request.method)) {
    const link = await store.get(`captureLinks/${pub[1]}`);
    if (!link || link.active !== true || link.deletedAt) throw new CaptureError('Este enlace no está disponible.', 404);
    const owner = await store.get(`users/${link.ownerUid}`);
    if (!owner || owner.enabled === false || owner.status !== 'ACTIVO' || !['ADMIN', 'RECLUTADOR'].includes(owner.role) || owner.companyId !== link.companyId || (owner.role !== 'ADMIN' && !(owner.allowedModules || owner.module || []).includes('SELECCION'))) throw new CaptureError('Este enlace no está disponible.', 404);
    // Determine the form from the stored company, never from a client-supplied ID.
    const catalog = env.DATA_PROVIDER !== 'firebase' ? await env.RELATIONAL_RUNTIME!.captureCatalog() : undefined;
    const techCenter = Boolean(catalog) || link.companyId === 'techcenter';
    const formVersion = catalog ? COMPANY_CAPTURE_FORM : TECH_CENTER_FORM;
    if(catalog) for(const campaign of catalog.campaigns){
      try {
        validateCaptureForm(campaign.form || defaultPublicCaptureForm);
      } catch {
        Object.assign(campaign,{unavailableReason:'Esta campaña está actualizando su formulario. Contacta al responsable del enlace.'});
      }
    }
    if (request.method === 'GET') return reply({
      active: true, noticeVersion: 'capture-v1',
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
      securityReady: Boolean(env.CAPTURE_HASH_SECRET && env.TURNSTILE_SECRET_KEY),
      ...(techCenter ? { formId: formVersion, noticeVersion: formVersion } : {}),
      ...(catalog ? catalog : {}),
    });
    const {input,files}=await readCaptureSubmission(request);
    const chosen=catalog?.campaigns.find(c=>c.id===input.preferredCampaign);
    let formSubmission:Data|undefined,validatedAnswers:FormAnswers|undefined;
    const verifiedFiles=new Map<string,CaptureFile>();
    if(chosen){
      if((chosen as {unavailableReason?:string}).unavailableReason)throw new CaptureError('Esta campaña está actualizando su formulario. Tus respuestas se conservan en esta página.',409);
      if(chosen.form&&input.formRevision!==chosen.formRevision)throw new CaptureError('El formulario cambió. Recarga la página antes de enviarlo.',409);
      const config=publicCaptureConfig(chosen.configuration);if(!config)throw new CaptureError('Campaña pendiente de configuración.');
      try{
        const definition=chosen.form?validateCaptureForm(chosen.form):defaultPublicCaptureForm;
        const questions=effectiveQuestions(definition,config,chosen,catalog!.companyName);
        const visible=visibleQuestions(questions,input);
        for(const [id,file]of files){
          if(!visible.some(q=>q.id===id&&q.type==='file'))throw new CaptureError('Adjunto no permitido en este formulario.');
          verifiedFiles.set(id,await verifyCaptureFile(file));
        }
        validatedAnswers=validateFormAnswers(questions,input,new Set(verifiedFiles.keys()));
        if(sensitiveQuestionIds.some(id=>Boolean(validatedAnswers?.[id]))&&input.sensitiveConsent!==true)
          throw new CaptureError('Autoriza expresamente el tratamiento de las respuestas sensibles o déjalas sin responder.');
        formSubmission={revision:chosen.formRevision||0,title:definition.title,questions:visible,answers:validatedAnswers,attachments:[]};
      }catch(e){throw new CaptureError(e instanceof Error?e.message:'Revisa el formulario.');}
    }else if(files.size)throw new CaptureError('Este formulario no permite adjuntos.');
    const applicant:Data = captureInput(input, techCenter, catalog?.campaigns,validatedAnswers);
    if(formSubmission)applicant.formSubmission=formSubmission;
    const selectedCampaign = catalog?.campaigns.find(c=>c.id===applicant.techCenterAnswers?.preferredCampaign);
    if(catalog && applicant.techCenterAnswers && selectedCampaign){
      applicant.techCenterAnswers.preferredCampaignId=selectedCampaign.id;
      applicant.techCenterAnswers.preferredCampaign=selectedCampaign.name;
      applicant.techCenterAnswers.companyName=catalog.companyName;
    }
    if (!/^[a-f0-9-]{36}$/.test(input.requestId || '')) throw new CaptureError('INVALID_REQUEST_ID');
    if (!env.CAPTURE_HASH_SECRET) throw new CaptureError('Captación pública pendiente de configuración.', 503);
    const requestKey = await digest(env.CAPTURE_HASH_SECRET!, `request:${pub[1]}:${input.requestId}`);
    const fileFingerprints=[...verifiedFiles].map(([id,{sha256,file}])=>({id,sha256,name:file.name,size:file.size})).sort((a,b)=>a.id.localeCompare(b.id));
    const fingerprint = await digest(env.CAPTURE_HASH_SECRET!, JSON.stringify(formSubmission?{applicant,files:fileFingerprints}:applicant));
    const retry = await store.get(`captureRequests/${requestKey}`);
    if (retry) { if (retry.fingerprint !== fingerprint) throw new CaptureError('INVALID_RETRY', 409); return reply({ ok: true }, 201); }
    await challenge(request, env, input);
    const now = new Date().toISOString();
    const rateKey = await digest(env.CAPTURE_HASH_SECRET!, `ip:${request.headers.get('cf-connecting-ip') || 'local'}:${Math.floor(Date.now() / 60000)}`);
    const lockKey = await digest(env.CAPTURE_HASH_SECRET!, `identity:${link.companyId}:${applicant.documentType}:${applicant.documentNumber}`);
    const result = await store.atomic(async tx => {
      const current = await store.get(`captureLinks/${pub[1]}`, tx);
      if (!current?.active || current.deletedAt) throw new CaptureError('Este enlace no está disponible.', 404);
      const currentOwner = await store.get(`users/${link.ownerUid}`, tx);
      if (!currentOwner || currentOwner.enabled === false || currentOwner.status !== 'ACTIVO' || currentOwner.companyId !== link.companyId || !['ADMIN', 'RECLUTADOR'].includes(currentOwner.role) || (currentOwner.role !== 'ADMIN' && !(currentOwner.allowedModules || currentOwner.module || []).includes('SELECCION'))) throw new CaptureError('Este enlace no está disponible.', 404);
      const previous = await store.get(`captureRequests/${requestKey}`, tx);
      if (previous) { if (previous.fingerprint !== fingerprint) throw new CaptureError('INVALID_RETRY', 409); return { result: { ok: true }, writes: [] }; }
      const rate = await store.get(`captureRateLimits/${rateKey}`, tx);
      if ((rate?.count || 0) >= 5) throw new CaptureError('Demasiados envíos. Espera un minuto.', 429);
      const identity = await store.get(`captureIdentities/${lockKey}`, tx);
      const candidates = await store.query('candidates', { companyId: link.companyId }, tx, 2001);
      if (candidates.length > 2000) throw new CaptureError('La revisión de identidad requiere configuración administrativa.', 503);
      if (identity && !candidates.some(c => c.id === identity.candidateId)) throw new CaptureError('La identidad requiere revisión administrativa.', 409);
      const matched = matchIdentity(applicant, candidates);
      const candidateId = identity?.candidateId || matched.candidateId || `CAP-${crypto.randomUUID()}`;
      const eventId = crypto.randomUUID(), conflict = matched.conflict;
      if(formSubmission){
        for(const [id,{file,sha256}]of verifiedFiles){
          const ext=file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':'jpg';
          const objectKey='capture/'+encodeURIComponent(link.companyId)+'/'+eventId+'/'+id+'-'+crypto.randomUUID()+'.'+ext;
          await env.DOCUMENTS.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type}});
          formSubmission.attachments.push({id,name:file.name.replace(/[\x00-\x1f\x7f]/g,'').slice(0,160),mimeType:file.type,size:file.size,sha256,objectKey});
        }
      }
      const privacy:Data = techCenter
        ? { privacyAcknowledgement: { acknowledged: true, version: formVersion, acknowledgedAt: now } }
        : { consent: { accepted: true, version: 'capture-v1', acceptedAt: now } };
      if(formSubmission&&sensitiveQuestionIds.some(id=>Boolean(validatedAnswers?.[id])))
        privacy.sensitiveDisclosureConsent={accepted:true,version:'capture-sensitive-v1',acceptedAt:now};
      const event = { id: eventId, candidateId, linkId: pub[1], companyId: link.companyId, ownerUid: link.ownerUid, source: link.source, createdAt: now, status: 'Nuevo', applicant, conflict, possibleIds: matched.possibleIds, ...privacy, history: [{ at: now, actorUid: 'PUBLIC', action: 'Registro', status: 'Nuevo', note: '' }] };
      const writes: { path: string; data: Data; create?: boolean }[] = [
        { path: `captations/${eventId}`, data: event, create: true },
        { path: `captureRequests/${requestKey}`, data: { fingerprint, createdAt: now }, create: true },
        { path: `captureRateLimits/${rateKey}`, data: { count: (rate?.count || 0) + 1, expiresAt: new Date(Date.now() + 86400000).toISOString() } },
      ];
      if (!identity) writes.push({ path: `captureIdentities/${lockKey}`, data: { candidateId, companyId: link.companyId }, create: true });
      if (!identity && !matched.candidateId) writes.push({ path: `candidates/${candidateId}`, data: { id: candidateId, companyId: link.companyId, captureOnly: true, dni: applicant.documentNumber, documentType: applicant.documentType, documentNumber: applicant.documentNumber, fullName: applicant.fullName, phone: applicant.phone, email: applicant.email, district: applicant.district, city: applicant.district, recruiterId: link.ownerUid, campaignId: '', createdAt: now }, create: true });
      return { result: { ok: true }, writes };
    });
    return reply(result, 201);
  }
  if (!actor) throw new CaptureError('NOT_FOUND', 404);
  const attachment=path.match(/^\/api\/capture\/attachments\/([a-f0-9-]{36})\/([a-zA-Z][a-zA-Z0-9_]{0,63})$/);
  if(attachment&&request.method==='GET'){
    const event=await store.get('captations/'+attachment[1]);
    const supervised=actor.role==='ANALISTA_SELECCION'?new Set((await managerOwners()).map(u=>u.uid)):new Set<string>();
    const person=event?await store.get('candidates/'+event.candidateId):null;
    if(!event||!person||event.companyId!==actor.companyId||!mayReadEvent(person,event,supervised))throw new CaptureError('FORBIDDEN',403);
    const file=event.applicant?.formSubmission?.attachments?.find((f:Data)=>f.id===attachment[2]);
    if(!file?.objectKey)throw new CaptureError('NOT_FOUND',404);
    const object=await env.DOCUMENTS.get(file.objectKey);if(!object)throw new CaptureError('NOT_FOUND',404);
    return new Response(object.body,{headers:{'Content-Type':file.mimeType,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"sandbox; default-src 'none'"}});
  }
  if (actor.role === 'ANALISTA_SELECCION' && !/^\/api\/capture\/candidates\/[^/]+$/.test(path)) throw new CaptureError('FORBIDDEN', 403);
  const filter = actor.role === 'ADMIN' ? {} : { ownerUid: actor.uid };
  if (path === '/api/capture/links' && request.method === 'GET') {
    const data = (await store.query('captureLinks', filter)).filter(x => !x.deletedAt && (actor.role === 'ADMIN' || x.companyId === actor.companyId));
    return reply({ items: data.slice(0, 200), truncated: data.length > 200 });
  }
  if (path === '/api/capture/links' && request.method === 'POST') {
    if (!['ADMIN', 'RECLUTADOR'].includes(actor.role)) throw new CaptureError('FORBIDDEN', 403);
    const input = await body(request); if (!captureSources.includes(input.source) || !actor.companyId) throw new CaptureError('INVALID_SOURCE_OR_COMPANY');
    const id = randomToken(), link = { id, source: input.source,companyCampaignId:input.companyCampaignId, ownerUid: actor.uid, companyId: actor.companyId, active: true, createdAt: new Date().toISOString() };
    await store.atomic(async () => ({ result: undefined, writes: [{ path: `captureLinks/${id}`, data: link, create: true }, { path: `captureAudit/${crypto.randomUUID()}`, data: { at: link.createdAt, actorUid: actor.uid, linkId: id, action: 'Creación enlace' }, create: true }] }));
    return reply(link, 201);
  }
  const linkPath = path.match(/^\/api\/capture\/links\/([a-f0-9]{48})$/);
  if (linkPath && request.method === 'DELETE') {
    await store.atomic(async tx => {
      const link = await store.get(`captureLinks/${linkPath[1]}`, tx);
      if (!link || link.deletedAt) throw new CaptureError('NOT_FOUND', 404);
      owns(actor, link);
      const at = new Date().toISOString();
      return { result: undefined, writes: [
        { path: `captureLinks/${linkPath[1]}`, data: { active: false, deletedAt: at, updatedAt: at }, patch: true },
        { path: `captureAudit/${crypto.randomUUID()}`, data: { at, actorUid: actor.uid, linkId: link.id, action: 'Eliminación enlace' }, create: true },
      ] };
    });
    return reply({ ok: true });
  }
  if (linkPath && request.method === 'PATCH') {
    const input = await body(request); if (typeof input.active !== 'boolean') throw new CaptureError('INVALID_STATE');
    await store.atomic(async tx => {
      const link = await store.get(`captureLinks/${linkPath[1]}`, tx); if (!link || link.deletedAt) throw new CaptureError('NOT_FOUND', 404); owns(actor, link);
      const at = new Date().toISOString();
      return { result: undefined, writes: [{ path: `captureLinks/${linkPath[1]}`, data: { active: input.active, updatedAt: at }, patch: true }, { path: `captureAudit/${crypto.randomUUID()}`, data: { at, actorUid: actor.uid, linkId: link.id, active: input.active, action: 'Estado enlace' }, create: true }] };
    }); return reply({ ok: true });
  }
  if (path === '/api/capture/inbox' && request.method === 'GET') {
    const events = (await store.queryAll('captations', filter)).filter(x => actor.role === 'ADMIN' || x.companyId === actor.companyId);
    events.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    return reply({ items: events.slice(0, 200).map(({ possibleIds, ...e }) => actor.role === 'ADMIN' ? { ...e, possibleIds } : e), truncated: events.length > 200 });
  }
  const eventPath = path.match(/^\/api\/capture\/events\/([a-f0-9-]{36})$/);
  if (eventPath && request.method === 'PATCH') {
    const input = await body(request); if (!captureStates.includes(input.status) || (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 1000))) throw new CaptureError('INVALID_MANAGEMENT');
    await store.atomic(async tx => {
      const event = await store.get(`captations/${eventPath[1]}`, tx); if (!event) throw new CaptureError('NOT_FOUND', 404); owns(actor, event);
      if ((event.history || []).length >= 500) throw new CaptureError('Historial completo. Contacta al administrador.', 409);
      return { result: undefined, writes: [{ path: `captations/${event.id}`, data: { status: input.status, history: [...event.history, { at: new Date().toISOString(), actorUid: actor.uid, action: 'Gestión', previousStatus: event.status, status: input.status, note: text(input.note, 1000) }] }, patch: true }] };
    }); return reply({ ok: true });
  }
  const dossier = path.match(/^\/api\/capture\/candidates\/([a-zA-Z0-9_-]{1,100})$/);
  if (dossier && request.method === 'GET') {
    const candidate = await store.get(`candidates/${dossier[1]}`); if (!candidate) throw new CaptureError('NOT_FOUND', 404);
    if (actor.role !== 'ADMIN' && candidate.companyId !== actor.companyId) throw new CaptureError('FORBIDDEN', 403);
    const supervised = actor.role === 'ANALISTA_SELECCION' ? new Set((await managerOwners()).map(u => u.uid)) : new Set<string>();
    const events = (await store.queryAll('captations', { candidateId: dossier[1] })).filter(e => mayReadEvent(candidate,e,supervised));
    if (!events.length) throw new CaptureError('FORBIDDEN', 403);
    // A recruiter sees only personal information they received, never another recruiter's history.
    const applicant = actor.role === 'ADMIN' ? { fullName: candidate.fullName, phone: candidate.phone, email: candidate.email, documentType: candidate.documentType || 'DNI', documentNumber: candidate.documentNumber || candidate.dni, district: candidate.district || candidate.city } : events[0].applicant;
    return reply({ candidate: { id: candidate.id, ...applicant }, events: events.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map(({ possibleIds, ...e }) => actor.role === 'ADMIN' ? { ...e, possibleIds } : e) });
  }
  throw new CaptureError('NOT_FOUND', 404);
}
