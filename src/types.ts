import type { CandidatePreferences } from '../shared/candidatePreferences';

export type UserRole = 
  | 'ADMIN'
  | 'JEFE_SELECCION' 
  | 'ANALISTA_SELECCION' 
  | 'RECLUTADOR'
  | 'JEFE_FORMACION'
  | 'COORDINADOR_FORMACION'
  | 'FORMADOR'
  | 'JEFE_TALENTO'
  | 'ANALISTA_TALENTO'
  | 'JEFE_OPERACIONES'
  | 'COORDINADOR_OPERACIONES';

export type AppModuleName = 
  | 'SELECCION'
  | 'FORMACION'
  | 'TALENTO'
  | 'ANALITICA'
  | 'ADMINISTRACION'
  | 'OPERACIONES';

export interface CompanyAccess {
  companyId: string; role: UserRole; enabled: boolean; allCampaigns: boolean; scopes: string[]; version: number | null;
}
export interface UserProfile {
  companyProfiles?: {companyId:string;role:UserRole;allowedModules:AppModuleName[]}[];
  id: string;
  companyId?: string;
  companies?: {id:string;name:string;managed:boolean}[];
  globalAdmin?: boolean;
  managedCompany?: boolean;
  companyCampaigns?: string[];
  authUserId?: string;
  companyAccess?: CompanyAccess[];
  name: string;
  role: UserRole;
  email: string;
  avatarUrl: string;
  nickname?: string;
  tagline?: string;
  jobTitle?: string;
  phone?: string;
  dni?: string;
  status?: 'ACTIVO' | 'INACTIVO';
  allowedModules?: AppModuleName[];
  scopeCampaignIds?: string[];
  subordinateUserIds?: string[];
  createdAt?: string;
}

export type AppStage = 
  | 'SELECCION' 
  | 'CAPACITACION' 
  | 'OJT' 
  | 'APTO_ALTA' 
  | 'GESTION_TALENTO' 
  | 'CONTRATADO' 
  | 'DESCARTADO' 
  | 'BAJA';

export type SelectionStage = 
  | 'NUEVO'
  | 'CONTACTADO'
  | 'ENTREVISTA'
  | 'VERIFICACION_TECNICA'
  | 'EVALUACIONES'
  | 'NO_APTO'
  | 'APTO_CAPACITACION'
  | 'SCREENING_TELEFONICO' // compat
  | 'EVALUACION_PSICOTECNICA' // compat
  | 'ENTREVISTA_INDIVIDUAL' // compat
  | 'ROLEPLAY_SIMULACION' // compat
  | 'DESCARTADO';

export type SelectionPipelineStage = 
  | 'NUEVO'
  | 'CONTACTADO'
  | 'ENTREVISTA'
  | 'VERIFICACION_TECNICA'
  | 'EVALUACIONES'
  | 'APTO_CAPACITACION';

export type ConvocatoriaStatus = 'EN_PROCESO' | 'PUBLICADO' | 'CERRADO' | 'ANULADO' | 'ACTIVA' | 'EN_PAUSA';

export type ProcessType = 'EXTERNO' | 'INTERNO' | 'MIXTO';

export type ManagementType = 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';

export type LeadSourceType = 
  | 'Facebook Gratis' 
  | 'Mantra' 
  | 'Referidos' 
  | 'Grupo WhatsApp' 
  | 'Reingreso' 
  | 'Indeed' 
  | 'Otro'
  | 'COMPUTRABAJO'
  | 'LINKEDIN'
  | 'BOLSA_EMPLEO';

export type TrainingStatus = 
  | 'NO_ASIGNADO'
  | 'PENDIENTE_INICIO'
  | 'EN_CURSO'
  | 'APROBADO_OJT'
  | 'BAJA_CAPACITACION'
  | 'EN_CAPACITACION'
  | 'PENDIENTE_OJT'
  | 'EN_OJT'
  | 'APTO_ALTA'
  | 'NO_APTO'
  | 'DESERTO'
  | 'PENDIENTE'
  | 'REPROGRAMADO'
  | 'REASIGNADO'
  | 'NSP';

