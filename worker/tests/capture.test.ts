import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { handleCapture, captureInput, matchIdentity, owns } from '../src/capture';
import worker, { Env } from '../src/index';
import { handleSelectionAdvanced, processStages, gradeEvaluation, validateTemplate, processNotifications, checkProcessApproval, checkProcessStage } from '../src/selectionAdvanced';

const owner = { uid: 'recruiter-1', role: 'RECLUTADOR', companyId: 'company-1', allowedModules: ['SELECCION'] };
const admin = { ...owner, uid: 'admin', role: 'ADMIN' };
const linkId = 'a'.repeat(48), eventId = '12345678-1234-1234-1234-123456789012';
const applicant = { fullName: 'Persona de Prueba', documentType: 'DNI', documentNumber: '12345678', phone: '+51 912 345 678', email: 'TEST@example.com', district: 'Lima', consent: true };
const env = { DATA_PROVIDER: 'firebase', FIREBASE_PROJECT_ID: 'test', ALLOWED_ORIGIN: 'http://localhost:3000', PRODUCTION_ORIGIN: 'https://talent.example.com', CAPTURE_HASH_SECRET: 'test-only-secret', TURNSTILE_SECRET_KEY: 'test-only-key' } as Env;
const helpers = { token: async () => 'test-access-token', encode: (d: Record<string, unknown>) => d, decode: (d: Record<string, unknown>) => d };
let documents: Map<string, any>, failCommit = false, writes: any[];
let versions: Map<string, number>, transactions: Map<string, Map<string, number>>;
const call = (path: string, method = 'GET', data?: object, actor: (typeof owner & { subordinateUserIds?: string[] }) | undefined = owner) => handleCapture(new Request(`https://worker.test${path}`, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1' }, ...(data ? { body: JSON.stringify(data) } : {}) }), env, path.startsWith('/api/public/') ? undefined : actor, helpers);
beforeEach(() => {
  documents = new Map([
    [`captureLinks/${linkId}`, { ownerUid: owner.uid, companyId: owner.companyId, source: 'WhatsApp', active: true }],
    [`users/${owner.uid}`, { ...owner, status: 'ACTIVO', enabled: true }],
  ]); writes = []; failCommit = false; versions = new Map(); transactions = new Map();
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input), body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    if (url.hostname === 'challenges.cloudflare.com') return Response.json({ success: true, hostname: 'talent.example.com', action: 'capture' });
    const path = url.pathname.split('/documents')[1];
    if (path === ':beginTransaction') { const tx = crypto.randomUUID(); transactions.set(tx, new Map()); return Response.json({ transaction: tx }); }
    if (path === ':rollback') return Response.json({});
    if (path === ':commit') {
      const reads = transactions.get(body.transaction); if (reads && [...reads].some(([key, version]) => (versions.get(key) || 0) !== version)) return Response.json({}, { status: 409 });
      if (failCommit) { failCommit = false; return Response.json({}, { status: 409 }); }
      if (body.writes.some((w: any) => w.currentDocument?.exists === false && documents.has(w.update.name.split('/documents/')[1]))) return Response.json({}, { status: 409 });
      for (const write of body.writes) { const key = write.update.name.split('/documents/')[1]; documents.set(key, write.updateMask ? { ...documents.get(key), ...write.update.fields } : write.update.fields); versions.set(key, (versions.get(key) || 0) + 1); writes.push(write); }
      return Response.json({});
    }
    if (path === ':runQuery') {
      const q = body.structuredQuery, collection = q.from[0].collectionId, filters = q.where ? q.where.fieldFilter ? [q.where] : q.where.compositeFilter.filters : [];
      return Response.json([...documents].filter(([key, d]) => key.startsWith(collection + '/') && filters.every((f: any) => d[f.fieldFilter.field.fieldPath] === f.fieldFilter.value)).slice(0, q.limit).map(([key, d]) => ({ document: { name: `projects/test/databases/(default)/documents/${key}`, fields: d } })));
    }
    const key = path.slice(1), tx = url.searchParams.get('transaction'); if (tx) transactions.get(tx)?.set(key, versions.get(key) || 0);
    const value = documents.get(key); return value ? Response.json({ fields: value }) : Response.json({}, { status: 404 });
  }));
});

