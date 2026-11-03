import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  CandidateRecord, 
  CampaignCall, 
  TrainingCohort, 
  ActiveNavModule, 
  SelectionStage, 
  AttendanceStatus, 
  TrainingEvaluation, 
  OjtStatus, 
  OjtDailyMetric, 
  OjtSkillsMatrix, 
  OjtFeedback, 
  LaborData, 
  ContactHistoryItem, 
  EvaluationItem, 
  ObservationItem, 
  DocumentItem,
  InterviewRecord,
  TechnicalVerificationRecord,
  ConvocatoriaStatus,
  ConvocatoriaResponsible,
  LeadSourceType,
  UserProfile,
  TraceabilityItem,
  TrainingCohortStatus,
  ParticipantTrainingStatus,
  DropoutCategory,
  DropoutStage,
  TrainingAttendanceStatus,
  SalaryAccountDetails,
  ExpedientStatus,
  CandidateEligibility,
  HiringStatus,
  SystemSettings,
} from '../types';
import { supabase, signInSupabase, signOutSupabase, isSupabaseConfigured } from '../services/supabase';
import { workerApi, workerDownload, workerUpload } from '../services/workerApi';
import { normalizeAvatarUrl, sanitizeDisplayName } from '../utils/identity';

const defaultModulesForRole: Record<UserProfile['role'], UserProfile['allowedModules']> = {
  ADMIN: ['SELECCION', 'FORMACION', 'TALENTO', 'ANALITICA', 'ADMINISTRACION', 'OPERACIONES'], JEFE_SELECCION: ['SELECCION', 'ANALITICA'], ANALISTA_SELECCION: ['SELECCION'], RECLUTADOR: ['SELECCION'], JEFE_FORMACION: ['FORMACION', 'ANALITICA'], COORDINADOR_FORMACION: ['FORMACION'], FORMADOR: ['FORMACION'], JEFE_TALENTO: ['TALENTO', 'ANALITICA'], ANALISTA_TALENTO: ['TALENTO'], JEFE_OPERACIONES: ['OPERACIONES'], COORDINADOR_OPERACIONES: ['OPERACIONES'],
};
const emptyUser: UserProfile = { id: '', email: '', name: '', role: 'RECLUTADOR', avatarUrl: '', status: 'INACTIVO', allowedModules: [], scopeCampaignIds: [], subordinateUserIds: [] };
const normalizeUserIdentity = (user: UserProfile): UserProfile => ({
  ...user,
  name: sanitizeDisplayName(user.name),
  nickname: user.nickname ? sanitizeDisplayName(user.nickname, '') : undefined,
  tagline: user.tagline ? sanitizeDisplayName(user.tagline, '') : undefined,
  avatarUrl: normalizeAvatarUrl(user.avatarUrl),
});
const profileFromFirestore = (id: string, data: Record<string, unknown>): UserProfile => ({
  id, companyId: typeof data.companyId === 'string' ? data.companyId : undefined, email: typeof data.username === 'string' ? data.username : '', name: sanitizeDisplayName(typeof data.displayName === 'string' ? data.displayName : (typeof data.name === 'string' ? data.name : 'Usuario')), nickname: typeof data.nickname === 'string' ? sanitizeDisplayName(data.nickname, '') : undefined, tagline: typeof data.tagline === 'string' ? sanitizeDisplayName(data.tagline, '') : undefined, dni: typeof data.dni === 'string' ? data.dni : undefined, role: data.role as UserProfile['role'], avatarUrl: normalizeAvatarUrl(typeof data.avatarUrl === 'string' ? data.avatarUrl : ''), status: data.status === 'INACTIVO' || data.enabled === false ? 'INACTIVO' : 'ACTIVO', jobTitle: typeof data.jobTitle === 'string' ? data.jobTitle : undefined, allowedModules: Array.isArray(data.module) ? data.module as UserProfile['allowedModules'] : (Array.isArray(data.allowedModules) ? data.allowedModules as UserProfile['allowedModules'] : defaultModulesForRole[data.role as UserProfile['role']]), scopeCampaignIds: Array.isArray(data.scope) ? data.scope as string[] : (Array.isArray(data.scopeCampaignIds) ? data.scopeCampaignIds as string[] : []), subordinateUserIds: Array.isArray(data.subordinateUserIds) ? data.subordinateUserIds as string[] : [],
});
const campaignFromFirestore = (id: string, data: Record<string, unknown>): CampaignCall => {
  const campaign = { id, ...data } as CampaignCall;
  return {
    ...campaign,
    assignedAnalystName: campaign.assignedAnalystName ? sanitizeDisplayName(campaign.assignedAnalystName, '') : campaign.assignedAnalystName,
    responsibles: (campaign.responsibles || []).map(responsible => ({
      ...responsible,
      userName: sanitizeDisplayName(responsible.userName),
    })),
    statusHistory: (campaign.statusHistory || []).map(change => ({
      ...change,
      changedBy: sanitizeDisplayName(change.changedBy),
    })),
  };
};
const trainingFromFirestore = (id: string, data: Record<string, unknown>): TrainingCohort => {
  const cohort = { id, ...data } as TrainingCohort;
  return {
    ...cohort,
    coordinatorName: cohort.coordinatorName ? sanitizeDisplayName(cohort.coordinatorName, '') : cohort.coordinatorName,
    trainerName: cohort.trainerName ? sanitizeDisplayName(cohort.trainerName, '') : cohort.trainerName,
    trainerAssignedBy: cohort.trainerAssignedBy ? sanitizeDisplayName(cohort.trainerAssignedBy, '') : cohort.trainerAssignedBy,
  };
};
const candidateFromFirestore = (id: string, data: Record<string, unknown>): CandidateRecord => {
  const candidate = { id, ...data } as CandidateRecord;
  const firstName = candidate.firstName ? sanitizeDisplayName(candidate.firstName, '') : '';
  const lastName = candidate.lastName ? sanitizeDisplayName(candidate.lastName, '') : '';
  const combinedName = [firstName, lastName].filter(Boolean).join(' ');

  return {
    ...candidate,
    dni: typeof candidate.dni === 'string' ? candidate.dni : '',
    phone: typeof candidate.phone === 'string' ? candidate.phone : '',
    email: typeof candidate.email === 'string' ? candidate.email : '',
    firstName: firstName || candidate.firstName,
    lastName: lastName || candidate.lastName,
    fullName: sanitizeDisplayName(candidate.fullName || combinedName, 'Nombre no registrado'),
    avatarUrl: normalizeAvatarUrl(candidate.avatarUrl),
    recruiterName: candidate.recruiterName ? sanitizeDisplayName(candidate.recruiterName, '') : candidate.recruiterName,
    analystName: candidate.analystName ? sanitizeDisplayName(candidate.analystName, '') : candidate.analystName,
    selection: candidate.selection ? {
      ...candidate.selection,
      observations: (candidate.selection.observations || []).map(item => ({ ...item, author: sanitizeDisplayName(item.author) })),
      traceability: (candidate.selection.traceability || []).map(item => ({ ...item, user: sanitizeDisplayName(item.user) })),
      interviewResult: candidate.selection.interviewResult ? {
        ...candidate.selection.interviewResult,
        evaluator: candidate.selection.interviewResult.evaluator ? sanitizeDisplayName(candidate.selection.interviewResult.evaluator, '') : candidate.selection.interviewResult.evaluator,
        interviewer: candidate.selection.interviewResult.interviewer ? sanitizeDisplayName(candidate.selection.interviewResult.interviewer, '') : candidate.selection.interviewResult.interviewer,
      } : candidate.selection.interviewResult,
    } : candidate.selection,
    training: candidate.training ? {
      ...candidate.training,
      trainerName: candidate.training.trainerName ? sanitizeDisplayName(candidate.training.trainerName, '') : candidate.training.trainerName,
      coordinatorName: candidate.training.coordinatorName ? sanitizeDisplayName(candidate.training.coordinatorName, '') : candidate.training.coordinatorName,
    } : candidate.training,
  };
};

