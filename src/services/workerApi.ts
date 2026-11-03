import { supabaseAccessToken } from './supabase';

const baseUrl = (import.meta.env.VITE_ADMIN_API_URL || import.meta.env.VITE_WORKER_API_URL)?.replace(/\/$/, '');
const unifiedUrl=(path:string)=>`${baseUrl}${path}${path.includes('?')?'&':'?'}unified=1`;

type WorkerErrorPayload = { message?: unknown };

export class WorkerApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'WorkerApiError';
  }
}

const WORKER_ERROR_MESSAGES: Record<string, string> = {
  OFFER_SIGNATURES_PENDING: 'Todos los participantes deben firmar su propuesta laboral antes de finalizar la etapa teórica. Revisa la sección Propuestas.',
  OFFER_STAGE_CLOSED: 'La etapa teórica ya está cerrada; no se puede cambiar la propuesta.',
  OFFER_INVALID_TEMPLATE: 'La propuesta debe pertenecer a la misma empresa y campaña de la capacitación.',
  OFFER_ALREADY_SIGNED: 'Ya existen firmas. La propuesta asignada se conserva sin modificaciones.',
  OFFER_REVOKED_VERSION: 'Esta versión fue reemplazada. Crea una nueva versión para asignarla.',
  OFFER_INVALID_SIGNATURE: 'Verifica tu documento, acepta las condiciones y dibuja tu firma completa.',
  OFFER_RATE_LIMITED: 'Se alcanzó el límite de intentos. Intenta nuevamente en 15 minutos.',
  OFFER_NOT_FOUND: 'La propuesta no está disponible o el enlace fue reemplazado.',
  OFFER_INVALID: 'Revisa los campos de la propuesta.',
  OFFER_FAILED: 'No se pudo completar la operación de propuestas. Intenta nuevamente.',
  GERENCIA_REQUIRED: 'Agrega una gerencia activa antes de generar el enlace.',
  LINK_NOT_FOUND: 'El enlace ya no está disponible.',
  LOOKUP_EXPIRED: 'La consulta del DNI venció o ya fue utilizada. Vuelve a consultarlo.',
  RATE_LIMITED: 'Demasiados intentos. Espera antes de volver a consultar.',
  CHALLENGE_REQUIRED: 'Completa la verificación de seguridad.',
  CHALLENGE_FAILED: 'No se pudo verificar el desafío. Inténtalo de nuevo.',
  OPERATIONS_SECURITY_NOT_CONFIGURED: 'El formulario de RQ está pendiente de configuración de seguridad.',
  INVALID_REQUESTER: 'El usuario ya no está activo o no pertenece a esta empresa.',
  RQ_ALREADY_LINKED: 'Este RQ ya se convirtió en una convocatoria.',
  COMPANY_REQUIRED: 'Selecciona la empresa a la que pertenece el registro.',
  COMPANY_CONTEXT_AMBIGUOUS: 'Este identificador existe en varias empresas. No se modificó ningún registro; solicita revisar su identificación.',
  COMPANY_LOOKUP_FAILED: 'No se pudo identificar la empresa del enlace. No se eliminó; actualiza la página e inténtalo nuevamente.',
  UNIFIED_READ_FAILED: 'No se pudo cargar la vista conjunta. Intenta actualizar; no se muestran resultados parciales.',
  'Worker API no está configurada o no existe sesión.': 'El servicio administrativo no está configurado o tu sesión venció.',
  WORKER_NETWORK_UNREACHABLE: 'No se pudo conectar con el servicio. Verifica tu conexión e inténtalo nuevamente.',
  FIREBASE_TOKEN_UNAVAILABLE: 'No se pudo validar tu sesión. Vuelve a iniciar sesión e inténtalo nuevamente.',
  UNAUTHENTICATED: 'Tu sesión venció. Vuelve a iniciar sesión.',
  INVALID_TOKEN: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  FORBIDDEN: 'No tienes permisos para realizar esta acción.',
  ORG_VALIDATION_FAILED: 'Revisa la empresa, campaña, rol y versión de la asignación.',
  COMPANY_CAMPAIGN_REQUIRED: 'Selecciona una campaña autorizada para esta empresa.',
  COMPANY_LEGAL_REQUIRED: 'Configura la razón social legal y el RUC de la empresa en Administración antes de preparar datos laborales o contratos.',
  USER_HOME_COMPANY_REQUIRED: 'Edita el perfil o restablece la contraseña desde la empresa de origen del usuario. Para modificar acceso a esta empresa usa Asignaciones multiempresa.',
  INVALID_CAMPAIGN: 'Completa el nombre y una cantidad válida de vacantes.',
  INVALID_CANDIDATE_AGE: 'Ingresa una edad válida entre 1 y 120 años.',
  TARGET_EXCEEDS_VACANCIES: 'Las vacantes no pueden ser menores que las cuotas asignadas. Ajusta primero las cuotas de los responsables.',
  INVALID_CAMPAIGN_DATES: 'Revisa las fechas: deben ser válidas y el fin no puede ser anterior al inicio.',
  INVALID_CAMPAIGN_AMOUNT: 'Las vacantes deben ser enteras y los importes deben ser números válidos; el sueldo no puede ser negativo.',
  INVALID_STATUS: 'El estado seleccionado no es válido.',
  RELATED_RECORD_INVALID: 'Una referencia (usuario, grupo o convocatoria) ya no es válida. Actualiza la vista y revisa la asignación.',
  DATA_VALIDATION_FAILED: 'Los datos incumplen una validación. Revisa importes, fechas, estados y campos obligatorios.',
  INVALID_DATA_FORMAT: 'Revisa el formato de las fechas y los valores numéricos.',
  RELATIONAL_WRITE_FAILED: 'No se pudo confirmar el guardado en Supabase. Conserva los cambios y comunica este código al administrador: RELATIONAL_WRITE_FAILED.',
  ACTIVE_APPLICATION_EXISTS: 'El postulante ya tiene una convocatoria activa. Debes cerrar esa participación antes de vincular otra.',
  ALREADY_ENROLLED: 'El postulante ya participó en esta convocatoria. Se conserva su inscripción e historial.',
  APPLICATION_NOT_FINISHED: 'Para cerrar, primero registra un resultado final de selección.',
  APPLICATION_CLOSED: 'La participación está cerrada y sus resultados son de solo consulta.',
  CAPTURE_REVIEW_REQUIRED: 'La identidad del postulante necesita revisión administrativa antes de vincularlo.',
  PROCESS_REQUIREMENTS_INCOMPLETE: 'Verifica los requisitos de la etapa en Gestión avanzada antes de continuar.',
  PROCESS_EVALUATIONS_INCOMPLETE: 'Completa y aprueba las evaluaciones de la versión aplicada antes de continuar.',
  CANDIDATE_IN_DOWNSTREAM_PROCESS: 'El postulante está en Formación, OJT o Talento; no se puede iniciar otra convocatoria.',
  INVALID_PROCESS_TEMPLATE: 'La plantilla debe pertenecer a la convocatoria y autorizar al responsable de captación.',
  ORIGIN_NOT_ALLOWED: 'Este origen no está autorizado para usar el servicio.',
  ACCOUNT_DISABLED: 'Tu cuenta está inactiva. Contacta a un administrador.',
  WORKER_REQUEST_FAILED: 'No se pudo completar la operación. Inténtalo nuevamente.',
  INVALID_STAGE_TRANSITION: 'El cambio de etapa solicitado no está permitido.',
  SELECTION_REQUIREMENTS_INCOMPLETE: 'Completa los requisitos de selección antes de continuar.',
  INVALID_TRAINING_TRANSITION: 'El cambio de estado de capacitación no está permitido.',
  INVALID_PARTICIPANT_STATUS: 'Verifica que el grupo esté iniciado y que el participante se encuentre en la etapa correcta.',
  INVALID_FINAL_GRADES: 'Ingresa una nota final de 0 a 20 para cada participante en capacitación.',
  NO_PARTICIPANTS_FOR_THEORY: 'No hay participantes pendientes para esta acción. Actualiza el grupo.',
  INVALID_EVALUATION: 'Selecciona una evaluación configurada e ingresa una nota dentro de su escala.',
  INVALID_OJT_STATUS: 'Esta acción requiere un participante con OJT iniciado y un grupo abierto.',
  INVALID_OJT_METRIC: 'Revisa las horas, ventas, fecha y métricas. Calidad debe estar entre 0 y 100.',
  ATTENDANCE_WINDOW_LOCKED: 'La asistencia está bloqueada para esta fecha. Solicita un desbloqueo.',
  ATTENDANCE_UNLOCK_REASON_REQUIRED: 'Ingresa un motivo válido para solicitar el desbloqueo.',
  ATTENDANCE_UNLOCK_ALREADY_REQUESTED: 'Ya existe una solicitud de desbloqueo para esta fecha.',
  PARTICIPANT_NOT_READY_FOR_OJT: 'El participante aún no cumple los requisitos para iniciar OJT.',
  OJT_DAY_ALREADY_RECORDED: 'Ya existe un registro OJT para este participante y fecha.',
  EVALUATION_ALREADY_RECORDED: 'Esta evaluación ya fue registrada para el participante.',
  RECRUITER_NOT_AVAILABLE: 'El responsable seleccionado no está activo o no pertenece a la empresa.',
  CANDIDATE_NOT_ELIGIBLE: 'El candidato aún no cumple los requisitos para el alta.',
  CANDIDATE_ALREADY_IN_TRAINING: 'Uno o más postulantes ya pertenecen a una capacitación. La lista se actualizará; selecciona solo los disponibles.',
  CANDIDATE_NOT_READY_FOR_TRAINING: 'Uno o más postulantes ya no están aptos para capacitación. La lista se actualizará; revisa la selección.',
  DOCUMENTS_NOT_VALIDATED: 'Aún existen documentos obligatorios pendientes de validación.',
  CONTRACT_NOT_PENDING_SIGNATURE: 'El contrato no se encuentra pendiente de firma.',
  SUPABASE_API_NOT_CONFIGURED: 'El servicio Supabase no está configurado.',
  SUPABASE_MODULE_NOT_READY: 'Este módulo aún no tiene adaptador Supabase. No se consultará Firebase.',
  PASSWORD_CHANGE_REQUIRED: 'Debes cambiar la contraseña temporal antes de continuar.',
  PASSWORD_MIN_12: 'La nueva contraseña debe tener al menos 12 caracteres.',
  LAST_ADMIN_REQUIRED: 'Debes conservar al menos un administrador activo.',
  LAST_GLOBAL_ADMIN_REQUIRED: 'Debes conservar al menos un administrador global activo.',
  GLOBAL_ADMIN_ROLE_REQUIRED: 'Un administrador global debe conservar el rol ADMIN; no se permite degradarlo desde esta pantalla.',
  IDENTITY_SERVICE_NOT_CONFIGURED: 'El servicio privado de identidad está pendiente de configuración. Contacta al administrador.',
  DUPLICATE_RECORD: 'Ya existe un registro con esos datos.',
  CAPTURE_RETRY: 'Los datos cambiaron mientras guardabas. Actualiza e inténtalo nuevamente.',
  CV_NOT_FOUND: 'El candidato no tiene un CV disponible.',
};