export type TrainingCohortStatus = 
  | 'PENDIENTE_ASIGNACION'
  | 'PROGRAMADA'
  | 'EN_CAPACITACION'
  | 'PENDIENTE_OJT'
  | 'EN_OJT'
  | 'EXTENSION_OJT'
  | 'FINALIZADA'
  | 'CANCELADA';

export type ParticipantTrainingStatus = 
  | 'OJT_APROBADO'
  | 'OJT_NO_APROBADO'
  | 'PENDIENTE_INICIO'
  | 'EN_CAPACITACION'
  | 'PENDIENTE_OJT'
  | 'EN_OJT'
  | 'APTO_ALTA'
  | 'NO_APTO'
  | 'DESERTO'
  | 'PENDIENTE'
  | 'REPROGRAMADO'
  | 'REASIGNADO'
  | 'NSP';

export type DropoutCategory = 
  | 'PERSONAL'
  | 'LABORAL'
  | 'EXPECTATIVAS_PUESTO'
  | 'DIFICULTAD_CAPACITACION'
  | 'INASISTENCIA'
  | 'CONECTIVIDAD_EQUIPOS'
  | 'OTRO';

export type DropoutStage = 'CAPACITACION_TEORICA' | 'OJT';

export interface DropoutRecord {
  id?: string;
  date: string;
  stage: DropoutStage;
  category: DropoutCategory;
  categoryLabel?: string;
  observation: string;
  user: string;
}

export type TrainingAttendanceStatus = 'PRESENTE' | 'TARDANZA' | 'FALTA' | 'JUSTIFICADO' | 'NSP';

export type OjtStatus = 
  | 'NO_INICIADO'
  | 'EN_PROCESO'
  | 'EN_PISO'
  | 'APTO_ALTA'
  | 'EXTENSION'
  | 'NO_APTO'
  | 'ABANDONO'
  | 'BAJA_DESERCION'
  | 'EN_OJT'
  | 'OJT_APROBADO'
  | 'OJT_NO_APROBADO'
  | 'DESERTO'
  | 'NSP'
  | 'REPROGRAMADO';
  

export type HiringStatus = 
  | 'PENDIENTE_CONTRATACION'
  | 'EN_REVISION'
  | 'NO_APTO'
  | 'PENDIENTE_EXPEDIENTE'
  | 'DOCUMENTOS_EN_REVISION'
  | 'CONTRATO_GENERADO'
  | 'PENDIENTE_FIRMA'
  | 'CONTRATADO'
  | 'CANCELADO'
  | 'REPROGRAMADO'
  | 'RECHAZADO';

export type AttendanceStatus = 'PRESENTE' | 'TARDANZA' | 'FALTA' | 'JUSTIFICADO' | 'NSP' | 'FALTA_JUSTIFICADA' | 'FALTA_INJUSTIFICADA';

export interface TrainingCustomEvaluation {
  id: string;
  name: string;
  date: string;
  maxScore: number;
  minScore: number;
}

export type ExpedientStatus = 'INCOMPLETO' | 'PENDIENTE_VALIDACION' | 'OBSERVADO' | 'COMPLETO';