describe('Selección Fase 2', () => {
  const actor = { ...owner, displayName: 'Responsable', scope: [] };
  const process = () => ({ name: 'Proceso de test', description: '', position: '', stages: processStages.map(stage => ({ stage, requirements: '' })), evaluations: [{ id: 'ev1', name: 'Evaluación de test', stage: 'EVALUACIONES', minScore: 2, questions: [{ id: 'q1', label: 'Cerrada', type: 'CLOSED', options: ['A', 'B'], correctIndex: 1, points: 2 }, { id: 'q2', label: 'Abierta', type: 'OPEN', points: 2 }] }], responsibleIds: [owner.uid], interviewFields: ['Observación'], rules: { assigned: true, interviews: true, pendingEvaluations: true, stageChanges: true } });
  const advanced = (path: string, data?: object, a = actor) => handleSelectionAdvanced(new Request(`https://worker.test/api/selection/${path}`, { method: data ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) }), env, a, helpers);
  const seed = () => {
    for (const id of ['campaign1', 'campaign2']) documents.set(`campaigns/${id}`, { companyId: owner.companyId, title: id, code: id, status: 'EN_PROCESO', assignedUserIds: [owner.uid] });
    documents.set('candidates/person', { companyId: owner.companyId, captureOnly: true, fullName: 'Persona de test', dni: '12345678', phone: '912345678', email: '', district: 'Lima', recruiterId: owner.uid });
    documents.set(`captations/${eventId}`, { companyId: owner.companyId, candidateId: 'person', ownerUid: owner.uid, source: 'WhatsApp', conflict: false });
  };
  const linked = async (templateId?: string) => { seed(); const r = await advanced('link', { eventId, campaignId: 'campaign1', templateId }); return await r.json() as any; };
  const configure = async () => { seed(); return await (await advanced('campaigns/campaign1', process(), { ...actor, role: 'ADMIN' })).json() as any; };
  it('solo vinculación manual: una persona y un registro de participación', async () => {
    const app = await linked(); expect(app.status).toBe('ACTIVA'); expect(documents.get('candidates/person')).toMatchObject({ captureOnly: false, campaignId: 'campaign1', selectionApplicationId: app.id });
    expect([...documents.keys()].filter(k => k.startsWith('candidates/'))).toHaveLength(1); expect(documents.get(`captations/${eventId}`).source).toBe('WhatsApp');
  });
  it('segunda convocatoria activa es rechazada', async () => {
    await linked(); await expect(advanced('link', { eventId, campaignId: 'campaign2' })).rejects.toThrow('ACTIVE_APPLICATION_EXISTS');
  });
  it('reintento de vinculación no duplica inscripción', async () => {
    await linked(); await advanced('link', { eventId, campaignId: 'campaign1' }); expect([...documents.keys()].filter(k => k.startsWith('selectionApplications/'))).toHaveLength(1);
  });
  it('cierre y nueva convocatoria conservan resultados anteriores', async () => {
    const app = await linked(); documents.get('candidates/person').selection.stage = 'NO_APTO'; documents.get('candidates/person').selection.interviewResult = { status: 'NO_APTO', notes: 'Resultado anterior' };
    await advanced('candidates/person/close', { reason: 'Proceso finalizado' }); await advanced('link', { eventId, campaignId: 'campaign2' });
    expect(documents.get(`selectionApplications/${app.id}`).outcomeSnapshot.selection.interviewResult.notes).toBe('Resultado anterior'); expect(documents.get('candidates/person').campaignId).toBe('campaign2');
    await expect(advanced('link', { eventId, campaignId: 'campaign1' })).rejects.toThrow('ALREADY_ENROLLED');
  });
  it('no se cierra un proceso sin resultado final', async () => {
    await linked(); await expect(advanced('candidates/person/close', { reason: 'Cerrar ahora' })).rejects.toThrow('APPLICATION_NOT_FINISHED');
  });
  it('concurrencia: dos convocatorias no crean dos participaciones activas', async () => {
    seed(); const results = await Promise.allSettled([advanced('link', { eventId, campaignId: 'campaign1' }), advanced('link', { eventId, campaignId: 'campaign2' })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect([...documents].filter(([k, d]) => k.startsWith('selectionApplications/') && d.status === 'ACTIVA')).toHaveLength(1);
  });
  it('se rechazan captaciones ajenas y conflictos sin resolver', async () => {
    seed(); documents.get(`captations/${eventId}`).ownerUid = 'other'; await expect(advanced('link', { eventId, campaignId: 'campaign1' })).rejects.toThrow('FORBIDDEN');
    documents.get(`captations/${eventId}`).ownerUid = owner.uid; documents.get(`captations/${eventId}`).conflict = true; await expect(advanced('link', { eventId, campaignId: 'campaign1' })).rejects.toThrow('CAPTURE_REVIEW_REQUIRED');
  });
  it('se rechazan campaña ajena, cerrada y proceso downstream', async () => {
    seed(); documents.get('campaigns/campaign1').companyId = 'other'; await expect(advanced('link', { eventId, campaignId: 'campaign1' })).rejects.toThrow('FORBIDDEN');
    documents.get('campaigns/campaign1').companyId = owner.companyId; documents.get('campaigns/campaign1').status = 'CERRADO'; await expect(advanced('link', { eventId, campaignId: 'campaign1' })).rejects.toThrow('CAMPAIGN_NOT_ACTIVE');
    documents.get('campaigns/campaign1').status = 'ACTIVA'; documents.get('candidates/person').currentProcess = 'FORMACION'; await expect(advanced('link', { eventId, campaignId: 'campaign1' })).rejects.toThrow('CANDIDATE_IN_DOWNSTREAM_PROCESS');
  });
  it('versiones nuevas no modifican la instantánea aplicada', async () => {
    const t1 = await configure(); const app = await linked(t1.id); await advanced('campaigns/campaign1', { ...process(), name: 'Otra versión', previousId: t1.id }, { ...actor, role: 'ADMIN' });
    expect(documents.get(`selectionApplications/${app.id}`).processSnapshot.name).toBe('Proceso de test'); expect(documents.get(`selectionTemplates/${t1.id}`).name).toBe('Proceso de test');
  });
  it('valida orden, umbrales y opciones de evaluación', () => {
    expect(() => validateTemplate({ ...process(), stages: [] })).toThrow('INVALID_PROCESS'); expect(() => gradeEvaluation(process().evaluations[0], [{ questionId: 'q1', choice: 9 }, { questionId: 'q2', text: 'Respuesta', manualScore: 1 }])).toThrow('INVALID_CHOICE');
  });
  it('califica cerradas en servidor e impide puntajes manuales fuera de rango', () => {
    expect(gradeEvaluation(process().evaluations[0], [{ questionId: 'q1', choice: 1, score: 999 }, { questionId: 'q2', text: 'Respuesta', manualScore: 1 }])).toMatchObject({ score: 3, maxScore: 4, result: 'APTO' });
    expect(() => gradeEvaluation(process().evaluations[0], [{ questionId: 'q1', choice: 1 }, { questionId: 'q2', text: 'Respuesta', manualScore: 99 }])).toThrow('INVALID_MANUAL_SCORE');
  });
  it('entrevista programada, reprogramada y realizada mantiene historial sin cambiar etapa', async () => {
    const t = await configure(), app = await linked(t.id); const future = new Date(Date.now() + 86400000).toISOString();
    await advanced(`applications/${app.id}/interviews`, { requestId: crypto.randomUUID(), status: 'Programada', scheduledAt: future, modality: 'Virtual', interviewerId: owner.uid });
    const interview = documents.get(`selectionApplications/${app.id}`).interviews[0];
    await advanced(`applications/${app.id}/interviews`, { requestId: crypto.randomUUID(), interviewId: interview.id, status: 'Reprogramada', scheduledAt: future, modality: 'Virtual', interviewerId: owner.uid });
    await advanced(`applications/${app.id}/interviews`, { requestId: crypto.randomUUID(), interviewId: interview.id, status: 'Realizada', scheduledAt: future, modality: 'Virtual', interviewerId: owner.uid, result: 'APTO', answers: { Observación: 'Registro del entrevistador' } });
    expect(documents.get(`selectionApplications/${app.id}`).interviews[0].history).toHaveLength(3); expect(documents.get('candidates/person').selection.stage).toBe('NUEVO');
  });
  it('evaluaciones conservan cada intento, definición y versión', async () => {
    const t = await configure(), app = await linked(t.id), input = { requestId: crypto.randomUUID(), definitionId: 'ev1', answers: [{ questionId: 'q1', choice: 1 }, { questionId: 'q2', text: 'Respuesta', manualScore: 1 }] };
    await advanced(`applications/${app.id}/evaluations`, input); await advanced(`applications/${app.id}/evaluations`, input);
    expect(documents.get(`selectionApplications/${app.id}`).evaluationAttempts).toHaveLength(1); expect(documents.get('candidates/person').selection.evaluationsList[0]).toMatchObject({ processVersion: 1, score: 3, definitionSnapshot: { id: 'ev1' } });
  });
  it('no permite registrar resultados sobre una participación cerrada', async () => {
    const app = await linked(); documents.get('candidates/person').selection.stage = 'NO_APTO'; await advanced('candidates/person/close', { reason: 'Resultado definitivo' });
    await expect(advanced(`applications/${app.id}/rules`, { requestId: crypto.randomUUID(), rules: {} }, { ...actor, role: 'ADMIN' })).rejects.toThrow('APPLICATION_CLOSED');
  });
  it('comunicación se prepara, no se envía y los reintentos no duplican', async () => {
    const app = await linked(); const msg = await (await advanced('messages/campaign1', { name: 'Citación test', type: 'Citación', content: 'Hola {{nombre}}, {{convocatoria}} {{fecha}} {{horario}}' }, { ...actor, role: 'ADMIN' })).json() as any;
    const input = { requestId: crypto.randomUUID(), templateId: msg.id, date: '2026-10-12', time: '09:00' }; await advanced(`applications/${app.id}/communications`, input); await advanced(`applications/${app.id}/communications`, input);
    const messages = documents.get(`selectionApplications/${app.id}`).communications; expect(messages).toHaveLength(1); expect(messages[0].status).toBe('PREPARADO'); expect(messages[0].content).toContain('Persona de test');
  });
  it('automatizaciones apagadas no alertan; encendidas tienen IDs estables y no cambian decisiones', () => {
    const app = { id: 'app', status: 'ACTIVA', recruiterId: owner.uid, rules: {}, processSnapshot: process() }, candidate = { selection: { stage: 'NUEVO', evaluationsList: [] } };
    expect(processNotifications(app, candidate)).toEqual([]); app.rules = { assigned: true, pendingEvaluations: true }; const first = processNotifications(app, candidate); expect(processNotifications(app, candidate)).toEqual(first); expect(candidate.selection.stage).toBe('NUEVO');
  });
  it('criterios configurados bloquean aprobación sin resultados y requisitos', () => {
    const config = { ...process(), version: 1 }; config.stages[1].requirements = 'Contacto confirmado'; const c = { selectionProcessSnapshot: config, selection: { evaluationsList: [] } };
    expect(() => checkProcessApproval(c)).toThrow('PROCESS_EVALUATIONS_INCOMPLETE'); expect(() => checkProcessStage(c, 'CONTACTADO', actor)).toThrow('PROCESS_REQUIREMENTS_INCOMPLETE'); expect(() => checkProcessApproval({ selection: {} })).not.toThrow();
  });
  it('habilitar flujo antiguo conserva resultados sin migrar ni reiniciar etapas', async () => {
    seed(); const c = documents.get('candidates/person'); c.captureOnly = false; c.campaignId = 'campaign1'; c.currentProcess = 'SELECCION'; c.selection = { stage: 'ENTREVISTA', contactHistory: [{ note: 'Histórico' }] };
    await advanced('candidates/person/initialize', {}); expect(documents.get('candidates/person').selection.contactHistory).toEqual([{ note: 'Histórico' }]); expect(documents.get('candidates/person').selection.stage).toBe('ENTREVISTA');
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('Captación', () => {
  it('muestra todo el historial de formularios de un candidato, incluso después de 501 captaciones', async () => {
    documents.set('candidates/person', { companyId: owner.companyId, recruiterId: owner.uid });
    for (let index = 0; index < 502; index++) documents.set(`captations/history-${index}`, {
      companyId: owner.companyId, candidateId: 'person', ownerUid: owner.uid, createdAt: new Date(2026, 9, 1, 0, 0, index).toISOString(),
      applicant: { formSubmission: { title: 'Formulario', questions: [{ id: 'experienceDetails', label: 'Experiencia' }], answers: { experienceDetails: `Experiencia ${index}` }, attachments: [] } },
    });
    const response = await call('/api/capture/candidates/person');
    const dossier = await response!.json() as any;
    expect(dossier.events).toHaveLength(502);
    expect(dossier.events.at(-1).applicant.formSubmission.answers.experienceDetails).toBe('Experiencia 501');
  });
  it('exporta todas las versiones de formularios dentro del alcance sin el límite de la bandeja', async () => {
    documents.set('candidates/person', { companyId: owner.companyId, recruiterId: owner.uid });
    for (let index = 0; index < 205; index++) documents.set(`captations/event-${index}`, {
      companyId: owner.companyId, candidateId: 'person', ownerUid: owner.uid, createdAt: `2026-10-26T00:00:${String(index % 60).padStart(2, '0')}Z`,
      applicant: { formSubmission: { revision: index + 1, title: 'Formulario', questions: [{ id: 'custom', label: 'Pregunta personalizable' }], answers: { custom: `Respuesta ${index}` }, attachments: [{ id: 'cvFile', name: 'cv.pdf', size: 123, objectKey: 'private/storage-key' }] } },
    });
    documents.set('captations/foreign-owner', { companyId: owner.companyId, candidateId: 'person', ownerUid: 'other', applicant: { formSubmission: { answers: { private: 'No visible' } } } });
    documents.set('captations/foreign-company', { companyId: 'company-2', candidateId: 'person', ownerUid: owner.uid, applicant: {} });
    const recruiter = await (await call('/api/capture/export'))!.json() as any;
    expect(recruiter.total).toBe(205);
    expect(recruiter.items).toHaveLength(205);
    expect(recruiter.items.find((event: any) => event.id === 'event-204').applicant.formSubmission.answers.custom).toBe('Respuesta 204');
    expect(recruiter.items[0].applicant.formSubmission.attachments[0].objectKey).toBeUndefined();
    expect(recruiter.items.every((event: any) => event.possibleIds === undefined)).toBe(true);
    const chief = await (await call('/api/capture/export', 'GET', undefined, { ...owner, role: 'JEFE_SELECCION', uid: 'chief' }))!.json() as any;
    expect(chief.total).toBe(206);
    const analyst = await (await call('/api/capture/export', 'GET', undefined, { ...owner, role: 'ANALISTA_SELECCION', uid: 'analyst', subordinateUserIds: [owner.uid] }))!.json() as any;
    expect(analyst.total).toBe(205);
  });
  it('exporta más de 2001 candidatos, incluidos registros manuales, sin revelar otros responsables', async () => {
    for(let i=0;i<2010;i++)documents.set(`candidates/manual-${i}`,{companyId:owner.companyId,recruiterId:owner.uid,fullName:`Persona ${i}`});
    documents.set('candidates/other',{companyId:owner.companyId,recruiterId:'other'});
    documents.set('candidates/foreign',{companyId:'other-company',recruiterId:owner.uid});
    documents.set('campaigns/assigned',{companyId:owner.companyId,assignedUserIds:[owner.uid]});
    documents.set('candidates/shared',{companyId:owner.companyId,recruiterId:'other',campaignId:'assigned'});
    const result=await (await call('/api/capture/export'))!.json() as any;
    expect(result.candidateTotal).toBe(2011);
    expect(result.candidates).toHaveLength(2011);
    expect(result.candidates.some((c:any)=>c.id==='manual-2009')).toBe(true);
    expect(result.candidates.some((c:any)=>['other','foreign'].includes(c.id))).toBe(false);
    expect(result.items).toEqual([]);
  });
  it('admin ve consolidado global y responsables de distintas empresas', async () => {
    documents.set('users/other', { role: 'RECLUTADOR', companyId: 'company-2', displayName: 'Otro responsable' });
    documents.set('captations/foreign', { companyId: 'company-2', ownerUid: 'other', applicant: {}, possibleIds: ['candidate'] });
    const data = await (await call('/api/capture/management', 'GET', undefined, admin))!.json() as any;
    expect(data.events).toHaveLength(1); expect(data.owners.map((o: any) => o.uid)).toContain('other');
  });
  it('analista solo supervisa subordinados de su empresa y no acepta scope del cliente', async () => {
    documents.set('users/other', { role: 'RECLUTADOR', companyId: 'company-2' });
    documents.set('users/unassigned', { role: 'RECLUTADOR', companyId: 'company-1' });
    documents.set('captations/own', { companyId: 'company-1', ownerUid: owner.uid, possibleIds: ['private'], applicant: {} });
    documents.set('captations/foreign', { companyId: 'company-2', ownerUid: 'other', applicant: {} });
    documents.set('captations/unassigned', { companyId: 'company-1', ownerUid: 'unassigned', applicant: {} });
    const actor = { ...owner, uid: 'analyst', role: 'ANALISTA_SELECCION', subordinateUserIds: [owner.uid, 'other'] };
    const data = await (await call('/api/capture/management?ownerUid=unassigned', 'GET', undefined, actor))!.json() as any;
    expect(data.events.map((e: any) => e.ownerUid)).toEqual([owner.uid]); expect(data.events[0].possibleIds).toBeUndefined(); expect(data.owners.map((o: any) => o.uid)).toEqual([owner.uid]);
  });
  it('analista sin subordinados devuelve consolidado vacío', async () => {
    const data = await (await call('/api/capture/management', 'GET', undefined, { ...owner, role: 'ANALISTA_SELECCION', uid: 'analyst' }))!.json() as any;
    expect(data.links).toHaveLength(0); expect(data.owners).toHaveLength(0); expect(data.events).toHaveLength(0);
  });
  it('reclutador no puede consultar el consolidado gerencial', async () => {
    await expect(call('/api/capture/management')).rejects.toThrow('FORBIDDEN');
  });
  it('analista es supervisor de lectura: no crea ni modifica enlaces o gestiones', async () => {
    const actor = { ...owner, role: 'ANALISTA_SELECCION', subordinateUserIds: [owner.uid] };
    await expect(call('/api/capture/links', 'POST', { source: 'Facebook' }, actor)).rejects.toThrow('FORBIDDEN');
    await expect(call(`/api/capture/links/${linkId}`, 'PATCH', { active: false }, actor)).rejects.toThrow('FORBIDDEN');
    await expect(call(`/api/capture/events/${eventId}`, 'PATCH', { status: 'Interesado' }, actor)).rejects.toThrow('FORBIDDEN');
  });
  it('analista puede consultar expediente de su equipo pero no de otro', async () => {
    documents.set('candidates/person', { companyId: owner.companyId });
    documents.set(`captations/${eventId}`, { ownerUid: owner.uid, companyId: owner.companyId, candidateId: 'person', applicant: {}, history: [] });
    const actor = { ...owner, uid: 'analyst', role: 'ANALISTA_SELECCION', subordinateUserIds: [owner.uid] };
    expect((await call('/api/capture/candidates/person', 'GET', undefined, actor))!.status).toBe(200);
    await expect(call('/api/capture/candidates/person', 'GET', undefined, { ...actor, subordinateUserIds: [] })).rejects.toThrow('FORBIDDEN');
  });
  it('normaliza documento, teléfono y correo, exige consentimiento', () => {
    expect(captureInput(applicant)).toMatchObject({ phone: '912345678', email: 'test@example.com' });
    expect(() => captureInput({ ...applicant, consent: false })).toThrow();
    expect(() => captureInput({ ...applicant, phone: '123' })).toThrow();
  });
  it('crea token aleatorio y atribuye propietario sin aceptar el UID del cliente', async () => {
    const result = await call('/api/capture/links', 'POST', { source: 'Facebook', ownerUid: 'attacker', companyId: 'other' });
    const link = await result!.json() as any;
    expect(link.id).toMatch(/^[a-f0-9]{48}$/); expect(link.ownerUid).toBe(owner.uid); expect(link.companyId).toBe(owner.companyId);
  });
  it('rechaza roles ajenos y permisos de selección ausentes', () => {
    expect(() => owns({ ...owner, role: 'FORMADOR' }, {})).toThrow('FORBIDDEN');
    expect(() => owns({ ...owner, allowedModules: [] }, {})).toThrow('FORBIDDEN');
    expect(() => owns({ ...owner, uid: 'other' }, { ...owner, ownerUid: owner.uid })).toThrow('FORBIDDEN');
  });
  it('rechaza API privada sin Firebase ID Token', async () => {
    const result = await worker.fetch(new Request('https://worker.test/api/capture/links'), env); expect(result.status).toBe(401);
  });
  it('el formulario público no expone origen ni propietario', async () => {
    const result = await call(`/api/public/capture/${linkId}`, 'GET', undefined, undefined); expect(await result!.json()).toEqual({ active: true, noticeVersion: 'capture-v1', turnstileSiteKey: '', securityReady: true });
  });
  it('informa preparación y clave pública sin exponer secretos', async () => {
    const request = new Request(`https://worker.test/api/public/capture/${linkId}`);
    const result = await handleCapture(request, { ...env, TURNSTILE_SITE_KEY: 'public-widget-key' }, undefined, helpers);
    expect(await result!.json()).toEqual({ active: true, noticeVersion: 'capture-v1', turnstileSiteKey: 'public-widget-key', securityReady: true });
    const missing = await handleCapture(request, { ...env, TURNSTILE_SITE_KEY: 'public-widget-key', TURNSTILE_SECRET_KEY: undefined }, undefined, helpers);
    expect(await missing!.json()).toMatchObject({ securityReady: false });
    expect(writes).toHaveLength(0);
  });
  it('registra captación, expediente canónico y consentimiento atómicamente, sin campaña', async () => {
    const result = await call(`/api/public/capture/${linkId}`, 'POST', { ...applicant, requestId: crypto.randomUUID(), turnstileToken: 'token', ownerUid: 'attacker', source: 'Other' }, undefined);
    expect(result!.status).toBe(201);
    const event = [...documents].find(([k]) => k.startsWith('captations/'))![1];
    expect(event.ownerUid).toBe(owner.uid); expect(event.source).toBe('WhatsApp'); expect(event.consent.accepted).toBe(true);
    expect(documents.get(`candidates/${event.candidateId}`)).toMatchObject({ captureOnly: true, campaignId: '' });
  });
  it('reintentar conserva exactamente una captación', async () => {
    const input = { ...applicant, requestId: crypto.randomUUID(), turnstileToken: 'token' };
    await call(`/api/public/capture/${linkId}`, 'POST', input, undefined); await call(`/api/public/capture/${linkId}`, 'POST', input, undefined);
    expect([...documents.keys()].filter(k => k.startsWith('captations/'))).toHaveLength(1);
    await expect(call(`/api/public/capture/${linkId}`, 'POST', { ...input, fullName: 'Otra Persona' }, undefined)).rejects.toThrow('INVALID_RETRY');
  });
  it('misma identidad preserva expediente y múltiples eventos sin sobrescribir', async () => {
    documents.set('candidates/existing', { id: 'existing', companyId: owner.companyId, dni: applicant.documentNumber, phone: '912345678', fullName: 'Nombre histórico' });
    for (let i = 0; i < 2; i++) await call(`/api/public/capture/${linkId}`, 'POST', { ...applicant, requestId: crypto.randomUUID(), turnstileToken: 'token' }, undefined);
    expect([...documents.keys()].filter(k => k.startsWith('candidates/'))).toHaveLength(1); expect(documents.get('candidates/existing').fullName).toBe('Nombre histórico');
    expect([...documents].filter(([k]) => k.startsWith('captations/')).map(([, e]) => e.candidateId)).toEqual(['existing', 'existing']);
  });
  it('teléfono coincidente con distinto documento requiere revisión y no transfiere propiedad', () => {
    expect(matchIdentity(captureInput(applicant), [{ id: 'another', dni: '87654321', phone: '912345678' }])).toEqual({ candidateId: undefined, conflict: true, possibleIds: ['another'] });
  });
  it('aislamiento de bandeja y supervisión admin', async () => {
    documents.set(`captations/${eventId}`, { ownerUid: 'other', companyId: 'other', applicant: {}, possibleIds: ['hidden'] });
    expect((await (await call('/api/capture/inbox'))!.json() as any).items).toHaveLength(0);
    expect((await (await call('/api/capture/inbox', 'GET', undefined, admin))!.json() as any).items).toHaveLength(1);
  });
  it('desactivar enlace bloquea registros posteriores', async () => {
    await call(`/api/capture/links/${linkId}`, 'PATCH', { active: false });
    await expect(call(`/api/public/capture/${linkId}`, 'GET', undefined, undefined)).rejects.toThrow('Este enlace no está disponible.');
  });
  it('eliminar enlace conserva el historial, impide reactivarlo y exige propietario', async () => {
    documents.set(`captations/${eventId}`, { id: eventId, linkId, ownerUid: owner.uid, companyId: owner.companyId });
    await expect(call(`/api/capture/links/${linkId}`, 'DELETE', undefined, { ...owner, uid: 'other' })).rejects.toThrow('FORBIDDEN');
    await call(`/api/capture/links/${linkId}`, 'DELETE');
    expect(documents.get(`captureLinks/${linkId}`)).toMatchObject({ active: false, deletedAt: expect.any(String) });
    expect(documents.get(`captations/${eventId}`)).toBeTruthy();
    expect(((await (await call('/api/capture/links'))!.json()) as any).items).toHaveLength(0);
    await expect(call(`/api/public/capture/${linkId}`, 'GET', undefined, undefined)).rejects.toThrow('Este enlace no está disponible.');
    await expect(call(`/api/capture/links/${linkId}`, 'PATCH', { active: true })).rejects.toThrow('NOT_FOUND');
  });
  it('rechaza cambios sobre enlaces ajenos', async () => {
    await expect(call(`/api/capture/links/${linkId}`, 'PATCH', { active: false }, { ...owner, uid: 'other' })).rejects.toThrow('FORBIDDEN');
  });
  it('gestión agrega auditoría conservando atributos originales', async () => {
    documents.set(`captations/${eventId}`, { ownerUid: owner.uid, companyId: owner.companyId, status: 'Nuevo', source: 'Facebook', history: [] });
    await call(`/api/capture/events/${eventId}`, 'PATCH', { status: 'Contactado', note: 'Se realizó contacto', ownerUid: 'attacker' });
    expect(documents.get(`captations/${eventId}`)).toMatchObject({ ownerUid: owner.uid, source: 'Facebook', status: 'Contactado', history: [{ actorUid: owner.uid, note: 'Se realizó contacto' }] });
  });
  it('dossier solo devuelve captaciones propias aunque compartan candidato', async () => {
    documents.set('candidates/person', { companyId: owner.companyId, fullName: 'Persona' });
    documents.set(`captations/${eventId}`, { ownerUid: owner.uid, companyId: owner.companyId, candidateId: 'person', applicant: { fullName: 'Persona' }, history: [] });
    documents.set('captations/other', { ownerUid: 'other', companyId: owner.companyId, candidateId: 'person', applicant: {}, history: [] });
    expect((await (await call('/api/capture/candidates/person'))!.json() as any).events).toHaveLength(1);
    await expect(call('/api/capture/candidates/person', 'GET', undefined, { ...owner, uid: 'not-linked' })).rejects.toThrow('FORBIDDEN');
  });
  it('reintenta contención de transacción sin duplicar', async () => {
    failCommit = true; await call(`/api/capture/links/${linkId}`, 'PATCH', { active: false }); expect(documents.get(`captureLinks/${linkId}`).active).toBe(false);
    expect(writes.filter(w => w.update.name.includes('/captureAudit/'))).toHaveLength(1);
  });
  it('límite persistente de 5 envíos por IP y minuto', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000000);
    for (let i = 0; i < 5; i++) await call(`/api/public/capture/${linkId}`, 'POST', { ...applicant, requestId: crypto.randomUUID(), turnstileToken: 'token' }, undefined);
    await expect(call(`/api/public/capture/${linkId}`, 'POST', { ...applicant, requestId: crypto.randomUUID(), turnstileToken: 'token' }, undefined)).rejects.toThrow('Demasiados envíos.'); vi.restoreAllMocks();
  });
  it('sin secretos rechaza registro público', async () => {
    const missing = { ...env, TURNSTILE_SECRET_KEY: undefined };
    await expect(handleCapture(new Request(`https://worker.test/api/public/capture/${linkId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...applicant, requestId: crypto.randomUUID() }) }), missing, undefined, helpers)).rejects.toThrow('pendiente de configuración');
  });
  it('rechaza Turnstile con hostname o acción incorrectos sin escribir datos', async () => {
    const original = fetch;
    vi.stubGlobal('fetch', vi.fn((input: string, init?: RequestInit) => input.includes('siteverify') ? Promise.resolve(Response.json({ success: true, hostname: 'attacker.example', action: 'capture' })) : original(input, init)));
    await expect(call(`/api/public/capture/${linkId}`, 'POST', { ...applicant, requestId: crypto.randomUUID(), turnstileToken: 'token' }, undefined)).rejects.toThrow('No se pudo verificar');
    expect(writes).toHaveLength(0);
  });
  it('propietario deshabilitado no recibe captaciones', async () => {
    documents.get(`users/${owner.uid}`).enabled = false;
    await expect(call(`/api/public/capture/${linkId}`, 'GET', undefined, undefined)).rejects.toThrow('Este enlace no está disponible.');
  });
});
