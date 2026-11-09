import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';

const projectId = 'talent-on-test';
const actorUid = 'admin-uid';
const allowedOrigin = 'http://localhost:3000';
const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
let privateKey: CryptoKey;
let publicJwk: JsonWebKey;
let privateKeyPem = '';

const base64url = (value: Uint8Array | string) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const stringValue = (value: string) => ({ stringValue: value });
const stringsValue = (value: string[]) => ({ arrayValue: { values: value.map(stringValue) } });
const actorDocument = (role: string, scope: string[] = [], legacy = false, enabled = true) => ({ fields: {
  uid: stringValue(actorUid),
  username: stringValue('admin'),
  displayName: stringValue('Administrador'),
  role: stringValue(role),
  companyId: stringValue('company-1'),
  module: stringsValue(role === 'ADMIN' ? ['ADMINISTRACION', 'FORMACION'] : role.includes('FORMACION') || role === 'FORMADOR' ? ['FORMACION'] : ['SELECCION']),
  ...(!legacy ? { allowedModules: stringsValue(role === 'ADMIN' ? ['ADMINISTRACION', 'FORMACION'] : role.includes('FORMACION') || role === 'FORMADOR' ? ['FORMACION'] : ['SELECCION']) } : {}),
  scope: stringsValue(scope),
  ...(!legacy ? { enabled: { booleanValue: enabled } } : {}),
  status: stringValue('ACTIVO'),
} });

async function tokenFor(uid = actorUid) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ aud: projectId, iss: `https://securetoken.google.com/${projectId}`, sub: uid, iat: now, exp: now + 3600 }));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

const env = (): Env => ({
  DATA_PROVIDER: 'firebase', // Pruebas históricas aisladas; runtime productivo usa Supabase.
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_CLIENT_EMAIL: `worker@${projectId}.iam.gserviceaccount.com`,
  FIREBASE_PRIVATE_KEY: privateKeyPem,
  ALLOWED_ORIGIN: allowedOrigin,
  PRODUCTION_ORIGIN: 'https://talent.example.com',
  MAX_UPLOAD_BYTES: '10485760',
  DOCUMENTS: {} as R2Bucket,
});

type FormationMockOptions = { actorScope?: string[]; actorLegacy?: boolean; actorEnabled?: boolean; training?: { coordinatorId?: string; companyId?: string; campaignId?: string; status?: string; trainerId?: string; trainerName?: string }; trainerRole?: string; trainerStatus?: string; trainerCompanyId?: string };
function installGoogleMocks(actorRole = 'ADMIN', options: FormationMockOptions = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ url, method, body });
    if (url.includes('/service_accounts/v1/jwk/')) return Response.json({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] }, { headers: { 'cache-control': 'max-age=3600' } });
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'google-access-token' });
    if (url.includes(`/documents/users/${actorUid}`)) return Response.json(actorDocument(actorRole, options.actorScope, options.actorLegacy, options.actorEnabled ?? true));
    if (url.includes('/documents/campaigns/campaign-1')) {
      if (method === 'PATCH') return Response.json({});
      return Response.json({ fields: { id: stringValue('campaign-1'), companyId: stringValue('company-1'), title: stringValue('Campaña original'), vacancies: { integerValue: '10' }, positionsCovered: { integerValue: '2' }, status: stringValue('EN_PROCESO'), responsibles: { arrayValue: { values: [] } } } });
    }
    if (url.includes('/documents/systemSettings/company-1')) return Response.json({}, { status: 404 });
    if (url.endsWith('/documents:runQuery')) return Response.json([]);
    if (url.endsWith('/documents:commit')) return Response.json({ writeResults: [] });
    if (url.endsWith('/accounts:lookup')) return Response.json({ users: [] });
    if (url.endsWith('/accounts')) return Response.json({ localId: 'created-uid' });
    if (url.endsWith('/accounts:update')) return Response.json({ localId: body?.localId });
    if (url.includes('/documents/users/target-uid')) return Response.json({ fields: {
      uid: stringValue('target-uid'), username: stringValue('target'), displayName: stringValue('Target'), role: stringValue('RECLUTADOR'), companyId: stringValue('company-1'), status: stringValue('ACTIVO'), enabled: { booleanValue: true },
    } });
    if (url.includes('/documents/trainings/training-1')) {
      if (method === 'PATCH') return Response.json({});
      return Response.json({ fields: {
        id: stringValue('training-1'), companyId: stringValue(options.training?.companyId ?? 'company-1'), campaignId: stringValue(options.training?.campaignId ?? 'campaign-1'), coordinatorId: stringValue(options.training?.coordinatorId ?? ''), status: stringValue(options.training?.status ?? 'EN_OJT'), trainerId: stringValue(options.training?.trainerId ?? 'old-trainer'), trainerName: stringValue(options.training?.trainerName ?? 'Anterior'),
      } });
    }
    if (url.includes('/documents/users/trainer-1')) return Response.json({ fields: {
      uid: stringValue('trainer-1'), username: stringValue('trainer.uno'), displayName: stringValue('Trainer Uno'), role: stringValue(options.trainerRole ?? 'FORMADOR'), companyId: stringValue(options.trainerCompanyId ?? 'company-1'), module: stringsValue(['FORMACION']), allowedModules: stringsValue(['FORMACION']), status: stringValue(options.trainerStatus ?? 'ACTIVO'), enabled: { booleanValue: options.trainerStatus !== 'INACTIVO' },
    } });
    if (url.endsWith('/documents/users')) return Response.json({ documents: [{ name: `projects/${projectId}/databases/(default)/documents/users/trainer-1`, fields: {
      uid: stringValue('trainer-1'), username: stringValue('trainer.uno'), displayName: stringValue('Trainer Uno'), role: stringValue(options.trainerRole ?? 'FORMADOR'), companyId: stringValue(options.trainerCompanyId ?? 'company-1'), module: stringsValue(['FORMACION']), allowedModules: stringsValue(['FORMACION']), status: stringValue(options.trainerStatus ?? 'ACTIVO'), enabled: { booleanValue: options.trainerStatus !== 'INACTIVO' },
    } }] });
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }));
}