export interface SalaryAccountDetails {
  hasAccount: boolean; // true = Ya tiene cuenta activa, false = Solicitar apertura
  bank?: 'BCP' | 'BBVA' | 'INTERBANK' | 'SCOTIABANK' | 'BANCO_NACION' | 'BANBIF' | 'PICHINCHA' | 'OTRO';
  bankOtherName?: string;
  accountNumber?: string;
  cci?: string;
  currency?: 'PEN' | 'USD';
  requestOpening?: boolean;
  openingRequestDate?: string;
  openingStatus?: 'SOLICITADO' | 'EN_TRAMITE' | 'APERTURADO' | 'OBSERVADO';
  notes?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface CandidateEligibility {
  eligible: boolean;
  trainingApproved: boolean;
  ojtApproved: boolean;
  documentsComplete: boolean;
  salaryAccountComplete: boolean;
  documentProgress: number;
  pending: string[];
}

export interface SystemSettings {
  companyName: string;
  minPassGrade: number;
  minAttendancePct: number;
  slaSelectionDays: number;
  ojtDurationDays: number;
}

export interface DocumentItem {
  id: string;
  name: string;
  type: 'CV' | 'DNI_FRONT' | 'DNI_BACK' | 'DNI' | 'CERTIFICADO_ESTUDIOS' | 'ANTECEDENTES' | 'CUL_ANTECEDENTES' | 'CERTIFICADO_MEDICO' | 'CONTRATO_FIRMADO' | 'CUENTA_BANCARIA' | 'RECIBO_SERVICIOS' | 'DECLARACION_JURADA' | 'OTROS' | 'OTRO';
  status: 'PENDIENTE' | 'CARGADO' | 'VALIDADO' | 'OBSERVADO' | 'RECHAZADO';
  uploadDate: string;
  fileSize?: string;
  validatedBy?: string;
  validatedAt?: string;
  observationReason?: string;
  observedBy?: string;
  observedAt?: string;
  notes?: string;
  fileUrl?: string;
  isMandatory?: boolean;
}

export type ContactType = 'LLAMADA' | 'WHATSAPP' | 'CORREO' | 'EMAIL' | 'ENTREVISTA' | 'PRESENCIAL';

export type ContactOutcome = 'CONTESTO' | 'NO_CONTESTO' | 'CITA_AGENDADA' | 'RECHAZA_OFERTA' | 'ASISTIO' | 'BUZON';

export interface ContactHistoryItem {
  id: string;
  date: string;
  time: string;
  type: ContactType;
  summary: string;
  agentName: string;
  outcome: ContactOutcome;
  nextStep?: string;
  nextStepDate?: string;
}

export interface EvaluationItem {
  name?: string;
  result?: 'APTO' | 'NO_APTO' | 'PENDIENTE';
  observations?: string;
  id: string;
  title: string;
  evaluator: string;
  date: string;
  score: number;
  maxScore: number;
  comments: string;
  passed: boolean;
}

export interface ObservationItem {
  id: string;
  date: string;
  author: string;
  role: string;
  text: string;
  tag: 'DESTACADO' | 'ALERTA' | 'GENERAL' | 'COACHING';
}

export interface TraceabilityItem {
  id?: string;
  date: string;
  time: string;
  user: string;
  action?: string;
  details?: string;
  previousStage: string;
  newStage: string;
  observation: string;
}

export interface InterviewRecord {
  status: 'APTO' | 'NO_APTO';
  reason?: string;
  notes: string;
  date: string;
  evaluator?: string;
  interviewer?: string;
  dictionScore?: number;
  fluencyScore?: number;
  experienceScore?: number;
  ratings?: {
    fluidezVerbal?: number;
    diccion?: number;
    perfilComercial?: number;
  };
}

export interface TechnicalVerificationRecord {
  status: 'APRUEBA' | 'NO_APRUEBA' | 'APRUEBA_CON_OBSERVACION';
  notes: string;
  observationDetail?: string;
  internetSpeedMbps?: number;
  downloadSpeedMbps?: number;
  uploadSpeedMbps?: number;
  latencyMs?: number;
  ramGb?: number;
  processor?: string;
  headset?: boolean;
  hasNoiseCancellingHeadset?: boolean;
  windowsVersion?: string;
  operatingSystem?: string;
  quietEnvironment?: boolean;
  date: string;
  evaluator?: string;
  verifiedBy?: string;
}

export interface RejectionRecord {
  stage: 'Entrevista' | 'Verificación técnica' | 'Evaluaciones' | 'Otros';
  reason: string;
  detail?: string;
  date: string;
  user: string;
}

export interface DailyAttendance {
  date: string;
  dayNumber: number;
  status: AttendanceStatus;
  notes?: string;
}

export interface TrainingEvaluation {
  id: string;
  moduleName: string;
  dayNumber: number;
  date: string;
  score: number;
  maxScore?: number;
  minRequired: number;
  feedback: string;
  evaluator: string;
}

export interface OjtDailyMetric {
  date: string;
  dayNumber: number;
  attendance?: TrainingAttendanceStatus;
  hoursWorked?: number;
  sales?: number;
  sph?: number; // Ventas / Hora
  spd?: number; // Ventas / Día
  calls?: number;
  ahtSeconds?: number; // TMO en segundos
  leads?: number;
  conversions?: number; // ventas o cierres
  conversionRate?: number; // porcentaje
  qaScore?: number; // calidad %
  observations?: string;
  coachFeedback?: string;
}

export interface OjtSkillsMatrix {
  manejoObjeciones: number; // 1 a 5
  diccionModulacion: number; // 1 a 5
  velocidadSistemas: number; // 1 a 5
  empatiaEscucha: number; // 1 a 5
  tecnicaCierre: number; // 1 a 5
  cumplimientoProcesos: number; // 1 a 5
}

export interface OjtFeedback {
  id: string;
  date: string;
  coach: string;
  strongPoints: string;
  improvementPoints: string;
  actionPlan: string;
  commitmentDate: string;
  participantSigned: boolean;
}

export interface LaborData {
  contractType: 'PLAZO_FIJO_3_MESES' | 'PLAZO_FIJO_6_MESES' | 'INDETERMINADO' | 'FORMACION_PRACTICAS' | 'PART_TIME';
  baseSalary: number;
  variableBonus: number;
  shift: 'MANANA_08_17' | 'TARDE_13_22' | 'TARDE_14_23' | 'NOCHE_22_07' | 'ROTATIVO_45H' | 'ROTATIVO_48H' | 'PART_TIME_30H';
  assignedSupervisor: string;
  workLocation: 'SEDE_CENTRAL_LIMA' | 'SEDE_SUR_MIRAFLORES' | 'SEDE_NORTE_INDEPENDENCIA' | 'HOME_OFFICE_REMOTO';
  officialStartDate: string;
  assignedSeatOrExtension?: string;
  healthInsurance?: 'ESSALUD' | 'EPS_RIMAC' | 'EPS_PACIFICO';
  company?: string;
  position?: string;
  campaignOrArea?: string;
  plannedStartDate?: string;
  modality?: 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';
  site?: string;
  remuneration?: number;
}

export interface ContractDetails {
  contractNumber: string;
  generatedDate: string;
  signedDate?: string;
  signatureStatus: 'PENDIENTE' | 'ENVIADO_DOCUSIGN' | 'FIRMADO_DIGITAL' | 'FIRMADO_FISICO';
  contractFileUrl?: string;
  contractVersion: string;
}

export interface ConvocatoriaResponsible {
  userId: string;
  userName: string;
  userRole: UserRole;
  target: number; // Meta individual
  hiredCount: number; // Ingresos logrados
  isDirectResponsible?: boolean; // Para staff gestionado por analista
}

export interface ConvocatoriaSource {
  sourceName: LeadSourceType;
  isEnabled: boolean;
  link: string;
  leadsCount: number;
}

export interface ConvocatoriaStatusChange {
  date: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  reason?: string;
}

export interface CampaignCall {
  sourceRqId?: string;
  companyId?: string;
  companyName?: string;
  companyCampaignId?: string;
  id: string;
  code: string;
  company: string; // Empresa
  title: string; // Puesto / Campaña
  client?: string; // alias compatible
  area: string; // Área
  serviceType?: 'VENTAS_OUTBOUND' | 'VENTAS_INBOUND' | 'ATENCION_CLIENTE' | 'SOPORTE_TECNICO' | 'RETENCIONES' | 'COBRANZAS' | 'STAFF_ADMIN';
  