export function getWorkerErrorMessage(error: unknown, fallback = 'No se pudo completar la operación.'): string {
  const raw = error instanceof Error ? error.message.trim() : '';
  if (WORKER_ERROR_MESSAGES[raw]) return WORKER_ERROR_MESSAGES[raw];
  // Los códigos internos son útiles para diagnóstico, pero no para el usuario final.
  if (!raw || /^[A-Z][A-Z0-9_]+$/.test(raw) || /^internal(?:\s|$)/i.test(raw)) return fallback;
  return raw;
}

export async function workerApi<T>(path: string, init: RequestInit = {}, companyId?: string): Promise<T> {
  const token = await authenticatedToken();
  let response: Response;
  try {
    response = await fetch(companyId ? `${baseUrl}${path}` : unifiedUrl(path), {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers, ...(companyId ? { 'X-Talent-Company': companyId } : {}) },
    });
  } catch {
    console.error(`[Worker API] ${init.method ?? 'GET'} ${path} network failure from ${window.location.origin}`);
    throw new WorkerApiError(0, 'WORKER_NETWORK_UNREACHABLE');
  }
  if (!response.ok) {
    const payload = await response.json().catch((): WorkerErrorPayload => ({}));
    const message = typeof payload.message === 'string' ? payload.message : 'WORKER_REQUEST_FAILED';
    // Solo se registra método, ruta, status y código seguro del Worker; nunca body ni credenciales.
    console.error(`[Worker API] ${init.method ?? 'GET'} ${path} failed (${response.status}): ${message}`);
    throw new WorkerApiError(response.status, message);
  }
  const payload = await response.json() as T;
  if (init.method && !['GET','HEAD'].includes(init.method.toUpperCase())) window.dispatchEvent(new Event('talent:data-changed'));
  return payload;
}

