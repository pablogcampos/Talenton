import type { Env } from './index';
import { Store, body, CaptureError, type Data, type Helpers } from './capture';
type Actor = { uid: string; displayName?: string; role: string; companyId: string; allowedModules: string[]; scope?: string[]; subordinateUserIds?: string[] };
export const processStages = ['NUEVO', 'CONTACTADO', 'ENTREVISTA', 'VERIFICACION_TECNICA', 'EVALUACIONES', 'APTO_CAPACITACION'];
const terminal = ['NO_APTO', 'DESCARTADO', 'APTO_CAPACITACION'];
const terminalCampaign = ['CERRADO', 'ANULADO', 'EN_PAUSA'];
const safeId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const s = (v: unknown, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : '';
function assert(ok: unknown, message: string, status = 400): asserts ok { if (!ok) throw new CaptureError(message, status); }
function selectionUser(actor: Actor) { assert(actor.role === 'ADMIN' || (['JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'].includes(actor.role) && actor.allowedModules.includes('SELECCION')), 'FORBIDDEN', 403); }
export function campaignAccess(actor: Actor, campaign: Data, manager = false) {
  selectionUser(actor);
  if (actor.role === 'ADMIN') return;
  assert(campaign.companyId === actor.companyId, 'FORBIDDEN', 403);
  assert(actor.role === 'JEFE_SELECCION' || (actor.role === 'ANALISTA_SELECCION' && (campaign.assignedAnalystId === actor.uid || actor.scope?.includes(campaign.id))) || (!manager && actor.role === 'RECLUTADOR' && campaign.assignedUserIds?.includes(actor.uid)), 'FORBIDDEN', 403);
}
export function validateTemplate(input: Data) {
  assert(s(input.name, 120).length > 2 && Array.isArray(input.stages) && input.stages.length === processStages.length, 'INVALID_PROCESS');
  assert(input.stages.every((e: Data, i: number) => e.stage === processStages[i] && typeof e.requirements === 'string' && e.requirements.length <= 500), 'INVALID_STAGES');
  const evaluations = Array.isArray(input.evaluations) ? input.evaluations : [];
  assert(evaluations.length <= 10, 'INVALID_EVALUATIONS');
  const keys = new Set<string>();
  const clean = evaluations.map((e: Data) => {
    assert(s(e.id, 60) && !keys.has(e.id) && s(e.name, 120) && processStages.includes(e.stage) && typeof e.minScore === 'number' && e.minScore >= 0 && Array.isArray(e.questions) && e.questions.length > 0 && e.questions.length <= 20, 'INVALID_EVALUATION'); keys.add(e.id);
    const qkeys = new Set<string>();
    const questions = e.questions.map((q: Data) => {
      assert(s(q.id, 60) && !qkeys.has(q.id) && s(q.label, 300) && ['CLOSED', 'OPEN'].includes(q.type) && typeof q.points === 'number' && q.points > 0 && q.points <= 100, 'INVALID_QUESTION'); qkeys.add(q.id);
      if (q.type === 'CLOSED') assert(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 6 && q.options.every((o: unknown) => typeof o === 'string' && o.trim() && o.length <= 150) && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length, 'INVALID_ANSWERS');
      return { id: q.id, label: s(q.label, 300), type: q.type, points: q.points, ...(q.type === 'CLOSED' ? { options: q.options, correctIndex: q.correctIndex } : {}) };
    });
    assert(e.minScore <= questions.reduce((sum: number, q: Data) => sum + q.points, 0), 'INVALID_MIN_SCORE');
    return { id: e.id, name: s(e.name, 120), stage: e.stage, minScore: e.minScore, questions };
  });
  const interviewFields = Array.isArray(input.interviewFields) ? input.interviewFields : [];
  assert(interviewFields.length <= 20 && interviewFields.every((f: unknown) => typeof f === 'string' && f.trim() && f.length <= 150), 'INVALID_INTERVIEW_FIELDS');
  assert(Array.isArray(input.responsibleIds) && input.responsibleIds.length > 0 && input.responsibleIds.length <= 30 && input.responsibleIds.every(safeId), 'INVALID_RESPONSIBLES');
  const rules = input.rules || {};
  return { name: s(input.name, 120), description: s(input.description), position: s(input.position, 120), stages: input.stages.map((e: Data) => ({ stage: e.stage, requirements: e.requirements.trim() })), evaluations: clean, interviewFields, responsibleIds: [...new Set(input.responsibleIds)], rules: { assigned: rules.assigned === true, interviews: rules.interviews === true, pendingEvaluations: rules.pendingEvaluations === true, stageChanges: rules.stageChanges === true } };
}
export function gradeEvaluation(definition: Data, answers: Data[]) {
  assert(Array.isArray(answers) && answers.length === definition.questions.length, 'INVALID_ANSWERS');
  let score = 0;
  const results = definition.questions.map((q: Data) => {
    const values = answers.filter(a => a.questionId === q.id); assert(values.length === 1, 'INVALID_ANSWERS'); const a = values[0];
    if (q.type === 'CLOSED') { assert(Number.isInteger(a.choice) && a.choice >= 0 && a.choice < q.options.length, 'INVALID_CHOICE'); const points = a.choice === q.correctIndex ? q.points : 0; score += points; return { questionId: q.id, choice: a.choice, points }; }
    assert(typeof a.text === 'string' && a.text.length <= 1000 && typeof a.manualScore === 'number' && a.manualScore >= 0 && a.manualScore <= q.points, 'INVALID_MANUAL_SCORE'); score += a.manualScore; return { questionId: q.id, text: a.text, points: a.manualScore };
  });
  return { score, maxScore: definition.questions.reduce((sum: number, q: Data) => sum + q.points, 0), result: score >= definition.minScore ? 'APTO' : 'NO_APTO', answers: results };
}
export function checkProcessApproval(candidate: Data) {
  const config = candidate.selectionProcessSnapshot;
  if (!config) return;
  const results = candidate.selection?.evaluationsList || [];
  assert((config.evaluations || []).every((e: Data) => results.some((r: Data) => r.definitionId === e.id && r.processVersion === config.version && r.score >= e.minScore && r.result === 'APTO')), 'PROCESS_EVALUATIONS_INCOMPLETE', 409);
}
export function checkProcessStage(candidate: Data, target: string, actor: Actor) {
  const config = candidate.selectionProcessSnapshot; if (!config) return;
  assert(actor.role === 'ADMIN' || ['JEFE_SELECCION', 'ANALISTA_SELECCION'].includes(actor.role) || config.responsibleIds.includes(actor.uid), 'FORBIDDEN', 403);
  const requirement = config.stages?.find((e: Data) => e.stage === target)?.requirements;
  if (requirement && !['DESCARTADO', 'NO_APTO', 'APTO_CAPACITACION'].includes(target)) assert(candidate.selection?.processChecks?.[target]?.confirmed === true, 'PROCESS_REQUIREMENTS_INCOMPLETE', 409);
}
async function applicationId(candidateId: string, campaignId: string) { return 'SEL-' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${candidateId}:${campaignId}`)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
const action = (actor: Actor, name: string, detail: string) => ({ id: crypto.randomUUID(), at: new Date().toISOString(), actorUid: actor.uid, actorName: actor.displayName || actor.uid, action: name, detail });
const snapshot = (c: Data) => ({ selection: c.selection || {}, documents: c.documents || [], cvUrl: c.cvUrl || '', campaignId: c.campaignId || '', campaignName: c.campaignName || '', recruiterId: c.recruiterId || '', recruiterName: c.recruiterName || '' });
export function processNotifications(app: Data, candidate: Data, now = Date.now()) {
  if (app.status !== 'ACTIVA') return [];
  const result: Data[] = [], rules = app.rules || {};
  const notify = (id: string, message: string) => result.push({ id, recipientUid: app.recruiterId, message });
  if (rules.assigned) notify(`${app.id}:assigned`, 'Postulante vinculado a tu convocatoria.');
  if (rules.interviews) for (const interview of app.interviews || []) if (['Programada', 'Reprogramada'].includes(interview.status) && Date.parse(interview.scheduledAt) <= now + 86400000) notify(`${app.id}:interview:${interview.id}`, `Entrevista pendiente: ${interview.scheduledAt}`);
  if (rules.pendingEvaluations) for (const e of app.processSnapshot?.evaluations || []) if (!(candidate.selection?.evaluationsList || []).some((r: Data) => r.definitionId === e.id)) notify(`${app.id}:evaluation:${e.id}`, `Evaluación pendiente: ${e.name}`);
  if (rules.stageChanges) for (const trace of candidate.selection?.traceability || []) if (trace.id && trace.previousStage !== trace.newStage) notify(`${app.id}:stage:${trace.id}`, `Etapa: ${trace.newStage}`);
  return result;
}

export async function handleSelectionAdvanced(request: Request, env: Env, actor: Actor, helpers: Helpers): Promise<Response> {
  selectionUser(actor); const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean);
  assert(['GET', 'POST'].includes(request.method), 'NOT_FOUND', 404);
  const store = new Store(env, helpers, await helpers.token(env));
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
  const getCampaign = async (id: string, tx?: string, manager = false) => { assert(safeId(id), 'INVALID_ID'); const c = await store.get(`campaigns/${id}`, tx); assert(c, 'NOT_FOUND', 404); campaignAccess(actor, c!, manager); return c!; };
  const getApp = async (id: string, tx?: string) => { assert(safeId(id) || /^APP:[A-Za-z0-9_:-]{1,220}$/.test(id), 'INVALID_ID'); const app = await store.get(`selectionApplications/${id}`, tx); assert(app, 'NOT_FOUND', 404); await getCampaign(app!.campaignId, tx); if (actor.role === 'RECLUTADOR') assert(app!.recruiterId === actor.uid, 'FORBIDDEN', 403); return app!; };
  if (parts[2] === 'campaigns' && safeId(parts[3]) && parts[4] === 'transfers' && request.method === 'GET') {
    await getCampaign(parts[3]);
    const apps = await store.query('selectionApplications', { campaignId: parts[3] }, undefined, 10000);
    return reply({ items: apps.filter(a => a.status === 'CERRADA' && a.transferredTo && (actor.role !== 'RECLUTADOR' || a.recruiterId === actor.uid)).map(a => ({ id: a.id, name: a.candidateName, outcome: terminal.includes(a.outcomeSnapshot?.selection?.status) ? a.outcomeSnapshot.selection.status : a.outcomeSnapshot?.selection?.stage || a.stage, closedAt: a.closedAt })) });
  }
  if (parts[2] === 'candidates' && safeId(parts[3]) && parts[4] === 'transfer' && request.method === 'POST') {
    const input = await body(request); assert(safeId(input.campaignId), 'INVALID_ID');
    const result = await store.atomic(async tx => {
      const c = await store.get(`candidates/${parts[3]}`, tx); assert(c?.campaignId, 'NOT_FOUND', 404);
      await getCampaign(c!.campaignId, tx);
      assert(input.fromCampaignId === c!.campaignId, 'APPLICATION_CHANGED', 409);
      if (actor.role === 'RECLUTADOR') assert(c!.recruiterId === actor.uid, 'FORBIDDEN', 403);
      assert(c!.currentProcess === 'SELECCION' && !c!.trainingId, 'CANDIDATE_IN_DOWNSTREAM_PROCESS', 409);
      assert(c!.campaignId !== input.campaignId, 'SAME_CAMPAIGN', 409);
      const target = await getCampaign(input.campaignId, tx);
      assert(target.companyId === c!.companyId && !terminalCampaign.includes(target.status), 'CAMPAIGN_NOT_ACTIVE', 409);
      const owner = await store.get(`users/${c!.recruiterId}`, tx);
      assert(owner && owner.enabled !== false && owner.status === 'ACTIVO' && (owner.role === 'ADMIN' || target.assignedUserIds?.includes(c!.recruiterId)), 'RECRUITER_NOT_AUTHORIZED', 403);
      const apps = await store.query('selectionApplications', { candidateId: c!.id }, tx, 10000);
      const active = apps.filter(a => a.status === 'ACTIVA');
      const previous = active.find(a => a.id === c!.selectionApplicationId) || active.find(a => a.campaignId === c!.campaignId);
      assert(previous && active.every(a => a.campaignId === c!.campaignId), 'APPLICATION_NOT_ACTIVE', 409);
      const trace = action(actor, 'Traslado de convocatoria', `${c!.campaignName} → ${target.title}. Se asignó a otra convocatoria.`);
      const id = `SEL-${crypto.randomUUID()}`;
      const selection = { callId: target.id, stage: 'NUEVO', status: 'ACTIVO', scores: { psicometrico: 0, vozDiccion: 0, tipificacionWPM: 0, simulacionRoleplay: 0, overall: 0 }, contactHistory: [], evaluations: [], evaluationsList: [], documents: [], observations: [], traceability: [] };
      return { result: { ok: true }, writes: [
        ...active.filter(a => a.id !== previous.id).map(a => ({ path: `selectionApplications/${a.id}`, data: { ...a, status: 'CERRADA', closedAt: trace.at, closeReason: 'Participación original consolidada al trasladar', outcomeSnapshot: snapshot(c!) } })),
        { path: `selectionApplications/${previous.id}`, data: { ...previous, status: 'CERRADA', closedAt: trace.at, closeReason: 'Se asignó a otra convocatoria', candidateName: c!.fullName, transferredTo: target.id, outcomeSnapshot: snapshot(c!), history: [...(previous.history || []), trace] } },
        { path: `selectionApplications/${id}`, data: { id, candidateId: c!.id, companyId: c!.companyId, campaignId: target.id, recruiterId: c!.recruiterId, status: 'ACTIVA', createdAt: trace.at, history: [trace], processSnapshot: null }, create: true },
        { path: `candidates/${c!.id}`, data: { campaignId: target.id, campaignCode: target.code, campaignName: target.title, selectionApplicationId: id, selectionActive: true, selectionProcessSnapshot: null, applicationDate: trace.at.slice(0, 10), currentStage: 'SELECCION', selection }, patch: true },
      ] };
    }); return reply(result);
  }
  if (parts[2] === 'campaigns' && safeId(parts[3])) {
    const campaignId = parts[3];
    if (request.method === 'GET') { await getCampaign(campaignId); const templates = await store.query('selectionTemplates', { campaignId }, undefined, 201); return reply({ templates, communicationTypes: ['Citación', 'Recordatorio', 'Confirmación', 'Resultado', 'Reprogramación'] }); }
    if (request.method === 'POST') {
      const input = await body(request), config = validateTemplate(input), id = `TPL-${crypto.randomUUID()}`;
      const result = await store.atomic(async tx => {
        const campaign = await getCampaign(campaignId, tx, true); if (input.previousId) assert(safeId(input.previousId), 'INVALID_ID'); const previous = input.previousId ? await store.get(`selectionTemplates/${input.previousId}`, tx) : undefined;
        if (input.previousId) assert(previous?.campaignId === campaignId && previous.companyId === campaign.companyId, 'INVALID_VERSION');
        for (const uid of config.responsibleIds) { const user = await store.get(`users/${uid}`, tx); assert(user && user.companyId === campaign.companyId && user.status === 'ACTIVO' && user.enabled !== false && ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'].includes(user.role), 'INVALID_RESPONSIBLE'); }
        const familyId = previous?.familyId || previous?.id || id, family = await store.get(`selectionTemplateFamilies/${familyId}`, tx);
        if (family) assert(family.campaignId === campaignId && family.companyId === campaign.companyId, 'INVALID_VERSION');
        const version = (family?.version || previous?.version || 0) + 1, data = { ...config, id, familyId, campaignId, companyId: campaign.companyId, version, previousId: previous?.id || '', createdAt: new Date().toISOString(), createdBy: actor.uid };
        return { result: data, writes: [{ path: `selectionTemplates/${id}`, data, create: true }, { path: `selectionTemplateFamilies/${familyId}`, data: { campaignId, companyId: campaign.companyId, version, latestId: id } }] };
      }); return reply(result, 201);
    }
  }
  if (parts[2] === 'link' && request.method === 'POST') {
    assert(['ADMIN', 'RECLUTADOR', 'ANALISTA_SELECCION'].includes(actor.role), 'FORBIDDEN', 403); const input = await body(request); assert(safeId(input.eventId) && safeId(input.campaignId), 'INVALID_LINK');
    const result = await store.atomic(async tx => {
      const event = await store.get(`captations/${input.eventId}`, tx); assert(event && !event.conflict, 'CAPTURE_REVIEW_REQUIRED', 409);
      assert(actor.role === 'ADMIN' || (event!.companyId === actor.companyId && (event!.ownerUid === actor.uid || (actor.role === 'ANALISTA_SELECCION' && actor.subordinateUserIds?.includes(event!.ownerUid)))), 'FORBIDDEN', 403);
      const campaign = await getCampaign(input.campaignId, tx); assert(!terminalCampaign.includes(campaign.status), 'CAMPAIGN_NOT_ACTIVE', 409);
      const c = await store.get(`candidates/${event!.candidateId}`, tx); assert(c && c.companyId === campaign.companyId, 'FORBIDDEN', 403);
      const id = await applicationId(c!.id, campaign.id), existing = await store.get(`selectionApplications/${id}`, tx);
      if (existing) { assert(existing.status === 'ACTIVA' && c!.selectionApplicationId === id, 'ALREADY_ENROLLED', 409); return { result: existing, writes: [] }; }
      assert(!c!.selectionApplicationId && (!c!.campaignId || c!.captureOnly === true || c!.selectionActive === false), 'ACTIVE_APPLICATION_EXISTS', 409);
      assert(!c!.currentProcess || c!.currentProcess === 'SELECCION', 'CANDIDATE_IN_DOWNSTREAM_PROCESS', 409);
      let config: Data | undefined;
      if (input.templateId) { assert(safeId(input.templateId), 'INVALID_ID'); config = await store.get(`selectionTemplates/${input.templateId}`, tx); assert(config && config.campaignId === campaign.id && config.companyId === campaign.companyId && config.responsibleIds.includes(event!.ownerUid), 'INVALID_PROCESS_TEMPLATE'); }
      const trace = action(actor, 'Vinculación manual', campaign.title); const owner = await store.get(`users/${event!.ownerUid}`, tx); assert(owner && owner.status === 'ACTIVO', 'RECRUITER_NOT_AVAILABLE');
      assert(owner.enabled !== false && owner.companyId === campaign.companyId && ['ADMIN', 'RECLUTADOR'].includes(owner.role) && (owner.role === 'ADMIN' || campaign.assignedUserIds?.includes(event!.ownerUid)), 'RECRUITER_NOT_AUTHORIZED', 403);
      const data = { id, candidateId: c!.id, companyId: c!.companyId, campaignId: campaign.id, recruiterId: event!.ownerUid, originEventId: event!.id, originSource: event!.source, status: 'ACTIVA', createdAt: trace.at, createdBy: actor.uid, processSnapshot: config || null, interviews: [], evaluationAttempts: [], communications: [], history: [trace], rules: config?.rules || { assigned: false, interviews: false, pendingEvaluations: false, stageChanges: false } };
      const selection = { callId: campaign.id, stage: 'NUEVO', status: 'ACTIVO', scores: { psicometrico: 0, vozDiccion: 0, tipificacionWPM: 0, simulacionRoleplay: 0, overall: 0 }, contactHistory: [], evaluations: [], evaluationsList: [], documents: [], observations: [], traceability: [{ id: trace.id, date: trace.at.slice(0, 10), time: trace.at.slice(11, 16), user: trace.actorName, previousStage: 'N/A', newStage: 'NUEVO', observation: 'Vinculación manual desde Captación.' }] };
      const sources: Record<string, string> = { Facebook: 'Facebook Gratis', WhatsApp: 'Grupo WhatsApp', LinkedIn: 'LINKEDIN', Referidos: 'Referidos' };
      const projection = {
        captureOnly: false, selectionApplicationId: id, selectionActive: true, selectionProcessSnapshot: config || null,
        campaignId: campaign.id, campaignCode: campaign.code || '', campaignName: campaign.title || '', jobProfile: campaign.title || '',
        recruiterId: event!.ownerUid, recruiterName: owner!.displayName || owner!.name || '', analystId: campaign.assignedAnalystId || '', analystName: campaign.assignedAnalystName || '',
        applicationDate: trace.at.slice(0, 10), source: sources[event!.source] || 'Otro', sourceDetails: event!.source,
        currentProcess: 'SELECCION', currentStage: 'SELECCION', age: c!.age || 0, birthDate: c!.birthDate || '', avatarUrl: c!.avatarUrl || '', experienceMonths: c!.experienceMonths || 0, englishLevel: c!.englishLevel || 'NINGUNO',
        training: c!.training || { status: 'PENDIENTE_INICIO', attendance: [], evaluations: [] },
        ojt: c!.ojt || { status: 'NO_INICIADO', dailyMetrics: [], skillsMatrix: {}, coachingFeedbacks: [] },
        hiring: c!.hiring || { status: 'PENDIENTE_CONTRATACION', documentsValidated: false, laborData: {}, contract: {}, welcomeEmailSent: false }, selection,
      };
      return { result: data, writes: [{ path: `selectionApplications/${id}`, data, create: true }, { path: `candidates/${c!.id}`, data: projection, patch: true }] };
    }); return reply(result, 201);
  }
  if (parts[2] === 'candidates' && safeId(parts[3]) && request.method === 'GET') {
    const id = parts[3], c = await store.get(`candidates/${id}`); assert(c, 'NOT_FOUND', 404);
    const apps = await store.query('selectionApplications', { candidateId: id }, undefined, 201), visible: Data[] = [];
    for (const app of apps) { try { await getCampaign(app.campaignId); if (actor.role === 'RECLUTADOR' && app.recruiterId !== actor.uid) continue; visible.push({ ...app, ...(app.status === 'ACTIVA' && c!.selectionApplicationId === app.id ? { currentSnapshot: snapshot(c!) } : {}) }); } catch(e) { if (!(e instanceof CaptureError) || e.status !== 403) throw e; } }
    if (c!.campaignId) { try { await getCampaign(c!.campaignId); if (actor.role !== 'RECLUTADOR' || c!.recruiterId === actor.uid) return reply({ applications: visible, legacy: !c!.selectionApplicationId && c!.selectionActive !== false ? snapshot(c!) : null }); } catch(e) { if (!(e instanceof CaptureError) || e.status !== 403) throw e; } }
    assert(visible.length, 'FORBIDDEN', 403); return reply({ applications: visible, legacy: null });
  }
  if (parts[2] === 'candidates' && safeId(parts[3]) && parts[4] === 'initialize' && request.method === 'POST') {
    const input = await body(request);
    const result = await store.atomic(async tx => {
      const c = await store.get(`candidates/${parts[3]}`, tx); assert(c?.campaignId, 'NOT_FOUND', 404); const campaign = await getCampaign(c!.campaignId, tx);
      if (actor.role === 'RECLUTADOR') assert(c!.recruiterId === actor.uid, 'FORBIDDEN', 403);
      assert(c!.currentProcess === 'SELECCION' && c!.selectionActive !== false, 'APPLICATION_NOT_ACTIVE', 409);
      if (c!.selectionApplicationId) return { result: { id: c!.selectionApplicationId }, writes: [] };
      const id = await applicationId(c!.id, c!.campaignId); assert(!await store.get(`selectionApplications/${id}`, tx), 'ALREADY_ENROLLED', 409);
      let config: Data | undefined;
      if (input.templateId) { assert(safeId(input.templateId), 'INVALID_ID'); config = await store.get(`selectionTemplates/${input.templateId}`, tx); assert(config && config.campaignId === campaign.id && config.companyId === campaign.companyId && config.responsibleIds.includes(c!.recruiterId), 'INVALID_PROCESS_TEMPLATE'); }
      const trace = action(actor, 'Habilitación de gestión avanzada', 'Se conserva el proceso vigente.');
      const data = { id, candidateId: c!.id, campaignId: c!.campaignId, companyId: c!.companyId, recruiterId: c!.recruiterId, status: 'ACTIVA', createdAt: trace.at, createdBy: actor.uid, baselineSnapshot: snapshot(c!), processSnapshot: config || null, interviews: [], evaluationAttempts: [], communications: [], history: [trace], rules: config?.rules || { assigned: false, interviews: false, pendingEvaluations: false, stageChanges: false } };
      return { result: { id }, writes: [{ path: `selectionApplications/${id}`, data, create: true }, { path: `candidates/${c!.id}`, data: { selectionApplicationId: id, selectionActive: true, selectionProcessSnapshot: config || null }, patch: true }] };
    }); return reply(result, 201);
  }
  if (parts[2] === 'candidates' && safeId(parts[3]) && parts[4] === 'close' && request.method === 'POST') {
    const input = await body(request); assert(s(input.reason).length >= 5, 'CLOSURE_REASON_REQUIRED');
    const result = await store.atomic(async tx => {
      const c = await store.get(`candidates/${parts[3]}`, tx); assert(c?.campaignId, 'NOT_FOUND', 404); await getCampaign(c!.campaignId, tx);
      if (actor.role === 'RECLUTADOR') assert(c!.recruiterId === actor.uid, 'FORBIDDEN', 403);
      assert(c!.currentProcess === 'SELECCION' && terminal.includes(c!.selection?.stage), 'APPLICATION_NOT_FINISHED', 409);
      const id = c!.selectionApplicationId || await applicationId(c!.id, c!.campaignId), existing = await store.get(`selectionApplications/${id}`, tx);
      assert(!existing || existing.status === 'ACTIVA', 'APPLICATION_ALREADY_CLOSED', 409); const trace = action(actor, 'Cierre manual', s(input.reason));
      const data = { ...(existing || { candidateId: c!.id, campaignId: c!.campaignId, companyId: c!.companyId, recruiterId: c!.recruiterId, interviews: [], evaluationAttempts: [], communications: [] }), status: 'CERRADA', closedAt: trace.at, closedBy: actor.uid, outcomeSnapshot: snapshot(c!), history: [...(existing?.history || []), trace] };
      return { result: { ok: true }, writes: [{ path: `selectionApplications/${id}`, data, ...(!existing ? { create: true } : {}) }, { path: `candidates/${c!.id}`, data: { selectionApplicationId: '', selectionActive: false }, patch: true }] };
    }); return reply(result);
  }
  if (parts[2] === 'applications' && (safeId(parts[3]) || /^APP:[A-Za-z0-9_:-]{1,220}$/.test(decodeURIComponent(parts[3])))) {
    const id = decodeURIComponent(parts[3]);
    if (request.method === 'GET') { const app = await getApp(id), c = await store.get(`candidates/${app.candidateId}`); return reply({ ...app, notifications: processNotifications(app, c?.selectionApplicationId === id ? c : {}) }); }
    const input = await body(request); assert(safeId(input.requestId), 'REQUEST_ID_REQUIRED');
    const result = await store.atomic(async tx => {
      const app = await getApp(id, tx), candidate = await store.get(`candidates/${app.candidateId}`, tx); assert(app.status === 'ACTIVA' && candidate?.selectionApplicationId === id, 'APPLICATION_CLOSED', 409);
      if ((app.history || []).some((h: Data) => h.requestId === input.requestId)) return { result: { ok: true }, writes: [] };
      assert(app.history.length < 200, 'APPLICATION_HISTORY_LIMIT', 409); const now = new Date().toISOString(); const patch: Data = {}; let candidatePatch: Data | undefined;
      if (parts[4] === 'interviews') {
        assert(['Programada', 'Realizada', 'Reprogramada', 'Cancelada'].includes(input.status) && ['Presencial', 'Virtual', 'Telefónica'].includes(input.modality) && typeof input.scheduledAt === 'string' && !Number.isNaN(Date.parse(input.scheduledAt)) && safeId(input.interviewerId), 'INVALID_INTERVIEW');
        const interviewer = await store.get(`users/${input.interviewerId}`, tx); assert(interviewer && interviewer.companyId === app.companyId && interviewer.status === 'ACTIVO' && interviewer.enabled !== false && ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'].includes(interviewer.role), 'INVALID_INTERVIEWER');
        if (app.processSnapshot) assert(app.processSnapshot.responsibleIds.includes(input.interviewerId), 'INVALID_INTERVIEWER');
        const interviews = app.interviews || [], previous = input.interviewId ? interviews.find((i: Data) => i.id === input.interviewId) : undefined;
        if (input.interviewId) assert(previous && previous.status !== 'Realizada' && previous.status !== 'Cancelada', 'INTERVIEW_FINISHED', 409);
        assert(!previous || ['Realizada', 'Reprogramada', 'Cancelada'].includes(input.status), 'INVALID_INTERVIEW_TRANSITION');
        assert(previous || input.status === 'Programada', 'INTERVIEW_MUST_BE_SCHEDULED');
        const answers = input.answers && typeof input.answers === 'object' && !Array.isArray(input.answers) ? input.answers : {};
        assert(Object.values(answers).every(a => typeof a === 'string' && a.length <= 1000), 'INVALID_INTERVIEW_ANSWERS');
        if (input.status === 'Realizada') assert(['APTO', 'NO_APTO'].includes(input.result) && (app.processSnapshot?.interviewFields || []).every((f: string) => s(answers[f]).length), 'INTERVIEW_RESULTS_REQUIRED');
        if (input.status === 'Realizada' && actor.role === 'RECLUTADOR') assert(input.interviewerId === actor.uid, 'FORBIDDEN', 403);
        if (['Programada', 'Reprogramada'].includes(input.status)) assert(Date.parse(input.scheduledAt) > Date.now(), 'INTERVIEW_DATE_IN_PAST');
        const item = { id: previous?.id || crypto.randomUUID(), status: input.status, scheduledAt: input.scheduledAt, modality: input.modality, interviewerId: input.interviewerId, notes: s(input.notes, 1000), result: input.status === 'Realizada' ? input.result : '', answers, history: [...(previous?.history || []), { at: now, actorUid: actor.uid, status: input.status, scheduledAt: input.scheduledAt }] };
        patch.interviews = previous ? interviews.map((i: Data) => i.id === previous.id ? item : i) : [...interviews, item];
        // Only the recorded interview result is projected, never automatic candidate rejection/stage changes.
        if (input.status === 'Realizada') candidatePatch = { selection: { ...candidate!.selection, interviewResult: { status: input.result, notes: item.notes, responsibleId: input.interviewerId, date: now.slice(0, 10), configuredAnswers: answers } } };
      } else if (parts[4] === 'evaluations') {
        const definition = app.processSnapshot?.evaluations?.find((e: Data) => e.id === input.definitionId); assert(definition, 'EVALUATION_NOT_CONFIGURED');
        const grade = gradeEvaluation(definition, input.answers); const item = { id: crypto.randomUUID(), definitionId: definition.id, name: definition.name, title: definition.name, evaluator: actor.displayName || actor.uid, date: now.slice(0, 10), comments: 'Evaluación configurada.', passed: grade.result === 'APTO', processVersion: app.processSnapshot.version, definitionSnapshot: definition, ...grade, recordedAt: now, responsibleId: actor.uid };
        patch.evaluationAttempts = [...(app.evaluationAttempts || []), item];
        const old = candidate!.selection?.evaluationsList || []; candidatePatch = { selection: { ...candidate!.selection, evaluationsList: [...old.filter((e: Data) => e.definitionId !== definition.id), item], evaluations: [...old.filter((e: Data) => e.definitionId !== definition.id), item] } };
      } else if (parts[4] === 'requirements') {
        assert(app.processSnapshot && processStages.includes(input.stage) && typeof input.confirmed === 'boolean' && s(input.notes).length >= 5, 'INVALID_PROCESS_CHECK');
        candidatePatch = { selection: { ...candidate!.selection, processChecks: { ...(candidate!.selection?.processChecks || {}), [input.stage]: { confirmed: input.confirmed, notes: s(input.notes), actorUid: actor.uid, at: now } } } };
      } else if (parts[4] === 'rules') {
        assert(['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION'].includes(actor.role), 'FORBIDDEN', 403); const r = input.rules || {}; patch.rules = { assigned: r.assigned === true, interviews: r.interviews === true, pendingEvaluations: r.pendingEvaluations === true, stageChanges: r.stageChanges === true };
      } else if (parts[4] === 'communications') {
        const templates = await store.query('selectionMessages', { campaignId: app.campaignId }, tx); const t = templates.find(t => t.id === input.templateId); assert(t, 'MESSAGE_TEMPLATE_NOT_FOUND');
        const variables = { nombre: candidate!.fullName || '', convocatoria: candidate!.campaignName || '', fecha: s(input.date, 30), horario: s(input.time, 30) };
        const content = t!.content.replace(/\{\{(nombre|convocatoria|fecha|horario)\}\}/g, (_: string, key: keyof typeof variables) => variables[key]);
        const item = { id: crypto.randomUUID(), templateId: t!.id, templateSnapshot: t, content, status: 'PREPARADO', at: now, actorUid: actor.uid };
        patch.communications = [...(app.communications || []), item];
      } else throw new CaptureError('NOT_FOUND', 404);
      patch.history = [...app.history, { ...action(actor, parts[4], s(input.notes || input.status || input.definitionId)), requestId: input.requestId }];
      return { result: { ok: true }, writes: [{ path: `selectionApplications/${id}`, data: patch, patch: true }, ...(candidatePatch ? [{ path: `candidates/${app.candidateId}`, data: candidatePatch, patch: true }] : [])] };
    }); return reply(result);
  }
  if (parts[2] === 'messages' && safeId(parts[3])) {
    const campaignId = parts[3]; await getCampaign(campaignId, undefined, request.method !== 'GET');
    if (request.method === 'GET') return reply(await store.query('selectionMessages', { campaignId }, undefined, 201));
    if (request.method === 'POST') { const input = await body(request); assert(s(input.name, 120) && ['Citación', 'Recordatorio', 'Confirmación', 'Resultado', 'Reprogramación'].includes(input.type) && typeof input.content === 'string' && input.content.length > 5 && input.content.length <= 2000, 'INVALID_MESSAGE_TEMPLATE');
      assert(!/\{\{(?!nombre\}\}|convocatoria\}\}|fecha\}\}|horario\}\})/.test(input.content), 'INVALID_MESSAGE_VARIABLE');
      const id = `MSG-${crypto.randomUUID()}`, data = { id, campaignId, name: s(input.name, 120), type: input.type, content: input.content, createdAt: new Date().toISOString(), createdBy: actor.uid };
      await store.atomic(async () => ({ result: null, writes: [{ path: `selectionMessages/${id}`, data, create: true }] })); return reply(data, 201);
    }
  }
  throw new CaptureError('NOT_FOUND', 404);
}