  // Remuneración y condiciones
  salaryBase: number; // Sueldo
  variableBonus: number; // Bono variable
  adminBonus: number; // Bono administrativo
  mobilityBonus: number; // Bono movilidad
  additionalConditions?: string; // Condiciones adicionales

  // Operativa y dotación
  requestDate: string; // Fecha de solicitud
  startDate?: string;
  endDate?: string;
  processType: ProcessType; // Externo / Interno / Mixto
  managementType: ManagementType; // Presencial / Remoto / Híbrido
  vacancies: number; // Cantidad requerida (RQ)
  positionsCovered: number; // Posiciones cubiertas / Ingresos
  positionsPending: number; // Pendientes
  
  location: string; // Sede
  shift: string; // Horario
  observations?: string; // Observaciones
  
  status: ConvocatoriaStatus;
  
  // Asignación de Responsables y Metas
  assignedAnalystId?: string;
  assignedAnalystName?: string;
  responsibles: ConvocatoriaResponsible[];
  allowOverTargetQuota?: boolean; // Autorización de sobreasignación por Jefe

  // Gestión de fuentes y links de postulación
  sources: ConvocatoriaSource[];

  // Historial de cambios de estado
  statusHistory: ConvocatoriaStatusChange[];

  // Compatibilidad
  applicantsCount?: number;
  inTrainingCount?: number;
  inOjtCount?: number;
  hiredCount?: number;
  requirements?: string[];
  stagesConfig?: string[];
}

export interface CandidateRecord extends CandidatePreferences {
  companyId?: string;
  id: string; // Único en todo el ciclo de vida
  captureOnly?: boolean; // Registrado por captación, pendiente de vincular a convocatoria
  dni: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  city: string; // Distrito / Ciudad
  district?: string;
  address?: string; // Dirección completa del postulante
  birthDate: string;
  age: number;
  experienceMonths: number;
  englishLevel: 'NINGUNO' | 'BASICO' | 'INTERMEDIO' | 'AVANZADO';
  avatarUrl: string;
  source: LeadSourceType;
  sourceDetails?: string;
  salaryAccount?: SalaryAccountDetails; // Cuenta sueldo única del expediente
  documents?: DocumentItem[]; // Expediente documental centralizado
  