async function authenticatedToken(): Promise<string> {
  if (!baseUrl) throw new WorkerApiError(503,'SUPABASE_API_NOT_CONFIGURED');
  try { return await supabaseAccessToken(); } catch { throw new WorkerApiError(401,'UNAUTHENTICATED'); }
}

export async function workerUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = await authenticatedToken();
  let result: Response;
  try { result = await fetch(unifiedUrl(path), { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }); }
  catch { throw new WorkerApiError(0, 'WORKER_NETWORK_UNREACHABLE'); }
  if (!result.ok) {
    const payload = await result.json().catch((): WorkerErrorPayload => ({}));
    throw new WorkerApiError(result.status, typeof payload.message === 'string' ? payload.message : 'WORKER_REQUEST_FAILED');
  }
  const payload = await result.json() as T;
  window.dispatchEvent(new Event('talent:data-changed'));
  return payload;
}

export async function workerDownload(path: string): Promise<Blob> {
  const token = await authenticatedToken();
  let result: Response;
  try { result = await fetch(unifiedUrl(path), { headers: { Authorization: `Bearer ${token}` } }); }
  catch { throw new WorkerApiError(0, 'WORKER_NETWORK_UNREACHABLE'); }
  if (!result.ok) {
    const payload = await result.json().catch((): WorkerErrorPayload => ({}));
    throw new WorkerApiError(result.status, typeof payload.message === 'string' ? payload.message : 'WORKER_REQUEST_FAILED');
  }
  return result.blob();
}