interface TalentContextType {
  // Current logged in user & role
  currentUser: UserProfile;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  connectionError: string;
  changeInitialPassword: (password: string) => Promise<void>;
  login: (username: string, password: string, remember?: boolean) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  availableUsers: UserProfile[];
  users: UserProfile[];
  addUser: (userData: Omit<UserProfile, 'id'> & { password: string }) => Promise<UserProfile>;
  updateUser: (userId: string, data: Partial<UserProfile>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  toggleUserStatus: (userId: string) => Promise<void>;
  resetUserPassword: (userId: string, newPassword: string) => Promise<void>;
  getSystemSettings: () => Promise<SystemSettings>;
  updateSystemSettings: (settings: SystemSettings) => Promise<SystemSettings>;

  // Data collections
  candidates: CandidateRecord[];
  campaigns: CampaignCall[];
  cohorts: TrainingCohort[];
  
  // Scoped collections based on active user role & scope
  scopedCampaigns: CampaignCall[];
  scopedCandidates: CandidateRecord[];
  myAssignedCampaigns: CampaignCall[]; // Mis convocatorias
  scopedCohorts: TrainingCohort[];
  myAssignedCohorts: TrainingCohort[]; // Mis capacitaciones

  // Navigation & selection states
  activeModule: ActiveNavModule;
  selectedCandidateId: string | null;
  selectedCampaignId: string | null;
  selectedCohortId: string | null;
  searchQuery: string;
  
  // Navigation actions
  setActiveModule: (mod: ActiveNavModule) => void;
  openCandidate360: (id: string) => void;
  closeCandidate360: () => void;
  setSelectedCampaignId: (id: string | null) => void;
  setSelectedCohortId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;

  // Candidate Selection operations
  addCandidate: (data: Partial<CandidateRecord>) => Promise<{ success: boolean; message?: string; candidate?: CandidateRecord }>;
  checkDuplicateCandidate: (dni: string, phone: string, excludeId?: string, companyId?:string) => { isDuplicate: boolean; matchedCandidate?: CandidateRecord; reason?: string };
  updateCandidateSelectionStage: (candidateId: string, stage: SelectionStage, discardReason?: string, discardDetail?: string, observation?: string) => Promise<void>;
  updateInterviewResult: (candidateId: string, interview: InterviewRecord) => Promise<void>;
  updateTechnicalVerification: (candidateId: string, techVerif: TechnicalVerificationRecord) => Promise<void>;
  addCandidateEvaluationRecord: (candidateId: string, evalItem: Omit<EvaluationItem, 'id'>) => Promise<void>;
  addCandidateContactHistory: (candidateId: string, item: Omit<ContactHistoryItem, 'id'>) => Promise<void>;
  addCandidateObservation: (candidateId: string, item: Omit<ObservationItem, 'id'>) => Promise<void>;
  updateCandidatePersonalData: (candidateId: string, data: Partial<CandidateRecord>) => Promise<void>;
  updateCandidateSalaryAccount: (candidateId: string, salaryData: SalaryAccountDetails) => Promise<void>;
  updateDocumentStatus: (candidateId: string, docId: string, status: 'PENDIENTE' | 'CARGADO' | 'VALIDADO' | 'OBSERVADO', notes?: string) => Promise<void>;
  addCandidateDocument: (candidateId: string, doc: Omit<DocumentItem, 'id'>, file: File) => Promise<void>;
  listCandidateDocuments: (candidateId: string) => Promise<DocumentItem[]>;
  replaceCandidateDocument: (candidateId: string, documentId: string, file: File) => Promise<void>;
  downloadCandidateDocument: (candidateId: string, documentId: string, fileName: string) => Promise<void>;
  markCandidateAptoCapacitacion: (candidateId: string, notes?: string) => Promise<void>;
  approveParticipantToTalentAlta: (candidateId: string, notes?: string) => Promise<boolean>;
  getCandidateEligibility: (candidateId: string) => Promise<CandidateEligibility>;
  logBlockedAltaAttempt: (candidateId: string, reasons: string[]) => Promise<void>;
  
  // Convocatorias operations
  createConvocatoria: (camp: Partial<CampaignCall>) => Promise<CampaignCall>;
  updateConvocatoria: (campId: string, data: Partial<CampaignCall>) => Promise<void>;
  updateConvocatoriaStatus: (campId: string, newStatus: ConvocatoriaStatus, reason?: string) => Promise<void>;
  updateConvocatoriaResponsibles: (campId: string, responsibles: ConvocatoriaResponsible[], allowOverTarget?: boolean) => Promise<void>;
  toggleConvocatoriaSource: (campId: string, sourceName: LeadSourceType, isEnabled: boolean) => Promise<void>;

  // Formación & Capacitaciones Operations
  createTrainingFromSelection: (params: {
    name: string;
    code: string;
    campaignId: string;
    candidateIds: string[];
    startDate: string;
    schedule: string;
    modality: 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';
    location?: string;
    roomOrLink?: string;
    ojtStartDate?: string;
    ojtEndDate?: string;
    observations?: string;
    passingMinGrade?: number;
    totalDays?: number;
  }) => Promise<TrainingCohort>;
  assignCoordinatorToCohort: (cohortId: string, coordinatorId: string, coordinatorName: string, notes?: string) => Promise<void>;
  listAvailableTrainers: (cohortId: string) => Promise<UserProfile[]>;
  assignTrainerToCohort: (cohortId: string, trainerId: string, trainerName: string, notes?: string) => Promise<void>;
  updateCohortStatus: (cohortId: string, newStatus: TrainingCohortStatus, reason?: string) => Promise<void>;
  updateCohortDetails: (cohortId: string, data: Partial<TrainingCohort>) => Promise<void>;
  addCustomEvaluationToCohort: (cohortId: string, evalConfig: { name: string; date: string; maxScore: number; minScore: number }) => Promise<void>;
  recordParticipantAttendance: (candidateId: string, dayNumber: number, date: string, status: AttendanceStatus, notes?: string) => Promise<void>;
  recordBulkAttendance: (cohortId: string, dayNumber: number, date: string, status: AttendanceStatus) => Promise<void>;
  getAttendanceWindow: (cohortId: string, date: string) => Promise<AttendanceWindowInfo>;
  requestAttendanceUnlock: (cohortId: string, date: string, reason: string) => Promise<AttendanceUnlockRequest>;
  decideAttendanceUnlock: (cohortId: string, date: string, decision: 'APROBADA' | 'RECHAZADA', reason?: string) => Promise<AttendanceUnlockRequest>;
  recordParticipantEvaluationGrade: (candidateId: string, evalId: string, moduleName: string, score: number, maxScore: number, minRequired: number, feedback?: string) => Promise<void>;
  registerStructuredDropout: (candidateId: string, data: { stage: DropoutStage; category: DropoutCategory; observation: string }) => Promise<void>;
  updateParticipantTrainingStatus: (candidateId: string, newStatus: ParticipantTrainingStatus, observation?: string) => Promise<void>;
  recordOjtDailyMetricForParticipant: (candidateId: string, metric: OjtDailyMetric) => Promise<void>;
  extendCohortOjt: (cohortId: string, additionalDays: number, reason?: string) => Promise<void>;

  // OJT operations
  updateOjtStatus: (candidateId: string, status: OjtStatus, reasonOrNotes?: string) => Promise<void>;
  addOjtDailyMetric: (candidateId: string, metric: OjtDailyMetric) => Promise<void>;
  updateOjtSkillsMatrix: (candidateId: string, matrix: OjtSkillsMatrix) => Promise<void>;
  addOjtFeedback: (candidateId: string, feedback: Omit<OjtFeedback, 'id'>) => Promise<void>;
  
  // Hiring / Gestión de Talento
  updateHiringLaborData: (candidateId: string, laborData: Partial<LaborData>) => Promise<void>;
  updateHiringStatus: (candidateId: string, status: HiringStatus, reason: string) => Promise<void>;
  generateContract: (candidateId: string) => Promise<void>;
  signContract: (candidateId: string, signatureStatus: 'FIRMADO_DIGITAL' | 'FIRMADO_FISICO', reason?: string) => Promise<void>;

  // Management operations
}

const TalentContext = createContext<TalentContextType | undefined>(undefined);

export interface AttendanceUnlockRequest {
  id: string;
  trainingId: string;
  date: string;
  reason: string;
  status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  requestedAt: string;
  decidedAt?: string;
  expiresAt?: string | null;
}

export interface AttendanceWindowInfo {
  serverNow: string;
  startAt: string;
  closesAt: string;
  state: 'UPCOMING' | 'OPEN' | 'LOCKED' | 'UNLOCKED';
  unlock: AttendanceUnlockRequest | null;
}

export const TalentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);

  const [currentUser, setCurrentUserState] = useState<UserProfile>(emptyUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);

  const [campaigns, setCampaigns] = useState<CampaignCall[]>([]);

  const [cohorts, setCohorts] = useState<TrainingCohort[]>([]);

  const [activeModule, setActiveModule] = useState<ActiveNavModule>('SELECCION_DASHBOARD');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const adjustActiveModuleForUser = (user: UserProfile) => {
    if (user.role === 'ADMIN') return;
    const allowed = user.allowedModules || ['SELECCION'];

    const isCurrentModuleAllowed = () => {
      if (activeModule.startsWith('SELECCION') || activeModule === 'CONVOCATORIAS' || activeModule === 'MIS_CONVOCATORIAS' || activeModule === 'CANDIDATOS') {
        return allowed.includes('SELECCION');
      }
      if (activeModule.startsWith('FORMACION')) {
        return allowed.includes('FORMACION');
      }
      if (activeModule.startsWith('TALENTO')) {
        return allowed.includes('TALENTO');
      }
      if (activeModule === 'ANALITICA') {
        return allowed.includes('ANALITICA');
      }
      if (activeModule === 'CONFIGURACION' || activeModule === 'ADMIN_USUARIOS') {
        return allowed.includes('ADMINISTRACION');
      }
      if (activeModule === 'OPERACIONES_ADMIN') return allowed.includes('OPERACIONES');
      return false;
    };

    if (!isCurrentModuleAllowed()) {
      if (allowed.includes('SELECCION')) {
        setActiveModule(user.role === 'RECLUTADOR' ? 'MIS_CONVOCATORIAS' : 'SELECCION_DASHBOARD');
      } else if (allowed.includes('FORMACION')) {
        setActiveModule(user.role === 'FORMADOR' ? 'FORMACION_MIS_CAPACITACIONES' : 'FORMACION_DASHBOARD');
      } else if (allowed.includes('TALENTO')) {
        setActiveModule('TALENTO_CONTRATACIONES');
      } else if (allowed.includes('ANALITICA')) {
        setActiveModule('ANALITICA');
      } else if (allowed.includes('ADMINISTRACION')) {
        setActiveModule('ADMIN_USUARIOS');
      } else if (allowed.includes('OPERACIONES')) {
        setActiveModule('OPERACIONES_ADMIN');
      }
    }
  };

  const loadSupabaseProfile = async (isCurrent = () => true) => {
    const data = await workerApi<{id:string;companyId:string;username:string;name:string;role:UserProfile['role'];status:'ACTIVO';allowedModules:UserProfile['allowedModules'];mustChangePassword:boolean;avatarUrl?:string;nickname?:string;tagline?:string;phone?:string;jobTitle?:string;scope?:string[];subordinateUserIds?:string[];companies?:UserProfile['companies'];globalAdmin?:boolean;managedCompany?:boolean;companyCampaigns?:string[]}>('/api/session');
    const profile: UserProfile = normalizeUserIdentity({id:data.id,companyId:data.companyId,email:data.username,name:data.name,role:data.role,status:data.status,allowedModules:data.allowedModules,avatarUrl:data.avatarUrl||'',nickname:data.nickname,tagline:data.tagline,phone:data.phone,jobTitle:data.jobTitle,scopeCampaignIds:data.scope||[],subordinateUserIds:data.subordinateUserIds||[],companies:data.companies,globalAdmin:data.globalAdmin,managedCompany:data.managedCompany,companyCampaigns:data.companyCampaigns});
    if (!isCurrent()) return profile;
    setCurrentUserState(profile);
    setMustChangePassword(data.mustChangePassword === true);
    setIsAuthenticated(true);
    setConnectionError('');
    return profile;
  };

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let generation = 0;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = ++generation;
      if (!session) { setIsAuthenticated(false); setMustChangePassword(false); setCurrentUserState(emptyUser); setUsers([]); setCandidates([]); setCampaigns([]); setCohorts([]); return; }
      // Fuera del callback SDK para evitar bloquear su mutex de sesión.
      queueMicrotask(() => {
        if (!active || current !== generation) return;
        void loadSupabaseProfile(() => active && current === generation).catch(() => {
          if (active && current === generation) { setIsAuthenticated(false); setConnectionError('No se pudo validar el perfil en el servidor Supabase.'); }
        });
      });
    });
    return () => { active = false; generation++; data.subscription.unsubscribe(); };
  }, []);

  const login = async (username: string, password: string, remember = true) => {
    if (!isSupabaseConfigured) return {success:false,message:'Supabase no está configurado.'};
    try {
      const {error} = await signInSupabase(username,password,remember);
      if (error) return {success:false,message:'Usuario o contraseña incorrectos.'};
      const profile = await loadSupabaseProfile();
      adjustActiveModuleForUser(profile);
      return {success:true};
    } catch {
      await signOutSupabase().catch(() => {});
      return {success:false,message:'No se pudo validar el perfil Supabase. Comprueba el servicio de sesión.'};
    }
  };
  const logout = async () => {
    await signOutSupabase();
    setIsAuthenticated(false);
    setMustChangePassword(false);
    setCurrentUserState(emptyUser);
    setUsers([]); setCandidates([]); setCampaigns([]); setCohorts([]);
  };
  const changeInitialPassword = async (password: string) => {
    await workerApi('/api/session/password',{method:'POST',body:JSON.stringify({password})});
    // Exigir nueva autenticación con la contraseña elegida.
    await logout();
  };

  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) return;
    let active=true, running=false, queued=false;
    const refresh=async()=>{
      if(running){queued=true;return;}
      running=true;
      try {
        const data=await workerApi<{users:UserProfile[];campaigns:CampaignCall[];cohorts:TrainingCohort[];candidates:CandidateRecord[]}>('/api/bootstrap');
        if(active){const self=data.users.find(u=>u.id===currentUser.id);if(self)setCurrentUserState(prev=>normalizeUserIdentity({...prev,...self,scopeCampaignIds:prev.scopeCampaignIds,role:prev.role,allowedModules:prev.allowedModules,companyId:prev.companyId}));setUsers(data.users.map(normalizeUserIdentity));setCampaigns(data.campaigns.map(c=>campaignFromFirestore(c.id,c as unknown as Record<string,unknown>)));setCohorts(data.cohorts.map(c=>trainingFromFirestore(c.id,c as unknown as Record<string,unknown>)));setCandidates(data.candidates.map(c=>candidateFromFirestore(c.id,c as unknown as Record<string,unknown>)));setConnectionError('');}
      } catch { if(active)setConnectionError('No se pudieron actualizar los datos de Supabase. Intenta nuevamente.'); }
      finally {running=false;if(active&&queued){queued=false;void refresh();}}
    };
    const update=()=>void refresh();
    const visibility=()=>{if(document.visibilityState==='visible')update();};
    update();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')update();},30000);
    window.addEventListener('talent:data-changed',update);window.addEventListener('focus',update);document.addEventListener('visibilitychange',visibility);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('talent:data-changed',update);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',visibility);};
  },[isAuthenticated,mustChangePassword,currentUser.id]);

  const addUser = async (userData: Omit<UserProfile, 'id'> & { password: string }): Promise<UserProfile> => {
    const payload = {
      username: userData.email,
      password: userData.password,
      displayName: sanitizeDisplayName(userData.name),
      phone: userData.phone,
      dni: userData.dni,
      jobTitle: userData.jobTitle,
      role: userData.role,
      status: userData.status || 'ACTIVO',
      module: userData.allowedModules,
      scope: userData.scopeCampaignIds || [],
      subordinateUserIds: userData.subordinateUserIds || [],
      avatarUrl: normalizeAvatarUrl(userData.avatarUrl),
      nickname: userData.nickname ? sanitizeDisplayName(userData.nickname, '') : '',
      tagline: userData.tagline ? sanitizeDisplayName(userData.tagline, '') : '',
      companyId: userData.companyId || currentUser.companyId,
      companyAccess: userData.companyAccess,
    };
    await workerApi('/api/users', { method: 'POST', body: JSON.stringify(payload) });
    return normalizeUserIdentity({ ...userData, id: '', status: userData.status || 'ACTIVO' });
  };

  const updateUser = async (userId: string, data: Partial<UserProfile>) => {
    const existingUser = users.find(item => item.id === userId);
    const normalizedUsername = typeof data.email === 'string' ? data.email.trim().toLowerCase() : undefined;
    const usernameChanged = !!normalizedUsername && normalizedUsername !== existingUser?.email;
    const displayName = typeof data.name === 'string' ? sanitizeDisplayName(data.name) : undefined;
    const avatarUrl = typeof data.avatarUrl === 'string' ? normalizeAvatarUrl(data.avatarUrl) : undefined;
    const normalizedData = Object.fromEntries(Object.entries({
      displayName,
      name: displayName,
      username: usernameChanged ? normalizedUsername : undefined,
      phone: data.phone ?? existingUser?.phone ?? '',
      dni: data.dni ?? existingUser?.dni,
      jobTitle: data.jobTitle ?? existingUser?.jobTitle ?? '',
      role: data.role || existingUser?.role || currentUser.role,
      status: data.status || existingUser?.status || 'ACTIVO',
      enabled: (data.status || existingUser?.status || 'ACTIVO') === 'ACTIVO',
      module: data.allowedModules ?? existingUser?.allowedModules,
      allowedModules: data.allowedModules ?? existingUser?.allowedModules,
      scope: data.scopeCampaignIds ?? existingUser?.scopeCampaignIds ?? [],
      scopeCampaignIds: data.scopeCampaignIds ?? existingUser?.scopeCampaignIds ?? [],
      subordinateUserIds: data.subordinateUserIds ?? existingUser?.subordinateUserIds ?? [],
      avatarUrl,
      nickname: typeof data.nickname === 'string' ? sanitizeDisplayName(data.nickname, '') : undefined,
      tagline: typeof data.tagline === 'string' ? sanitizeDisplayName(data.tagline, '') : undefined,
      companyId: data.companyId || existingUser?.companyId || currentUser.companyId,
      companyAccess: data.companyAccess,
    }).filter(([, value]) => value !== undefined));
    await workerApi(`/api/users/${encodeURIComponent(userId)}/access`, { method: 'PATCH', body: JSON.stringify(normalizedData) });
    if (currentUser.id === userId) {
      setCurrentUserState(prev => normalizeUserIdentity({ ...prev, ...data, ...(displayName ? { name: displayName } : {}), ...(avatarUrl !== undefined ? { avatarUrl } : {}) }));
    }
    setUsers(prev => prev.map(item => item.id === userId ? normalizeUserIdentity({ ...item, ...data, ...(displayName ? { name: displayName } : {}), ...(avatarUrl !== undefined ? { avatarUrl } : {}) }) : item));
  };

  const deleteUser = async (userId: string) => {
    const user = users.find(item => item.id === userId);
    if (!user) return;
    await updateUser(userId, { ...user, status: 'INACTIVO' });
  };

  const toggleUserStatus = async (userId: string) => {
    const user = users.find(item => item.id === userId);
    if (!user) return;
    await updateUser(userId, { ...user, status: user.status === 'INACTIVO' ? 'ACTIVO' : 'INACTIVO' });
  };

  const resetUserPassword = async (userId: string, newPassword: string) => {
    await workerApi(`/api/users/${encodeURIComponent(userId)}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
  };

  const getSystemSettings = () => workerApi<SystemSettings>('/api/settings');
  const updateSystemSettings = (settings: SystemSettings) => workerApi<SystemSettings>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });

  // Derive scoped campaigns by role
  const scopedCampaigns = campaigns.filter(camp => {
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'JEFE_SELECCION') return true;
    if (currentUser.role === 'ANALISTA_SELECCION') {
      return camp.assignedAnalystId === currentUser.id || 
             camp.responsibles?.some(r => r.userId === currentUser.id) ||
             (currentUser.scopeCampaignIds && currentUser.scopeCampaignIds.includes(camp.id));
    }
    if (currentUser.role === 'RECLUTADOR') {
      return camp.responsibles?.some(r => r.userId === currentUser.id) ||
             (currentUser.scopeCampaignIds && currentUser.scopeCampaignIds.includes(camp.id));
    }
    return true;
  });

  // Convocatorias asignadas directamente al usuario (Mis Convocatorias)
  const myAssignedCampaigns = campaigns.filter(camp => {
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'RECLUTADOR') {
      return camp.responsibles?.some(r => r.userId === currentUser.id) ||
             (currentUser.scopeCampaignIds && currentUser.scopeCampaignIds.includes(camp.id));
    }
    if (currentUser.role === 'ANALISTA_SELECCION') {
      // Para analistas: Convocatorias donde es responsable directo (ej: Staff) o asignadas a él
      return camp.responsibles?.some(r => r.userId === currentUser.id && r.isDirectResponsible) ||
             camp.assignedAnalystId === currentUser.id;
    }
    return true;
  });

  // Derive scoped cohorts by Formación roles
  const scopedCohorts = cohorts.filter(coh => {
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'JEFE_FORMACION' || currentUser.role === 'JEFE_SELECCION') return true;
    if (currentUser.role === 'COORDINADOR_FORMACION') {
      return coh.coordinatorId === currentUser.id || Boolean(currentUser.scopeCampaignIds?.includes(coh.campaignId));
    }
    if (currentUser.role === 'FORMADOR') {
      return coh.trainerId === currentUser.id;
    }
    if (currentUser.role === 'ANALISTA_SELECCION') {
      return scopedCampaigns.some(camp => camp.id === coh.campaignId);
    }
    return false;
  });

  // Capacitaciones asignadas directamente al Formador o Coordinador (Mis Capacitaciones)
  const myAssignedCohorts = cohorts.filter(coh => {
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'FORMADOR') {
      return coh.trainerId === currentUser.id;
    }
    if (currentUser.role === 'COORDINADOR_FORMACION') {
      return coh.coordinatorId === currentUser.id || Boolean(currentUser.scopeCampaignIds?.includes(coh.campaignId));
    }
    return false;
  });

  // Derive scoped candidates by role
  const scopedCandidates = candidates.filter(cand => {
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'JEFE_SELECCION') return true;
    if (currentUser.role === 'JEFE_FORMACION' || currentUser.role === 'JEFE_TALENTO' || currentUser.role === 'ANALISTA_TALENTO') return true;
    if (currentUser.role === 'ANALISTA_SELECCION') {
      const isUnderScope = scopedCampaigns.some(c => c.id === cand.campaignId);
      return isUnderScope || cand.analystId === currentUser.id || cand.recruiterId === currentUser.id;
    }
    if (currentUser.role === 'RECLUTADOR') {
      return cand.recruiterId === currentUser.id || 
             scopedCampaigns.some(c => c.id === cand.campaignId && c.responsibles?.some(r => r.userId === currentUser.id));
    }
    if (currentUser.role === 'FORMADOR') {
      const myCohortIds = cohorts
        .filter(coh => coh.trainerId === currentUser.id)
        .map(coh => coh.id);
      return cand.training?.cohortId ? myCohortIds.includes(cand.training.cohortId) : false;
    }
    if (currentUser.role === 'COORDINADOR_FORMACION') {
      const coordCohortIds = cohorts
        .filter(coh => coh.coordinatorId === currentUser.id || Boolean(currentUser.scopeCampaignIds?.includes(coh.campaignId)))
        .map(coh => coh.id);
      return cand.training?.cohortId ? coordCohortIds.includes(cand.training.cohortId) : false;
    }
    return true;
  });

  const openCandidate360 = (id: string) => setSelectedCandidateId(id);
  const closeCandidate360 = () => setSelectedCandidateId(null);


  // Anti-duplication check
  const checkDuplicateCandidate = (dni: string, phone: string, excludeId?: string, companyId?:string) => {
    const cleanDni = dni.trim().replace(/\D/g, '');
    const cleanPhone = phone.trim().replace(/\D/g, '');

    const sameCompany=candidates.filter(c=>!companyId||c.companyId===companyId);
    const existingByDni = sameCompany.find(c => c.id !== excludeId && c.dni.replace(/\D/g, '') === cleanDni);
    if (existingByDni) {
      return {
        isDuplicate: true,
        matchedCandidate: existingByDni,
        reason: `Ya existe un postulante registrado con el DNI ${dni} (${existingByDni.fullName} en ${existingByDni.campaignName}).`
      };
    }

    if (cleanPhone.length >= 8) {
      const existingByPhone = sameCompany.find(c => c.id !== excludeId && c.phone.replace(/\D/g, '').endsWith(cleanPhone.slice(-8)));
      if (existingByPhone) {
        return {
          isDuplicate: true,
          matchedCandidate: existingByPhone,
          reason: `Ya existe un postulante registrado con el número telefónico ${phone} (${existingByPhone.fullName}).`
        };
      }
    }

    return { isDuplicate: false };
  };

  // Add Candidate
  const addCandidate = async (data: Partial<CandidateRecord>) => {
    const dni = data.dni || '';
    const phone = data.phone || '';

    // Check duplicate
    const targetCampaign = campaigns.find(c => c.id === data.campaignId);
    const dupCheck = checkDuplicateCandidate(dni, phone,undefined,targetCampaign?.companyId);
    if (dupCheck.isDuplicate) {
      return { success: false, message: dupCheck.reason };
    }

    
    // Assign recruiter
    let assignedRecruiterId = data.recruiterId || currentUser.id;
    let assignedRecruiterName = data.recruiterName || currentUser.name;
    if (currentUser.role === 'RECLUTADOR') {
      assignedRecruiterId = currentUser.id;
      assignedRecruiterName = currentUser.name;
    } else if (!data.recruiterId && targetCampaign?.responsibles?.length) {
      assignedRecruiterId = targetCampaign.responsibles[0].userId;
      assignedRecruiterName = targetCampaign.responsibles[0].userName;
    }

    if (!targetCampaign) return { success: false, message: 'Selecciona una convocatoria válida.' };
    const newCandidate: Partial<CandidateRecord> = {
      ...data,
      dni,
      phone,
      campaignId: targetCampaign.id,
      campaignCode: targetCampaign.code,
      campaignName: targetCampaign.title,
      jobProfile: data.jobProfile || targetCampaign.title,
      recruiterId: assignedRecruiterId,
      recruiterName: assignedRecruiterName,
      analystId: targetCampaign.assignedAnalystId,
      analystName: targetCampaign.assignedAnalystName,
    };

    try {
      const candidate = await workerApi<CandidateRecord>('/api/candidates', { method: 'POST', body: JSON.stringify(newCandidate) });
      return { success: true, candidate };
    } catch (error: unknown) {
      return { success: false, message: error instanceof Error ? error.message : 'CANDIDATE_CREATE_FAILED' };
    }
  };

  // Update Selection Stage with automatic Traceability
  const updateCandidateSelectionStage = async (
    candidateId: string, 
    stage: SelectionStage, 
    discardReason?: string, 
    discardDetail?: string,
    observation?: string
  ): Promise<void> => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    await workerApi(`/api/candidates/${candidateId}/stage`, { method: 'POST', body: JSON.stringify({ stage, discardReason, discardDetail, observation, date: dateStr, time: timeStr }) });
  };

  // Update Interview Record
  const updateInterviewResult = async (candidateId: string, interview: InterviewRecord) => {
    await workerApi(`/api/candidates/${encodeURIComponent(candidateId)}/selection-record`, { method: 'PATCH', body: JSON.stringify({ kind: 'INTERVIEW', value: interview }) });
  };

  // Update Technical Verification
  const updateTechnicalVerification = async (candidateId: string, techVerif: TechnicalVerificationRecord) => {
    await workerApi(`/api/candidates/${encodeURIComponent(candidateId)}/selection-record`, { method: 'PATCH', body: JSON.stringify({ kind: 'TECHNICAL', value: techVerif }) });
  };

  // Add Candidate Evaluation
  const addCandidateEvaluationRecord = async (candidateId: string, evalItem: Omit<EvaluationItem, 'id'>) => {
    const newEval: EvaluationItem = {
      ...evalItem,
      id: 'EV-' + Date.now()
    };
    await workerApi(`/api/candidates/${candidateId}/evaluations`, { method: 'POST', body: JSON.stringify(newEval) });
  };

  // Add Contact History
  const addCandidateContactHistory = async (candidateId: string, item: Omit<ContactHistoryItem, 'id'>) => {
    const newContact: ContactHistoryItem = {
      ...item,
      id: 'CNT-' + Date.now()
    };
    await workerApi(`/api/candidates/${candidateId}/contacts`, { method: 'POST', body: JSON.stringify(newContact) });
  };

  // Add Observation
  const addCandidateObservation = async (candidateId: string, item: Omit<ObservationItem, 'id'>) => {
    await workerApi(`/api/candidates/${encodeURIComponent(candidateId)}/observations`, { method: 'POST', body: JSON.stringify(item) });
  };

  // Update Candidate Personal Data for Hiring Expedient
  const updateCandidatePersonalData = async (candidateId: string, data: Partial<CandidateRecord>) => {
    await workerApi(`/api/candidates/${encodeURIComponent(candidateId)}/personal-data`, { method: 'PATCH', body: JSON.stringify(data) });
  };

  const updateCandidateSalaryAccount = async (candidateId: string, salaryData: SalaryAccountDetails) => {
    await workerApi(`/api/candidates/${encodeURIComponent(candidateId)}/salary-account`, { method: 'POST', body: JSON.stringify(salaryData) });
  };

  const backendDocumentStatus = (status: 'PENDIENTE' | 'CARGADO' | 'VALIDADO' | 'OBSERVADO') => ({ PENDIENTE: 'PENDING', CARGADO: 'UPLOADED', VALIDADO: 'VALIDATED', OBSERVADO: 'OBSERVED' } as const)[status];
  const updateDocumentStatus = async (candidateId: string, docId: string, status: 'PENDIENTE' | 'CARGADO' | 'VALIDADO' | 'OBSERVADO', notes?: string) => {
    await workerApi(`/api/candidates/${encodeURIComponent(candidateId)}/documents/${encodeURIComponent(docId)}`, { method: 'PATCH', body: JSON.stringify({ status: backendDocumentStatus(status), notes }) });
  };

  const addCandidateDocument = async (candidateId: string, document: Omit<DocumentItem, 'id'>, file: File) => {
    const form = new FormData(); form.set('file', file); form.set('name', document.name); form.set('type', document.type); form.set('isMandatory', String(document.isMandatory === true));
    await workerUpload(`/api/candidates/${encodeURIComponent(candidateId)}/documents`, form);
  };
  const listCandidateDocuments = (candidateId: string) => workerApi<DocumentItem[]>(`/api/candidates/${encodeURIComponent(candidateId)}/documents`);
  const replaceCandidateDocument = async (candidateId: string, documentId: string, file: File) => {
    const form = new FormData(); form.set('file', file); await workerUpload(`/api/candidates/${encodeURIComponent(candidateId)}/documents/${encodeURIComponent(documentId)}/content`, form);
  };

  const downloadCandidateDocument = async (candidateId: string, documentId: string, fileName: string) => {
    const blob = await workerDownload(`/api/candidates/${encodeURIComponent(candidateId)}/documents/${encodeURIComponent(documentId)}`); const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
  };

  // Mark Apto Para Capacitacion (Disponibilidad inmediata para Formación)
  const markCandidateAptoCapacitacion = (candidateId: string, notes?: string) => {
    return updateCandidateSelectionStage(candidateId, 'APTO_CAPACITACION', undefined, undefined, notes || 'Candidato promovido a Apto para Capacitación.');
  };

  // Log Blocked Alta Attempt
  const logBlockedAltaAttempt = async (candidateId: string, reasons: string[]) => {
    await workerApi(`/api/candidates/${encodeURIComponent(candidateId)}/observations`, { method: 'POST', body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), author: currentUser.name, note: 'Pase a Gestión de Talento bloqueado por requisitos pendientes.', details: reasons.join(' | ') }) });
  };

  // Approve Participant To Talent Alta (Formación/OJT -> Gestión de Talento)
  const approveParticipantToTalentAlta = async (candidateId: string, notes?: string): Promise<boolean> => {
    await workerApi(`/api/candidates/${encodeURIComponent(candidateId)}/alta`, { method: 'POST', body: JSON.stringify({ notes }) });
    return true;
  };
  const getCandidateEligibility = (candidateId: string) => workerApi<CandidateEligibility>(`/api/candidates/${encodeURIComponent(candidateId)}/eligibility`);

  // Convocatoria CRUD & Operations
  const createConvocatoria = async (campData: Partial<CampaignCall>) => {
    const now = new Date().toISOString().split('T')[0];
    const count = campaigns.length + 1;
    const newId = `CMP-${String(count).padStart(3, '0')}`;
    const code = campData.code || `CONV-2026-${String(80 + count).padStart(3, '0')}`;

    const defaultSources: LeadSourceType[] = ['Facebook Gratis', 'Mantra', 'Referidos', 'Grupo WhatsApp', 'Reingreso', 'Indeed', 'Otro'];
    const formattedSources = defaultSources.map(srcName => ({
      sourceName: srcName,
      isEnabled: true,
      link: `https://talentcc.app/jobs/${code}?src=${encodeURIComponent(srcName.toLowerCase().replace(/\s+/g, '_'))}&ref=${now}`,
      leadsCount: 0
    }));

    const newCamp: CampaignCall = {
      sourceRqId: campData.sourceRqId,
      companyId:campData.companyId,
      companyCampaignId:campData.companyCampaignId,
      id: newId,
      code,
      company: campData.company || 'Empresa Cliente',
      title: campData.title || 'Nueva Campaña de Contact Center',
      client: campData.company || 'Empresa Cliente',
      area: campData.area || 'Operaciones',
      salaryBase: campData.salaryBase ?? 1250,
      variableBonus: campData.variableBonus || 0,
      adminBonus: campData.adminBonus || 0,
      mobilityBonus: campData.mobilityBonus || 0,
      additionalConditions: campData.additionalConditions || '',
      requestDate: campData.requestDate || now,
      startDate: campData.startDate || now,
      endDate: campData.endDate || '',
      processType: campData.processType || 'EXTERNO',
      managementType: campData.managementType || 'PRESENCIAL',
      vacancies: campData.vacancies || 10,
      positionsCovered: 0,
      positionsPending: campData.vacancies || 10,
      location: campData.location || 'Sede Central - Lima Centro',
      shift: campData.shift || 'L-S 09:00 - 18:00',
      observations: campData.observations || '',
      status: campData.status || 'EN_PROCESO',
      assignedAnalystId: campData.assignedAnalystId || currentUser.id,
      assignedAnalystName: campData.assignedAnalystName || currentUser.name,
      responsibles: campData.responsibles || [
        {
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: currentUser.role,
          target: campData.vacancies || 10,
          hiredCount: 0
        }
      ],
      sources: formattedSources,
      statusHistory: [
        {
          date: now,
          previousStatus: 'CREACION',
          newStatus: campData.status || 'EN_PROCESO',
          changedBy: currentUser.name,
          reason: 'Apertura de nueva convocatoria.'
        }
      ],
      applicantsCount: 0,
      inTrainingCount: 0,
      inOjtCount: 0,
      hiredCount: 0,
      requirements: campData.requirements || []
    };

    const created = await workerApi<CampaignCall>('/api/campaigns', { method: 'POST', body: JSON.stringify(newCamp) });
    return created;
  };

  const updateConvocatoria = async (campId: string, data: Partial<CampaignCall>) => {
    await workerApi(`/api/campaigns/${campId}`, { method: 'PATCH', body: JSON.stringify(data) });
  };

  const updateConvocatoriaStatus = async (campId: string, newStatus: ConvocatoriaStatus, reason?: string) => {
    await workerApi(`/api/campaigns/${campId}/status`, { method: 'POST', body: JSON.stringify({ status: newStatus, reason }) });
  };

  const updateConvocatoriaResponsibles = async (campId: string, responsibles: ConvocatoriaResponsible[], allowOverTarget?: boolean) => {
    await workerApi(`/api/campaigns/${campId}/responsibles`, { method: 'POST', body: JSON.stringify({ responsibles, allowOverTarget }) });
  };

  const toggleConvocatoriaSource = async (campId: string, sourceName: LeadSourceType, isEnabled: boolean) => {
    await workerApi(`/api/campaigns/${campId}/sources`, { method: 'POST', body: JSON.stringify({ sourceName, isEnabled }) });
  };

  // ==========================================
  // FORMACIÓN & CAPACITACIONES OPERATIONS
  // ==========================================

  const createTrainingFromSelection = async (params: {
    name: string;
    code: string;
    campaignId: string;
    candidateIds: string[];
    startDate: string;
    schedule: string;
    modality: 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';
    location?: string;
    roomOrLink?: string;
    ojtStartDate?: string;
    ojtEndDate?: string;
    observations?: string;
    passingMinGrade?: number;
    totalDays?: number;
  }): Promise<TrainingCohort> => {
    return workerApi<TrainingCohort>('/api/trainings/from-selection', {
      method: 'POST',
      body: JSON.stringify({ ...params, participantIds: params.candidateIds, plannedDate: params.startDate }),
    });
  };

  const assignCoordinatorToCohort = async (cohortId: string, coordinatorId: string, coordinatorName: string, notes?: string) => {
    await workerApi(`/api/trainings/${encodeURIComponent(cohortId)}/management`, { method: 'PATCH', body: JSON.stringify({ operation: 'COORDINATOR', coordinatorId, coordinatorName, notes }) });
  };

  const listAvailableTrainers = async (cohortId: string): Promise<UserProfile[]> => {
    const result = await workerApi<{ trainers: UserProfile[] }>(`/api/trainings/${encodeURIComponent(cohortId)}/trainer`);
    return result.trainers.map(normalizeUserIdentity);
  };

  const assignTrainerToCohort = async (cohortId: string, trainerId: string, trainerName: string, notes?: string) => {
    const result = await workerApi<{ training: TrainingCohort }>(`/api/trainings/${encodeURIComponent(cohortId)}/trainer`, { method: 'POST', body: JSON.stringify({ trainerId, notes }) });
    setCohorts(current => current.map(cohort => cohort.id === cohortId ? { ...cohort, ...result.training, trainerId, trainerName: result.training.trainerName || trainerName } : cohort));
  };

  const updateCohortStatus = async (cohortId: string, newStatus: TrainingCohortStatus, reason?: string) => {
    await workerApi(`/api/trainings/${encodeURIComponent(cohortId)}/management`, { method: 'PATCH', body: JSON.stringify({ operation: 'STATUS', status: newStatus, reason }) });
  };

  const updateCohortDetails = async (cohortId: string, data: Partial<TrainingCohort>) => {
    await workerApi(`/api/trainings/${encodeURIComponent(cohortId)}/management`, { method: 'PATCH', body: JSON.stringify({ operation: 'DETAILS', ...data }) });
  };

  const addCustomEvaluationToCohort = async (cohortId: string, evalConfig: { name: string; date: string; maxScore: number; minScore: number }) => {
    await workerApi(`/api/trainings/${encodeURIComponent(cohortId)}/management`, { method: 'PATCH', body: JSON.stringify({ operation: 'EVALUATION_CONFIG', config: evalConfig }) });
  };

  const trainingIdForCandidate = (candidateId: string): string => {
    const target = candidates.find(candidate => candidate.id === candidateId); const trainingId = target?.trainingId || target?.training?.cohortId;
    if (!trainingId) throw new Error('El candidato no tiene una capacitación asignada.'); return trainingId;
  };
  const recordParticipantAttendance = async (candidateId: string, dayNumber: number, date: string, status: AttendanceStatus, notes?: string) => {
    const trainingId = trainingIdForCandidate(candidateId);
    await workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/attendance`, { method: 'POST', body: JSON.stringify({ dayNumber, date, attendance: status, status, observation: notes, notes }) });
  };

  const recordBulkAttendance = async (cohortId: string, dayNumber: number, date: string, status: AttendanceStatus) => {
    const participantIds = cohorts.find(cohort => cohort.id === cohortId)?.participantIds ?? candidates.filter(candidate => candidate.training?.cohortId === cohortId).map(candidate => candidate.id);
    await workerApi(`/api/trainings/${encodeURIComponent(cohortId)}/attendance/bulk`, {method:'POST',body:JSON.stringify({candidateIds:participantIds,dayNumber,date,attendance:status,status})});
  };

  const getAttendanceWindow = (cohortId: string, date: string) => workerApi<AttendanceWindowInfo>(`/api/trainings/${encodeURIComponent(cohortId)}/attendance-window?date=${encodeURIComponent(date)}`);

  const requestAttendanceUnlock = (cohortId: string, date: string, reason: string) => workerApi<AttendanceUnlockRequest>(`/api/trainings/${encodeURIComponent(cohortId)}/attendance-unlocks/${encodeURIComponent(date)}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  const decideAttendanceUnlock = (cohortId: string, date: string, decision: 'APROBADA' | 'RECHAZADA', reason?: string) => workerApi<AttendanceUnlockRequest>(`/api/trainings/${encodeURIComponent(cohortId)}/attendance-unlocks/${encodeURIComponent(date)}`, {
    method: 'PATCH',
    body: JSON.stringify({ decision, reason }),
  });

  const recordParticipantEvaluationGrade = (
    candidateId: string, 
    evalId: string, 
    moduleName: string, 
    score: number, 
    maxScore: number, 
    minRequired: number, 
    feedback?: string
  ) => {
    const trainingId = trainingIdForCandidate(candidateId);
    return workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/evaluations`, { method: 'POST', body: JSON.stringify({ evaluationId: evalId, name: moduleName, type: moduleName, moduleName, score, maxScore, minRequired, result: score >= minRequired ? 'APROBADO' : 'NO_APROBADO', observation: feedback, feedback, date: new Date().toISOString().slice(0, 10) }) }).then(() => undefined);
  };

  const registerStructuredDropout = async (candidateId: string, data: { stage: DropoutStage; category: DropoutCategory; observation: string }) => {
    const trainingId = trainingIdForCandidate(candidateId); await workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/dropout`, { method: 'POST', body: JSON.stringify(data) });
  };

  const updateParticipantTrainingStatus = async (candidateId: string, newStatus: ParticipantTrainingStatus, observation?: string) => {
    const trainingId = trainingIdForCandidate(candidateId);
    if (newStatus === 'EN_OJT') {
      await workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/ojt/start`, { method: 'POST', body: JSON.stringify({ reason: observation }) }); return;
    }
    if (newStatus === 'APTO_ALTA') {
      await workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/ojt/result`, { method: 'POST', body: JSON.stringify({ status: 'OJT_APROBADO', reason: observation }) }); return;
    }
    await workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/status`, { method: 'POST', body: JSON.stringify({ status: newStatus, reason: observation }) });
  };

  const recordOjtDailyMetricForParticipant = async (candidateId: string, metric: OjtDailyMetric) => {
    const trainingId = trainingIdForCandidate(candidateId);
    await workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/ojt/daily`, { method: 'POST', body: JSON.stringify({ date: metric.date, attendance: metric.attendance ?? 'PRESENTE', hoursManaged: metric.hoursWorked, sales: metric.sales, ahtSeconds: metric.ahtSeconds, qaScore: metric.qaScore, calls: metric.calls, leads: metric.leads, conversions: metric.conversions, feedback: metric.coachFeedback, observations: metric.observations }) });
  };

  const extendCohortOjt = async (cohortId: string, additionalDays: number, reason?: string) => {
    await workerApi(`/api/trainings/${encodeURIComponent(cohortId)}/management`, { method: 'PATCH', body: JSON.stringify({ operation: 'OJT_EXTENSION', additionalDays, reason }) });
  };

  const updateOjtStatus = async (candidateId: string, status: OjtStatus, reasonOrNotes?: string) => {
    const trainingId = trainingIdForCandidate(candidateId);
    if (['NO_INICIADO', 'EN_PROCESO', 'EN_PISO', 'EN_OJT'].includes(status)) {
      await workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/ojt/start`, { method: 'POST', body: JSON.stringify({ reason: reasonOrNotes }) }); return;
    }
    const mappedStatus = status === 'APTO_ALTA' ? 'OJT_APROBADO' : status === 'NO_APTO' ? 'OJT_NO_APROBADO' : status === 'ABANDONO' || status === 'BAJA_DESERCION' ? 'DESERTO' : status;
    await workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/ojt/result`, { method: 'POST', body: JSON.stringify({ status: mappedStatus, reason: reasonOrNotes }) });
  };

  const addOjtDailyMetric = async (candidateId: string, metric: OjtDailyMetric) => recordOjtDailyMetricForParticipant(candidateId, metric);

  const updateOjtSkillsMatrix = async (candidateId: string, matrix: OjtSkillsMatrix) => {
    const trainingId = trainingIdForCandidate(candidateId); await workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/ojt/skills`, { method: 'PATCH', body: JSON.stringify(matrix) });
  };

  const addOjtFeedback = async (candidateId: string, feedback: Omit<OjtFeedback, 'id'>) => {
    const trainingId = trainingIdForCandidate(candidateId); await workerApi(`/api/trainings/${encodeURIComponent(trainingId)}/participants/${encodeURIComponent(candidateId)}/ojt/feedback`, { method: 'POST', body: JSON.stringify(feedback) });
  };

  const updateHiringLaborData = async (candidateId: string, laborData: Partial<LaborData>) => {
    await workerApi(`/api/talent/candidates/${encodeURIComponent(candidateId)}/labor-data`, { method: 'PATCH', body: JSON.stringify(laborData) });
  };
  const updateHiringStatus = async (candidateId: string, status: HiringStatus, reason: string) => {
    await workerApi(`/api/talent/candidates/${encodeURIComponent(candidateId)}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) });
  };
  const generateContract = async (candidateId: string) => {
    await workerApi(`/api/talent/candidates/${encodeURIComponent(candidateId)}/contract`, { method: 'POST', body: '{}' });
  };
  const signContract = async (candidateId: string, signatureStatus: 'FIRMADO_DIGITAL' | 'FIRMADO_FISICO', reason?: string) => {
    await workerApi(`/api/talent/candidates/${encodeURIComponent(candidateId)}/contract/sign`, { method: 'POST', body: JSON.stringify({ signatureType: signatureStatus, reason }) });
  };

  return (
    <TalentContext.Provider value={{
      currentUser,
      isAuthenticated,
      mustChangePassword,
      connectionError,
      changeInitialPassword,
      login,
      logout,
      availableUsers: users,
      users,
      addUser,
      updateUser,
      deleteUser,
      toggleUserStatus,
      resetUserPassword,
      getSystemSettings,
      updateSystemSettings,
      candidates,
      campaigns,
      cohorts,
      scopedCampaigns,
      scopedCandidates,
      myAssignedCampaigns,
      scopedCohorts,
      myAssignedCohorts,
      activeModule,
      selectedCandidateId,
      selectedCampaignId,
      selectedCohortId,
      searchQuery,
      setActiveModule,
      openCandidate360,
      closeCandidate360,
      setSelectedCampaignId,
      setSelectedCohortId,
      setSearchQuery,
      addCandidate,
      checkDuplicateCandidate,
      updateCandidateSelectionStage,
      updateInterviewResult,
      updateTechnicalVerification,
      addCandidateEvaluationRecord,
      addCandidateContactHistory,
      addCandidateObservation,
      updateCandidatePersonalData,
      updateCandidateSalaryAccount,
      updateDocumentStatus,
      addCandidateDocument,
      listCandidateDocuments,
      replaceCandidateDocument,
      downloadCandidateDocument,
      markCandidateAptoCapacitacion,
      approveParticipantToTalentAlta,
      getCandidateEligibility,
      logBlockedAltaAttempt,
      createConvocatoria,
      updateConvocatoria,
      updateConvocatoriaStatus,
      updateConvocatoriaResponsibles,
      toggleConvocatoriaSource,
      createTrainingFromSelection,
      assignCoordinatorToCohort,
      listAvailableTrainers,
      assignTrainerToCohort,
      updateCohortStatus,
      updateCohortDetails,
      addCustomEvaluationToCohort,
      recordParticipantAttendance,
      recordBulkAttendance,
      getAttendanceWindow,
      requestAttendanceUnlock,
      decideAttendanceUnlock,
      recordParticipantEvaluationGrade,
      registerStructuredDropout,
      updateParticipantTrainingStatus,
      recordOjtDailyMetricForParticipant,
      extendCohortOjt,
      updateOjtStatus,
      addOjtDailyMetric,
      updateOjtSkillsMatrix,
      addOjtFeedback,
      updateHiringLaborData,
      updateHiringStatus,
      generateContract,
      signContract
    }}>
      {children}
    </TalentContext.Provider>
  );
};

export const useTalent = () => {
  const context = useContext(TalentContext);
  if (!context) throw new Error('useTalent must be used within a TalentProvider');
  return context;
};