  // Campaña y Convocatoria
  campaignId: string;
  campaignCode?: string;
  campaignName: string;
  jobProfile: string;
  recruiterId: string;
  recruiterName: string;
  analystId?: string;
  analystName?: string;
  applicationDate: string;
  cvUrl?: string;
  observationsGeneral?: string;

  // Estado unificado actual
  currentStage: AppStage;
  currentProcess?: 'SELECCION' | 'FORMACION' | 'GESTION_TALENTO' | 'CONTRATADO';
  trainingId?: string;

  // 1. Módulo Selección
  selection: {
    callId: string;
    stage: SelectionStage;
    status: 'ACTIVO' | 'NO_APTO' | 'DESCARTADO' | 'APTO_CAPACITACION';
    scores: {
      psicometrico: number; // 0-100
      vozDiccion: number; // 0-100
      tipificacionWPM: number; // palabras por minuto
      simulacionRoleplay: number; // 0-100
      overall: number; // 0-100
    };
    interviewResult?: InterviewRecord;
    technicalVerification?: TechnicalVerificationRecord;
    evaluationsList?: EvaluationItem[];
    contactHistory: ContactHistoryItem[];
    evaluations: EvaluationItem[];
    documents: DocumentItem[];
    observations: ObservationItem[];
    traceability: TraceabilityItem[];
    rejectionReason?: RejectionRecord;
    discardReason?: string;
    discardDate?: string;
    readyForTrainingDate?: string;

    // Integración downstream
    attendedDay1?: boolean;
    trainingPassed?: boolean;
    hiringConfirmed?: boolean;
  };