function committedFields(targetPath: string): Record<string, unknown> | undefined {
  for (const call of calls) {
    const writes = Array.isArray(call.body?.writes) ? call.body.writes : [];
    for (const write of writes) {
      if (!write || typeof write !== 'object') continue;
      const update = (write as { update?: { name?: unknown; fields?: unknown } }).update;
      if (typeof update?.name === 'string' && update.name.endsWith(targetPath) && update.fields && typeof update.fields === 'object') return update.fields as Record<string, unknown>;
    }
  }
  return undefined;
}

async function request(path: string, method: string, body?: Record<string, unknown>, withToken = true) {
  return worker.fetch(new Request(`https://worker.example.com${path}`, {
    method,
    headers: {
      origin: allowedOrigin,
      ...(withToken ? { authorization: `Bearer ${await tokenFor()}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }), env());
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
  const encoded = btoa(String.fromCharCode(...pkcs8)).match(/.{1,64}/g)?.join('\n') ?? '';
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----\n`;
});

beforeEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

describe('administración de usuarios', () => {
  it('rechaza requests sin Firebase ID Token', async () => {
    installGoogleMocks();
    const result = await request('/api/users', 'POST', {}, false);
    expect(result.status).toBe(401);
    await expect(result.json()).resolves.toEqual({ message: 'UNAUTHENTICATED' });
  });

  it('rechaza un usuario autenticado sin rol ADMIN', async () => {
    installGoogleMocks('JEFE_FORMACION');
    const result = await request('/api/users', 'POST', { username: 'nuevo', password: 'Password123', displayName: 'Nuevo', role: 'RECLUTADOR' });
    expect(result.status).toBe(403);
    await expect(result.json()).resolves.toEqual({ message: 'FORBIDDEN' });
    expect(calls.some(call => call.url.endsWith('/accounts'))).toBe(false);
  });

  it('crea Auth, perfil y auditoría con los módulos por defecto', async () => {
    installGoogleMocks();
    const result = await request('/api/users', 'POST', { username: 'nuevo.user', password: 'Password123', displayName: 'Nuevo Usuario', dni: '12345678', nickname: 'Nue', tagline: 'Listo para formar talento', avatarUrl: 'https://images.example.com/nuevo.jpg', role: 'FORMADOR', status: 'ACTIVO' });
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ ok: true });
    expect(calls.some(call => call.url.endsWith('/accounts') && call.body?.email === 'nuevo.user@auth.talentcc.invalid')).toBe(true);
    expect(committedFields('/users/created-uid')).toMatchObject({ role: { stringValue: 'FORMADOR' }, nickname: { stringValue: 'Nue' }, tagline: { stringValue: 'Listo para formar talento' }, avatarUrl: { stringValue: 'https://images.example.com/nuevo.jpg' }, module: { arrayValue: { values: [{ stringValue: 'FORMACION' }] } } });
    expect(calls.some(call => (JSON.stringify(call.body) ?? '').includes('/auditLogs/'))).toBe(true);
  });

  it('exige DNI válido antes de crear la cuenta de Auth', async () => {
    installGoogleMocks();
    const result = await request('/api/users', 'POST', { username: 'sin.dni', password: 'Password123', displayName: 'Sin DNI', role: 'FORMADOR' });
    expect(result.status).toBe(400);
    expect(calls.some(call => call.url.endsWith('/accounts') && call.body?.email === 'sin.dni@auth.talentcc.invalid')).toBe(false);
  });

  it('actualiza rol, alcance y estado usando el endpoint /access', async () => {
    installGoogleMocks();
    const result = await request('/api/users/target-uid/access', 'PATCH', { role: 'COORDINADOR_FORMACION', status: 'INACTIVO', module: ['FORMACION'], scope: ['CMP-1'], displayName: 'Coordinador', nickname: 'Coordi', tagline: 'Coordinando grupos' });
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ ok: true });
    expect(calls.some(call => call.url.endsWith('/accounts:update') && call.body?.disabled === true)).toBe(true);
    expect(committedFields('/users/target-uid')).toMatchObject({ role: { stringValue: 'COORDINADOR_FORMACION' }, nickname: { stringValue: 'Coordi' }, tagline: { stringValue: 'Coordinando grupos' }, enabled: { booleanValue: false }, scope: { arrayValue: { values: [{ stringValue: 'CMP-1' }] } } });
  });

  it('restablece contraseña y registra auditoría', async () => {
    installGoogleMocks();
    const result = await request('/api/users/target-uid/reset-password', 'POST', { newPassword: 'NewPassword123' });
    expect(result.status).toBe(200);
    expect(calls.some(call => call.url.endsWith('/accounts:update') && call.body?.password === 'NewPassword123')).toBe(true);
    expect(calls.some(call => (JSON.stringify(call.body) ?? '').includes('/auditLogs/'))).toBe(true);
  });
});

describe('configuración del sistema', () => {
  it('devuelve valores predeterminados cuando aún no existe configuración', async () => {
    installGoogleMocks();
    const result = await request('/api/settings', 'GET');
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({ minPassGrade: 80, minAttendancePct: 85, slaSelectionDays: 5, ojtDurationDays: 5 });
  });

  it('persiste una configuración válida y registra auditoría', async () => {
    installGoogleMocks();
    const settings = { companyName: 'Talent-On', minPassGrade: 80, minAttendancePct: 85, slaSelectionDays: 5, ojtDurationDays: 5 };
    const result = await request('/api/settings', 'PATCH', settings);
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(settings);
    expect(committedFields('/systemSettings/company-1')).toMatchObject({ companyName: { stringValue: 'Talent-On' }, minPassGrade: { integerValue: '80' } });
    expect(calls.some(call => (JSON.stringify(call.body) ?? '').includes('SYSTEM_SETTINGS_UPDATED'))).toBe(true);
  });

  it('rechaza configuración para roles no administradores', async () => {
    installGoogleMocks('JEFE_FORMACION');
    const result = await request('/api/settings', 'GET');
    expect(result.status).toBe(403);
  });
});

describe('integridad de convocatorias', () => {
  it('ignora campos internos o de otro tenant en la edición general', async () => {
    installGoogleMocks('JEFE_SELECCION');
    const result = await request('/api/campaigns/campaign-1', 'PATCH', { title: 'Campaña actualizada', companyId: 'company-2', assignedUserIds: ['attacker'], createdBy: 'attacker' });
    expect(result.status).toBe(200);
    const patchCall = calls.find(call => call.method === 'PATCH' && call.url.includes('/documents/campaigns/campaign-1'));
    const written = patchCall?.body?.fields as Record<string, unknown>;
    expect(written).toHaveProperty('title');
    expect(written).not.toHaveProperty('companyId');
    expect(written).not.toHaveProperty('assignedUserIds');
    expect(written).not.toHaveProperty('createdBy');
  });
});

describe('asignación de formadores y alcance RBAC', () => {
  it('lista únicamente formadores aptos mediante un contrato seguro', async () => {
    installGoogleMocks('JEFE_FORMACION');
    const result = await request('/api/trainings/training-1/trainer', 'GET');
    expect(result.status).toBe(200);
    const payload = await result.json() as { trainers: Array<Record<string, unknown>> };
    expect(payload.trainers).toEqual([expect.objectContaining({ id: 'trainer-1', name: 'Trainer Uno', role: 'FORMADOR', status: 'ACTIVO' })]);
    expect(payload.trainers[0]).not.toHaveProperty('uid');
    expect(payload.trainers[0]).not.toHaveProperty('phone');
  });

  it('reasigna usando el perfil del servidor y conserva la etapa del grupo', async () => {
    installGoogleMocks('ADMIN');
    const result = await request('/api/trainings/training-1/trainer', 'POST', { trainerId: 'trainer-1', trainerName: 'Nombre manipulado', notes: 'Reasignación operativa' });
    expect(result.status).toBe(200);
    const payload = await result.json() as { training: Record<string, unknown> };
    expect(payload.training).toMatchObject({ trainerId: 'trainer-1', trainerName: 'Trainer Uno', status: 'EN_OJT' });
    const patchCall = calls.find(call => call.method === 'PATCH' && call.url.includes('/documents/trainings/training-1'));
    expect(patchCall?.body?.fields).toMatchObject({ trainerName: { stringValue: 'Trainer Uno' }, status: { stringValue: 'EN_OJT' } });
    expect(calls.some(call => (JSON.stringify(call.body) ?? '').includes('TRAINER_REASSIGNED'))).toBe(true);
  });

  it('rechaza al coordinador fuera de su campaña o grupo', async () => {
    installGoogleMocks('COORDINADOR_FORMACION', { actorScope: [], training: { coordinatorId: 'other-coordinator' } });
    const result = await request('/api/trainings/training-1/trainer', 'POST', { trainerId: 'trainer-1' });
    expect(result.status).toBe(403);
    await expect(result.json()).resolves.toEqual({ message: 'FORBIDDEN' });
  });

  it('rechaza cuentas que no sean formadores activos de la misma empresa', async () => {
    installGoogleMocks('JEFE_FORMACION', { trainerRole: 'RECLUTADOR' });
    const result = await request('/api/trainings/training-1/trainer', 'POST', { trainerId: 'trainer-1' });
    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toEqual({ message: 'TRAINER_NOT_AVAILABLE' });
  });

  it('no permite que un formador reasigne grupos', async () => {
    installGoogleMocks('FORMADOR', { training: { trainerId: actorUid } });
    const result = await request('/api/trainings/training-1/trainer', 'POST', { trainerId: 'trainer-1' });
    expect(result.status).toBe(403);
    await expect(result.json()).resolves.toEqual({ message: 'FORBIDDEN' });
  });

  it('no permite que un rol operativo enumere usuarios asignables', async () => {
    installGoogleMocks('FORMADOR');
    const result = await request('/api/users/assignable', 'GET');
    expect(result.status).toBe(403);
  });

  it('mantiene acceso de perfiles históricos activos sin enabled ni allowedModules', async () => {
    installGoogleMocks('JEFE_FORMACION', { actorLegacy: true });
    const result = await request('/api/trainings/training-1/trainer', 'GET');
    expect(result.status).toBe(200);
  });

  it('no duplica una reasignación cuando el mismo formador ya está asignado', async () => {
    installGoogleMocks('JEFE_FORMACION', { training: { trainerId: 'trainer-1', trainerName: 'Trainer Uno' } });
    const result = await request('/api/trainings/training-1/trainer', 'POST', { trainerId: 'trainer-1' });
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({ ok: true, alreadyAssigned: true });
    expect(calls.some(call => call.method === 'PATCH' && call.url.includes('/documents/trainings/training-1'))).toBe(false);
    expect(calls.some(call => (JSON.stringify(call.body) ?? '').includes('TRAINER_REASSIGNED'))).toBe(false);
  });

  it('rechaza perfiles inactivos aunque el token sea válido', async () => {
    installGoogleMocks('ADMIN', { actorEnabled: false });
    const result = await request('/api/users/assignable', 'GET');
    expect(result.status).toBe(403);
    await expect(result.json()).resolves.toEqual({ message: 'ACCOUNT_DISABLED' });
  });
});