  // 2. Módulo Formación
  training: {
    injection?: {date:string;at:string;userId:string;userName:string};
    cohortId?: string;
    cohortName?: string;
    cohortCode?: string;
    trainerName?: string;
    coordinatorName?: string;
    startDate?: string;
    endDate?: string;
    ojtStartDate?: string;
    ojtEndDate?: string;
    status: ParticipantTrainingStatus | TrainingStatus;
    statusObservation?: string;
    attendance: DailyAttendance[];
    evaluations: TrainingEvaluation[];
    finalGrade?: number;
    theoryCompletedAt?: string;
    dropoutRecord?: DropoutRecord;
    dropoutReason?: string;
    dropoutDate?: string;
    promotedToOjtDate?: string;
    // Conserva los mismos estados que se pueden registrar durante la formación.
    // Algunos flujos heredados persisten APROBADO_OJT como resultado final.
    finalResult?: TrainingStatus;
    finalResultDate?: string;
    finalResultValidatedBy?: string;
  };

  // 3. Módulo OJT
  ojt: {
    coachName?: string;
    startDate?: string;
    targetEndDate?: string;
    status: OjtStatus;
    totalSales?: number;
    averageSph?: number;
    averageSpd?: number;
    dailyMetrics: OjtDailyMetric[];
    skillsMatrix: OjtSkillsMatrix;
    coachingFeedbacks: OjtFeedback[];
    extensionDays?: number;
    extensionReason?: string;
    readyForHiringDate?: string;
    notFitReason?: string;
  };

  // 4. Módulo Gestión de Talento
  hiring: {
    status: HiringStatus;
    receivedFromOjtDate?: string;
    documentsValidated: boolean;
    laborData: LaborData;
    contract: ContractDetails;
    hiredDate?: string;
    employeeCode?: string;
    welcomeEmailSent: boolean;
  };
}

export interface TrainingCohort {
  id: string;
  code: string;
  name: string;
  
  // Origen Selección
  campaignId: string;
  companyId?: string;
  participantIds?: string[];
  campaignName: string;
  company?: string;
  convocatoriaId?: string;
  convocatoriaCode?: string;
  
  // Responsables
  coordinatorId?: string;
  coordinatorName?: string;
  trainerId?: string;
  trainerName: string;
  trainerEmail?: string;
  trainerAssignedAt?: string;
  trainerAssignedBy?: string;
  
  // Fechas y Horarios
  startDate: string;
  endDate: string;
  ojtStartDate?: string;
  ojtEndDate?: string;
  totalDays: number;
  ojtTotalDays?: number;
  ojtExtensionDays?: number;
  schedule: string;
  modality: 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO' | 'VIRTUAL';
  location?: string;
  roomOrLink?: string;
  observations?: string;
  
  // Configuración de Evaluaciones
  evaluationsConfig?: TrainingCustomEvaluation[];
  
  // Conteos
  maxCapacity?: number;
  enrolledCount: number;
  activeCount: number;
  passedCount: number;
  dropoutCount: number;
  passingMinGrade?: number;
  product?: string;
  
  // Estado
  status: TrainingCohortStatus;
  progressPercent?: number;
}

export type ActiveNavModule = 
  | 'OPERACIONES_ADMIN'
  | 'SELECCION_VOICEBOT'
  | 'SELECCION_PROPUESTAS'
  | 'SELECCION_RQ'
  | 'SELECCION_CAPTACION'
  | 'INICIO'
  | 'SELECCION_DASHBOARD'
  | 'CONVOCATORIAS'
  | 'SELECCION_CONVOCATORIAS'
  | 'MIS_CONVOCATORIAS'
  | 'SELECCION_MIS_CONVOCATORIAS'
  | 'CANDIDATOS'
  | 'SELECCION_CANDIDATOS'
  | 'FORMACION_DASHBOARD'
  | 'FORMACION_CAPACITACIONES'
  | 'FORMACION_MIS_CAPACITACIONES'
  | 'FORMACION_PARTICIPANTES'
  | 'FORMACION_OJT'
  | 'FORMACION_ENCUESTAS'
  | 'TALENTO_CONTRATACIONES'
  | 'ANALITICA'
  | 'CONFIGURACION'
  | 'ADMIN_USUARIOS';
