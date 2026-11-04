import React, { useEffect, useState } from 'react';
import { formatCandidateExperience, hasExperienceAnswer } from '../../utils/candidateExperience';
import { IdentityAvatar } from '../common/IdentityAvatar';
import { 
  X, 
  User, 
  FileText, 
  PhoneCall, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  Upload, 
  Calendar, 
  Building2, 
  MapPin, 
  Mail, 
  Phone, 
  DollarSign, 
  Award, 
  Check, 
  ArrowRight, 
  Sparkles,
  Laptop,
  Wifi,
  Headphones,
  History,
  FolderOpen,
  MessageSquare,
  UserX,
  Send,
  Plus,
  Edit3,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  MoreVertical
} from 'lucide-react';
import { useTalent } from '../../context/TalentContext';
import { 
  CandidateRecord, 
  SelectionStage, 
  ContactType, 
  ContactOutcome,
  EvaluationItem,
  InterviewRecord,
  TechnicalVerificationRecord
} from '../../types';
import { DiscardCandidateModal } from '../modals/DiscardCandidateModal';
import { DocumentacionContratacionTab } from './DocumentacionContratacionTab';
import { getExpedientAnalysis } from '../../utils/expedientUtils';
import { getWorkerErrorMessage, WorkerApiError } from '../../services/workerApi';
import { captureApi, CaptureDossier } from '../../services/captureApi';
import { CaptureDossierPanel } from './CaptureDossierPanel';
import { CaptureApplicantDetails } from '../capture/CaptureApplicantDetails';
import { SelectionAdvancedPanel } from './SelectionAdvancedPanel';

interface Candidate360ModalProps {
  candidateId: string | null;
  onClose: () => void;
}

type TabType = 'resumen' | 'datos' | 'seguimiento' | 'entrevista' | 'verificacion_tecnica' | 'evaluaciones' | 'documentos' | 'historial' | 'proceso';

export const Candidate360Modal: React.FC<Candidate360ModalProps> = ({
  candidateId,
  onClose
}) => {
  const { 
    candidates, 
    currentUser,
    updateCandidateSelectionStage,
    updateInterviewResult,
    updateTechnicalVerification,
    addCandidateEvaluationRecord,
    addCandidateContactHistory,
    addCandidateObservation,
    markCandidateAptoCapacitacion,
    listCandidateDocuments,
    downloadCandidateDocument,
    cohorts,
    scopedCampaigns
  } = useTalent();

  const [activeTab, setActiveTab] = useState<TabType>('resumen');
  const [captureDossier, setCaptureDossier] = useState<CaptureDossier | null>(null);
  const [captureHistoryOpen, setCaptureHistoryOpen] = useState(false);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureIssue, setCaptureIssue] = useState('');
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [cvDownloading, setCvDownloading] = useState(false);
  const [cvError, setCvError] = useState('');

  // New Contact Form State
  const [newContactType, setNewContactType] = useState<ContactType>('LLAMADA');
  const [newContactOutcome, setNewContactOutcome] = useState<ContactOutcome>('CONTESTO');
  const [newContactSummary, setNewContactSummary] = useState('');
  const [newContactNextStep, setNewContactNextStep] = useState('');

  // Interview Form State
  const [interviewStatus, setInterviewStatus] = useState<'APTO' | 'NO_APTO'>('APTO');
  const [interviewReason, setInterviewReason] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [fluidezScore, setFluidezScore] = useState(4);
  const [diccionScore, setDiccionScore] = useState(4);
  const [comercialScore, setComercialScore] = useState(4);

  // Technical Verification Form State
  const [techStatus, setTechStatus] = useState<'APRUEBA' | 'NO_APRUEBA' | 'APRUEBA_CON_OBSERVACION'>('APRUEBA');
  const [techDownloadSpeed, setTechDownloadSpeed] = useState(50);
  const [techUploadSpeed, setTechUploadSpeed] = useState(25);
  const [techLatency, setTechLatency] = useState(18);
  const [techRam, setTechRam] = useState(8);
  const [techProcessor, setTechProcessor] = useState('Intel Core i5 11va Gen');
  const [techOs, setTechOs] = useState('Windows 11 Home 64-bit');
  const [techHasHeadset, setTechHasHeadset] = useState(true);
  const [techQuietEnv, setTechQuietEnv] = useState(true);
  const [techNotes, setTechNotes] = useState('');
  const [techObservationDetail, setTechObservationDetail] = useState('');

  useEffect(() => {
    setCaptureDossier(null);
    setCaptureHistoryOpen(false);
    setCaptureIssue('');
    if (!candidateId || !['ADMIN', 'RECLUTADOR', 'ANALISTA_SELECCION', 'JEFE_SELECCION'].includes(currentUser.role)) return;
    let cancelled = false;
    setCaptureLoading(true);
    void captureApi.dossier(candidateId).then(dossier => {
      if (!cancelled) setCaptureDossier(dossier);
    }).catch(error => {
      if (!cancelled) setCaptureIssue(error instanceof WorkerApiError && [403,404].includes(error.status)
        ? 'No hay respuestas de captación asociadas a este candidato dentro de tus permisos.'
        : getWorkerErrorMessage(error, 'No se pudieron cargar las respuestas de captación. Actualiza e inténtalo nuevamente.'));
    }).finally(() => {
      if (!cancelled) setCaptureLoading(false);
    });
    return () => { cancelled = true; };
  }, [candidateId, currentUser.role]);

  // New Evaluation Form State
  const [evalName, setEvalName] = useState('Prueba de Velocidad de Digitación');
  const [evalScore, setEvalScore] = useState(85);
  const [evalResult, setEvalResult] = useState<'APTO' | 'NO_APTO' | 'PENDIENTE'>('APTO');
  const [evalObservation, setEvalObservation] = useState('');

  if (!candidateId) return null;
  const candidate = candidates.find(c => c.id === candidateId);
  if (!candidate) return null;

  const currentStage = candidate.selection?.stage || 'NUEVO';
  const isDiscarded = candidate.currentStage === 'DESCARTADO' || candidate.selection?.status === 'NO_APTO';
  const isAptoCapacitacion = currentStage === 'APTO_CAPACITACION';
  const candidateName = candidate.fullName?.trim() || [candidate.firstName, candidate.lastName].filter(Boolean).join(' ').trim() || 'Candidato';
  const captureEvents = captureDossier?.events ?? [];
  const latestCapture = captureEvents.slice().reverse().find(event => event.applicant.formSubmission || event.applicant.techCenterAnswers);
  const submittedAnswers = latestCapture?.applicant.formSubmission?.answers ?? latestCapture?.applicant.techCenterAnswers;
  const submittedSchedule = [submittedAnswers?.workday, submittedAnswers?.availability].filter(Boolean).join(' · ');
  const experienceAnswers = captureEvents.slice().reverse()
    .map(event => event.applicant.formSubmission?.answers ?? event.applicant.techCenterAnswers)
    .find(hasExperienceAnswer);
  const submittedExperience = formatCandidateExperience(experienceAnswers, candidate.experienceMonths);
  const campaign = scopedCampaigns.find(item => item.id === candidate.campaignId);
  const expedient = getExpedientAnalysis(candidate);
  const stageFlow: SelectionStage[] = ['NUEVO', 'CONTACTADO', 'ENTREVISTA', 'VERIFICACION_TECNICA', 'EVALUACIONES', 'APTO_CAPACITACION'];
  const stageLabels: Partial<Record<SelectionStage, string>> = { NUEVO: 'Nuevo', CONTACTADO: 'Contactado', ENTREVISTA: 'Entrevista', VERIFICACION_TECNICA: 'Verificación técnica', EVALUACIONES: 'Evaluaciones', APTO_CAPACITACION: 'Apto capacitación', DESCARTADO: 'Descartado' };
  const compactStageLabels: Partial<Record<SelectionStage, string>> = { ...stageLabels, VERIFICACION_TECNICA: 'Verificación', APTO_CAPACITACION: 'Apto' };
  const campaignCode = candidate.campaignCode || campaign?.code;
  const campaignCompany = campaign?.company || campaign?.client;
  const campaignLocation = campaign?.location || candidate.city;
  const hasTrainingLink = Boolean(candidate.trainingId || candidate.training?.cohortId);
  const canAccessCandidateDocuments =
    (['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION'].includes(currentUser.role) && hasTrainingLink)
    || (['JEFE_TALENTO', 'ANALISTA_TALENTO'].includes(currentUser.role) && candidate.currentProcess === 'GESTION_TALENTO');
  const handleCvDownload = async () => {
    setCvDownloading(true); setCvError('');
    try {
      const documents = await listCandidateDocuments(candidate.id);
      const cv = documents.find(document => document.type === 'CV');
      if (!cv) throw new Error('CV_NOT_FOUND');
      await downloadCandidateDocument(candidate.id, cv.id, cv.name || `${candidateName}-CV.pdf`);
    } catch (error) {
      setCvError(getWorkerErrorMessage(error, 'El candidato no tiene un CV cargado disponible.'));
    } finally { setCvDownloading(false); }
  };

  // Advance to next logical stage
  const handleAdvanceStage = () => {
    const currentIdx = stageFlow.indexOf(currentStage);
    if (currentIdx >= 0 && currentIdx < stageFlow.length - 1) {
      const nextStage = stageFlow[currentIdx + 1];
      updateCandidateSelectionStage(
        candidate.id,
        nextStage,
        undefined,
        undefined,
        `Avance de etapa a ${nextStage} realizado por ${currentUser.name}`
      ).catch(error=>alert(getWorkerErrorMessage(error)));
    }
  };

  // Add Contact History handler
  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactSummary.trim()) return;

    const now = new Date();
    addCandidateContactHistory(candidate.id, {
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: newContactType,
      outcome: newContactOutcome,
      summary: newContactSummary,
      nextStep: newContactNextStep || undefined,
      agentName: currentUser.name
    });

    setNewContactSummary('');
    setNewContactNextStep('');
  };

  // Save Interview Record handler
  const handleSaveInterview = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const interviewData: InterviewRecord = {
      date: now.toISOString().split('T')[0],
      interviewer: currentUser.name,
      status: interviewStatus,
      reason: interviewStatus === 'NO_APTO' ? (interviewReason || 'No cumple perfil') : undefined,
      notes: interviewNotes || (interviewStatus === 'APTO' ? 'Cumple con el perfil de comunicación requerido.' : 'Descartado en entrevista.'),
      ratings: {
        fluidezVerbal: fluidezScore,
        diccion: diccionScore,
        perfilComercial: comercialScore
      }
    };
    updateInterviewResult(candidate.id, interviewData);
  };

  // Save Technical Verification handler
  const handleSaveTechVerif = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const techData: TechnicalVerificationRecord = {
      date: now.toISOString().split('T')[0],
      verifiedBy: currentUser.name,
      status: techStatus,
      downloadSpeedMbps: Number(techDownloadSpeed),
      uploadSpeedMbps: Number(techUploadSpeed),
      latencyMs: Number(techLatency),
      ramGb: Number(techRam),
      processor: techProcessor,
      operatingSystem: techOs,
      hasNoiseCancellingHeadset: techHasHeadset,
      quietEnvironment: techQuietEnv,
      observationDetail: techStatus === 'APRUEBA_CON_OBSERVACION' ? techObservationDetail : undefined,
      notes: techNotes || `Verificación técnica registrada: ${techStatus}`
    };
    updateTechnicalVerification(candidate.id, techData);
  };

  // Add Evaluation handler
  const handleAddEvaluation = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    addCandidateEvaluationRecord(candidate.id, {
      name: evalName,
      title: evalName,
      maxScore: 100,
      passed: evalResult === 'APTO',
      comments: evalObservation,
      date: now.toISOString().split('T')[0],
      score: Number(evalScore),
      result: evalResult,
      observations: evalObservation,
      evaluator: currentUser.name
    });
    setEvalObservation('');
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 bg-slate-950/65 backdrop-blur-xs overflow-y-auto">
        <div className="flex max-h-[92vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          
          {/* Cabecera centrada en el candidato */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3.5">
              <IdentityAvatar src={candidate.avatarUrl} name={candidateName} className="h-11 w-11 rounded-full border border-slate-200 text-xs" />
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold leading-tight text-[#0C1E35]">{candidateName}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-2xs text-slate-500">
                  {candidate.dni && <span>DNI {candidate.dni}</span>}
                  {candidate.phone && <span>{candidate.phone}</span>}
                  {candidate.email && <span className="max-w-52 truncate">{candidate.email}</span>}
                  {!candidate.dni && !candidate.phone && !candidate.email && <span>Datos de contacto pendientes</span>}
                </div>
                {(campaignCode || candidate.jobProfile || candidate.campaignName || campaignCompany || campaignLocation) && <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-slate-500"><Building2 className="h-3 w-3 text-[#143A56]" />{campaignCode && <strong className="text-[#143A56]">{campaignCode}</strong>}{(candidate.jobProfile || candidate.campaignName) && <span className="font-medium text-slate-700">{candidate.jobProfile || candidate.campaignName}</span>}{campaignCompany && <span>{campaignCompany}</span>}{campaignLocation && <span>{campaignLocation}</span>}</div>}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="mr-1 flex h-11 shrink-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3">
                <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                <div className="w-24">
                  <span className="block whitespace-nowrap text-2xs font-medium leading-none text-slate-500">Docs. para alta</span>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${expedient.percentage === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${expedient.percentage}%` }} />
                  </div>
                </div>
                <div className="min-w-10 text-right leading-tight">
                  <strong className={`block text-xs ${expedient.percentage === 100 ? 'text-emerald-700' : 'text-amber-600'}`}>{expedient.percentage}%</strong>
                  {expedient.pendingCount > 0 && <span className="block whitespace-nowrap text-[9px] font-medium text-amber-700">{expedient.pendingCount} pend.</span>}
                </div>
              </div>
              {!isDiscarded && !isAptoCapacitacion && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsDiscardModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">Descartar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAdvanceStage}
                    className="flex items-center gap-1.5 rounded-lg bg-[#143A56] px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0C1E35]"
                  >
                    <span>Avanzar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void markCandidateAptoCapacitacion(candidate.id).catch(error=>alert(getWorkerErrorMessage(error)))}
                    title="Requiere nombres, documento, celular y convocatoria. Los documentos se completan antes del alta."
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">Apto capacitación</span><span className="xl:hidden">Apto</span>
                  </button>
                </>
              )}

              {isAptoCapacitacion && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-2xs font-bold text-emerald-700">
                    <Sparkles className="w-3.5 h-3.5" />
                    Apto para capacitación
                  </span>
                </div>
              )}

              <button type="button" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Más acciones"><MoreVertical className="h-4 w-4" /></button>
              <button onClick={onClose} className="ml-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
          </div>

          {/* Tab Navigation (8 Tabs) */}
          {captureDossier && <div className="border-b border-slate-200 px-5 py-2"><button className="text-xs font-semibold text-sky-700" onClick={() => setCaptureHistoryOpen(true)}>Origen e historial de captaciones</button></div>}
          {captureDossier && captureHistoryOpen && <CaptureDossierPanel dossier={captureDossier} onClose={() => setCaptureHistoryOpen(false)} />}
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-5 custom-scrollbar">
            {[
              { id: 'resumen', label: 'Resumen', icon: FileText },
              { id: 'datos', label: 'Perfil', icon: User },
              { id: 'seguimiento', label: 'Seguimiento', icon: PhoneCall, badge: candidate.selection?.contactHistory?.length },
              { id: 'entrevista', label: 'Entrevista', icon: MessageSquare },
              { id: 'verificacion_tecnica', label: 'Verificación', icon: Laptop },
              { id: 'evaluaciones', label: 'Evaluaciones', icon: Award, badge: candidate.selection?.evaluationsList?.length || candidate.selection?.evaluations?.length },
              ...(['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'].includes(currentUser.role) ? [{ id: 'proceso', label: 'Gestión avanzada', icon: History }] : []),
              ...(currentUser.role === 'FORMADOR' ? [] : [{ id: 'documentos', label: 'Documentos', icon: FolderOpen, badge: (candidate.documents?.length || candidate.selection?.documents?.length) }])
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'border-sky-700 text-[#143A56]'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-sky-600' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className={`text-2xs px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content Body */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar sm:px-6">
            {activeTab === 'proceso' && <SelectionAdvancedPanel candidateId={candidate.id} />}
            
            {/* TAB 1: RESUMEN */}
            {activeTab === 'resumen' && (
              <div className="space-y-4">
                {/* Status Alert if rejected */}
                {isDiscarded && candidate.selection?.rejectionReason && (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-rose-950">Postulante Descartado / No Apto</h4>
                      <p className="mt-0.5 font-semibold text-rose-800">
                        Motivo: <span className="font-bold">{candidate.selection.rejectionReason.reason}</span> ({candidate.selection.rejectionReason.stage})
                      </p>
                      {candidate.selection.rejectionReason.detail && (
                        <p className="text-2xs text-rose-700 mt-1 italic">
                          "{candidate.selection.rejectionReason.detail}"
                        </p>
                      )}
                      <p className="text-2xs text-slate-500 mt-1.5">
                        Registrado por {candidate.selection.rejectionReason.user} el {candidate.selection.rejectionReason.date}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-slate-50 md:grid-cols-4 md:divide-x md:divide-slate-200">
                  <div className="flex min-w-0 items-center gap-3 p-3"><Building2 className="h-4 w-4 shrink-0 text-[#143A56]" /><div className="min-w-0"><span className="block text-2xs text-slate-500">Convocatoria</span><strong className="block truncate text-xs text-slate-900">{campaignCode || candidate.jobProfile || candidate.campaignName || '—'}</strong>{campaignCode && (candidate.jobProfile || candidate.campaignName) && <span className="block truncate text-2xs text-slate-500">{candidate.jobProfile || candidate.campaignName}</span>}</div></div>
                  <div className="flex min-w-0 items-center gap-3 p-3"><User className="h-4 w-4 shrink-0 text-[#143A56]" /><div className="min-w-0"><span className="block text-2xs text-slate-500">Responsable</span><strong className="block truncate text-xs text-slate-900">{candidate.recruiterName || candidate.analystName || '—'}</strong></div></div>
                  <div className="flex min-w-0 items-center gap-3 p-3"><Sparkles className="h-4 w-4 shrink-0 text-[#143A56]" /><div className="min-w-0"><span className="block text-2xs text-slate-500">Fuente</span><strong className="block truncate text-xs text-slate-900">{candidate.source || '—'}</strong>{candidate.applicationDate && <span className="block text-2xs text-slate-500">{candidate.applicationDate}</span>}</div></div>
                  <div className="flex min-w-0 items-center gap-3 p-3"><TrendingUp className="h-4 w-4 shrink-0 text-[#143A56]" /><div className="min-w-0"><span className="block text-2xs text-slate-500">Etapa actual</span><span className="inline-flex rounded-md bg-sky-100 px-2 py-0.5 text-2xs font-bold text-sky-800">{compactStageLabels[currentStage] || currentStage}</span></div></div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
                  <span className="block font-semibold text-slate-500">Experiencia laboral declarada</span>
                  <p className="mt-1 whitespace-pre-wrap break-words font-semibold text-slate-900">{captureLoading ? 'Cargando respuestas…' : submittedExperience}</p>
                </div>

                {/* Pipeline visual stepper */}
                <div>
                  <h4 className="mb-2 text-2xs font-bold uppercase tracking-wider text-slate-600">
                    Pipeline
                  </h4>
                  <div className="flex min-w-[680px] items-start overflow-x-auto px-2 pb-1">
                    {stageFlow.map((step, idx) => {
                      const currentIdx = stageFlow.indexOf(currentStage);
                      const isCompleted = currentIdx > idx || currentStage === 'APTO_CAPACITACION';
                      const isCurrent = currentStage === step;

                      return (
                        <div key={step} className="relative flex flex-1 flex-col items-center text-center">
                          {idx > 0 && <span className={`absolute right-1/2 top-4 h-px w-full ${isCompleted || isCurrent ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                          <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${isCurrent ? 'border-sky-500 bg-sky-50 text-sky-800 ring-2 ring-sky-100' : isCompleted ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-400'}`}>{isCompleted ? <Check className="h-4 w-4" /> : idx + 1}</span>
                          <span className={`mt-1.5 text-2xs font-semibold ${isCurrent ? 'text-sky-800' : isCompleted ? 'text-emerald-700' : 'text-slate-500'}`}>{compactStageLabels[step] || step}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recent Traceability Preview */}
                <div>
                  <h4 className="mb-2 flex items-center justify-between text-2xs font-bold uppercase tracking-wider text-slate-600">
                    <span>Actividad reciente</span>
                    <button
                      onClick={() => setActiveTab('historial')}
                      className="flex items-center gap-1 text-2xs font-bold normal-case tracking-normal text-sky-700 hover:text-sky-900"
                    >
                      Ver historial
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </h4>

                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-1">
                    {(candidate.selection?.traceability || []).slice(-3).reverse().map((tr, idx, rows) => (
                      <div key={tr.id || `${tr.date}-${tr.time}-${idx}`} className="relative flex gap-3 py-2.5">
                        {idx < rows.length - 1 && <span className="absolute left-[7px] top-7 h-full w-px bg-slate-200" />}
                        <span className={`relative z-10 mt-1 h-4 w-4 shrink-0 rounded-full border-4 border-white ${idx === 0 ? 'bg-sky-600' : 'bg-emerald-500'}`} />
                        <div className="min-w-0 flex-1 border-b border-slate-100 pb-2.5"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-xs text-slate-900">{compactStageLabels[tr.previousStage as SelectionStage] || 'Inicio'} → {compactStageLabels[tr.newStage as SelectionStage] || tr.newStage}</strong><span className="mt-0.5 block text-2xs text-slate-500">{tr.user || 'Sistema'} · {tr.date} {tr.time}</span></div><span className="shrink-0 rounded bg-sky-50 px-2 py-0.5 text-2xs font-semibold text-sky-800">{compactStageLabels[tr.newStage as SelectionStage] || tr.newStage}</span></div></div>
                      </div>
                    ))}
                    {(candidate.selection?.traceability || []).length === 0 && <p className="py-8 text-center text-xs text-slate-500">Aún no hay movimientos registrados.</p>}
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: DATOS PERSONALES */}
            {activeTab === 'datos' && (
              <div className="space-y-6">
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <User className="w-4 h-4 text-sky-600" />
                    Información Personal & Contacto
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">Nombres Completos</span>
                      <strong className="text-slate-900 font-bold">{candidateName}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">DNI / Documento</span>
                      <strong className="text-slate-900 font-mono font-bold">{candidate.dni}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">Teléfono Móvil</span>
                      <strong className="text-slate-900 font-mono">{candidate.phone}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">Correo Electrónico</span>
                      <strong className="text-slate-900">{candidate.email}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">Distrito / Ciudad</span>
                      <strong className="text-slate-900">{candidate.district || candidate.city}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">Modalidad</span>
                      <strong className="text-slate-900">{submittedAnswers?.modality || candidate.workModality || 'Sin especificar'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">Horario / Jornada</span>
                      <strong className="text-slate-900">{submittedSchedule || candidate.workSchedule || 'Sin especificar'}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">Edad</span>
                      <strong className="text-slate-900">{submittedAnswers?.age || candidate.age || 'No informada'}{submittedAnswers?.age || candidate.age ? ' años' : ''}{candidate.birthDate ? ` (${candidate.birthDate})` : ''}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">Experiencia Laboral</span>
                      <strong className="whitespace-pre-wrap break-words text-slate-900">{captureLoading ? 'Cargando respuestas…' : submittedExperience}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">Nivel de Inglés</span>
                      <strong className="text-slate-900">{candidate.englishLevel || 'No informado'}</strong>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-2xs font-semibold">Currículum Vitae (CV)</span>
                      {(canAccessCandidateDocuments || ['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'].includes(currentUser.role)) ? <button
                          type="button"
                          disabled={cvDownloading}
                          onClick={() => void handleCvDownload()}
                          className="text-sky-600 hover:text-sky-800 font-bold flex items-center gap-1 mt-0.5 disabled:opacity-60"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {cvDownloading ? 'Descargando…' : 'Descargar CV'}
                          <ExternalLink className="w-3 h-3" />
                        </button> : <span className="mt-0.5 block text-2xs text-slate-500">Disponible en el expediente para roles autorizados.</span>}
                      {cvError && <span className="mt-1 block text-2xs font-medium text-rose-600">{cvError}</span>}
                    </div>
                  </div>
                </div>

                {['ADMIN', 'RECLUTADOR', 'ANALISTA_SELECCION', 'JEFE_SELECCION'].includes(currentUser.role) && <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <h4 className="text-sm font-bold text-[#0B2847]">Información declarada en el formulario de postulación</h4>
                  <p className="mt-1 text-xs text-slate-500">Cada registro muestra los datos enviados, todas las preguntas y respuestas originales, campos sin respuesta y adjuntos. El historial se conserva por fecha de captación.</p>
                  {captureLoading && <p className="mt-4 text-sm text-slate-500">Cargando respuestas…</p>}
                  {!captureLoading && captureIssue && <p role="status" className="mt-4 text-sm text-slate-500">{captureIssue}</p>}
                  {!captureLoading && !captureIssue && captureDossier && !captureEvents.length && <p className="mt-4 text-sm text-slate-500">Este candidato no tiene respuestas de captación registradas.</p>}
                  {!captureLoading && captureEvents.slice().reverse().map(event => <div key={event.id} className="mt-4 border-t border-slate-200 pt-3">
                    <p className="text-xs font-semibold text-slate-600">{event.source} · {new Date(event.createdAt).toLocaleDateString('es-PE')}</p>
                    <CaptureApplicantDetails event={event} />
                  </div>)}
                </section>}

                {candidate.observationsGeneral && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <span className="font-bold text-slate-700 block mb-1">Observaciones Generales de Registro:</span>
                    <p className="text-slate-800">{candidate.observationsGeneral}</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SEGUIMIENTO & CONTACTOS */}
            {activeTab === 'seguimiento' && (
              <div className="space-y-6">
                
                {/* Form to log new contact */}
                <form onSubmit={handleAddContact} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-sky-600" />
                    Registrar Nuevo Contacto / Gestión
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-2xs font-semibold text-slate-700 mb-1">
                        Canal de Contacto
                      </label>
                      <select
                        value={newContactType}
                        onChange={e => setNewContactType(e.target.value as ContactType)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                      >
                        <option value="LLAMADA">Llamada Telefónica</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="CORREO">Correo Electrónico</option>
                        <option value="ENTREVISTA">Entrevista Online</option>
                        <option value="PRESENCIAL">Presencial en Sede</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-2xs font-semibold text-slate-700 mb-1">
                        Resultado de la Gestión
                      </label>
                      <select
                        value={newContactOutcome}
                        onChange={e => setNewContactOutcome(e.target.value as ContactOutcome)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-bold"
                      >
                        <option value="CONTESTO">Contestó</option>
                        <option value="NO_CONTESTO">No contestó</option>
                        <option value="CITA_AGENDADA">Cita agendada</option>
                        <option value="RECHAZA_OFERTA">Rechaza oferta</option>
                        <option value="ASISTIO">Asistió</option>
                        <option value="BUZON">Buzón de voz</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-2xs font-semibold text-slate-700 mb-1">
                        Próximo Paso / Compromiso
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Entrevista mañana 10am"
                        value={newContactNextStep}
                        onChange={e => setNewContactNextStep(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                      >
                      </input>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-2xs font-semibold text-slate-700 mb-1">
                        Resumen de la Conversación / Notas *
                      </label>
                      <textarea
                        rows={2}
                        required
                        placeholder="Detalle de lo conversado con el postulante..."
                        value={newContactSummary}
                        onChange={e => setNewContactSummary(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Guardar Contacto
                    </button>
                  </div>
                </form>

                {/* Timeline of Contacts */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                    Historial de Interacciones ({candidate.selection?.contactHistory?.length || 0})
                  </h4>

                  {(!candidate.selection?.contactHistory || candidate.selection.contactHistory.length === 0) ? (
                    <div className="text-center py-6 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                      No hay contactos registrados aún para este postulante.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {candidate.selection.contactHistory.map((item, idx) => (
                        <div key={idx} className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-sky-100 text-sky-800">
                                {item.type}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                                item.outcome === 'CONTESTO' || item.outcome === 'CITA_AGENDADA' || item.outcome === 'ASISTIO'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {item.outcome}
                              </span>
                              <strong className="text-slate-800">{item.agentName}</strong>
                            </div>
                            <span className="text-2xs text-slate-500">{item.date} • {item.time}</span>
                          </div>

                          <p className="text-xs text-slate-700">{item.summary}</p>

                          {item.nextStep && (
                            <div className="text-2xs text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-sky-600 shrink-0" />
                              <span>Próximo paso: <strong>{item.nextStep}</strong></span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* TAB 4: ENTREVISTA */}
            {activeTab === 'entrevista' && (
              <div className="space-y-6">
                
                {/* Interview Form */}
                <form onSubmit={handleSaveInterview} className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-sky-600" />
                      Evaluación de Entrevista Individual
                    </h4>
                    {candidate.selection?.interviewResult && (
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        candidate.selection.interviewResult.status === 'APTO'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        Resultado: {candidate.selection.interviewResult.status}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Resultado de la Entrevista *
                      </label>
                      <select
                        value={interviewStatus}
                        onChange={e => setInterviewStatus(e.target.value as 'APTO' | 'NO_APTO')}
                        className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                      >
                        <option value="APTO">Apto</option>
                        <option value="NO_APTO">No Apto (Descartado)</option>
                      </select>
                    </div>

                    {interviewStatus === 'NO_APTO' && (
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-rose-700 mb-1">
                          Motivo del Descarte en Entrevista *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Ej: No cumple perfil de comunicación o no acepta horarios"
                          value={interviewReason}
                          onChange={e => setInterviewReason(e.target.value)}
                          className="w-full text-xs bg-white border border-rose-300 rounded-lg px-3 py-2 text-slate-800"
                        />
                      </div>
                    )}

                    <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-lg border border-slate-200">
                      <div>
                        <label className="block text-2xs font-semibold text-slate-600 mb-1">
                          Fluidez Verbal (1 a 5)
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={fluidezScore}
                          onChange={e => setFluidezScore(Number(e.target.value))}
                          className="w-full text-sky-600"
                        />
                        <span className="text-xs font-bold text-slate-800 block text-right">{fluidezScore} / 5</span>
                      </div>

                      <div>
                        <label className="block text-2xs font-semibold text-slate-600 mb-1">
                          Dicción & Modulación (1 a 5)
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={diccionScore}
                          onChange={e => setDiccionScore(Number(e.target.value))}
                          className="w-full text-sky-600"
                        />
                        <span className="text-xs font-bold text-slate-800 block text-right">{diccionScore} / 5</span>
                      </div>

                      <div>
                        <label className="block text-2xs font-semibold text-slate-600 mb-1">
                          Perfil Comercial / Empatía (1 a 5)
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={comercialScore}
                          onChange={e => setComercialScore(Number(e.target.value))}
                          className="w-full text-sky-600"
                        />
                        <span className="text-xs font-bold text-slate-800 block text-right">{comercialScore} / 5</span>
                      </div>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Conclusiones & Notas de la Entrevista
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Observaciones sobre postura, experiencia, motivación y ajuste al puesto..."
                        value={interviewNotes}
                        onChange={e => setInterviewNotes(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs"
                    >
                      Guardar Resultado de Entrevista
                    </button>
                  </div>
                </form>

              </div>
            )}

            {/* TAB 5: VERIFICACION TECNICA */}
            {activeTab === 'verificacion_tecnica' && (
              <div className="space-y-6">
                
                <form onSubmit={handleSaveTechVerif} className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Laptop className="w-4 h-4 text-sky-600" />
                      Ficha de Verificación Técnica (Home Office / Campaña)
                    </h4>
                    {candidate.selection?.technicalVerification && (
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        candidate.selection.technicalVerification.status === 'APRUEBA'
                          ? 'bg-emerald-100 text-emerald-800'
                          : candidate.selection.technicalVerification.status === 'APRUEBA_CON_OBSERVACION'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        Resultado: {candidate.selection.technicalVerification.status}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Dictamen Técnico *
                      </label>
                      <select
                        value={techStatus}
                        onChange={e => setTechStatus(e.target.value as 'APRUEBA' | 'APRUEBA_CON_OBSERVACION' | 'NO_APRUEBA')}
                        className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                      >
                        <option value="APRUEBA">Aprueba</option>
                        <option value="APRUEBA_CON_OBSERVACION">Aprueba con Observación</option>
                        <option value="NO_APRUEBA">No Aprueba (Descartado)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Velocidad Descarga (Mbps)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={techDownloadSpeed}
                        onChange={e => setTechDownloadSpeed(Number(e.target.value))}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Velocidad Subida (Mbps)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={techUploadSpeed}
                        onChange={e => setTechUploadSpeed(Number(e.target.value))}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Memoria RAM (GB)
                      </label>
                      <input
                        type="number"
                        min="2"
                        value={techRam}
                        onChange={e => setTechRam(Number(e.target.value))}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Procesador
                      </label>
                      <input
                        type="text"
                        value={techProcessor}
                        onChange={e => setTechProcessor(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Sistema Operativo
                      </label>
                      <input
                        type="text"
                        value={techOs}
                        onChange={e => setTechOs(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                      />
                    </div>

                    <div className="sm:col-span-3 flex flex-wrap gap-4 bg-white p-3 rounded-lg border border-slate-200 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={techHasHeadset}
                          onChange={e => setTechHasHeadset(e.target.checked)}
                          className="w-4 h-4 text-sky-600 rounded"
                        />
                        <span>Cuenta con Headset USB con cancelación de ruido</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={techQuietEnv}
                          onChange={e => setTechQuietEnv(e.target.checked)}
                          className="w-4 h-4 text-sky-600 rounded"
                        />
                        <span>Ambiente de trabajo privado y libre de ruidos externos</span>
                      </label>
                    </div>

                    {techStatus === 'APRUEBA_CON_OBSERVACION' && (
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-bold text-amber-800 mb-1">
                          Detalle Obligatorio de la Observación *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Ej: Compromiso de cambio a conexión por cable ethernet antes del Día 1"
                          value={techObservationDetail}
                          onChange={e => setTechObservationDetail(e.target.value)}
                          className="w-full text-xs bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-amber-950 font-semibold"
                        />
                      </div>
                    )}

                    <div className="sm:col-span-3">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Notas de Verificación Técnica
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Observaciones de capturas de speedtest o dxdiag..."
                        value={techNotes}
                        onChange={e => setTechNotes(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs"
                    >
                      Guardar Verificación Técnica
                    </button>
                  </div>
                </form>

              </div>
            )}

            {/* TAB 6: EVALUACIONES */}
            {activeTab === 'evaluaciones' && (
              <div className="space-y-6">
                
                {/* Form to add evaluation */}
                <form onSubmit={handleAddEvaluation} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Award className="w-4 h-4 text-sky-600" />
                    Registrar Resultado de Evaluación
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-2xs font-semibold text-slate-700 mb-1">
                        Nombre de la Prueba / Evaluación
                      </label>
                      <select
                        value={evalName}
                        onChange={e => setEvalName(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                      >
                        <option value="Prueba Psicométrica / Conductual">Prueba Psicométrica / Conductual</option>
                        <option value="Prueba de Velocidad de Digitación (WPM)">Prueba de Velocidad de Digitación (WPM)</option>
                        <option value="Simulación de Llamada / Roleplay Comercial">Simulación de Llamada / Roleplay Comercial</option>
                        <option value="Test de Conocimientos Básicos y Ortografía">Test de Conocimientos Básicos y Ortografía</option>
                        <option value="Evaluación Técnica de Sistemas">Evaluación Técnica de Sistemas</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-2xs font-semibold text-slate-700 mb-1">
                        Puntaje / Score (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={evalScore}
                        onChange={e => setEvalScore(Number(e.target.value))}
                        className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-2xs font-semibold text-slate-700 mb-1">
                        Dictamen
                      </label>
                      <select
                        value={evalResult}
                        onChange={e => setEvalResult(e.target.value as 'APTO' | 'NO_APTO' | 'PENDIENTE')}
                        className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                      >
                        <option value="APTO">Apto / Aprobado</option>
                        <option value="NO_APTO">No Apto / Reprobado</option>
                        <option value="PENDIENTE">Pendiente</option>
                      </select>
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-2xs font-semibold text-slate-700 mb-1">
                        Observaciones / Detalle
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: 42 WPM con 98% de precisión. Excelente rapidez."
                        value={evalObservation}
                        onChange={e => setEvalObservation(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar Evaluación
                    </button>
                  </div>
                </form>

                {/* List of evaluations */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Evaluaciones Registradas
                  </h4>

                  {((candidate.selection?.evaluationsList || candidate.selection?.evaluations || []).length === 0) ? (
                    <div className="text-center py-6 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                      No hay evaluaciones registradas aún para este postulante.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                      {(candidate.selection?.evaluationsList || candidate.selection?.evaluations || []).map((ev, idx) => (
                        <div key={idx} className="p-3.5 text-xs flex items-center justify-between gap-3">
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              <span>{ev.name}</span>
                              <span className={`text-2xs px-2 py-0.5 rounded-full font-bold ${
                                ev.result === 'APTO' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {ev.result}
                              </span>
                            </div>
                            {ev.observations && (
                              <p className="text-slate-600 mt-0.5">{ev.observations}</p>
                            )}
                            <div className="text-2xs text-slate-400 mt-1">
                              Evaluado por {ev.evaluator} el {ev.date}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-base font-extrabold text-slate-900">{ev.score}%</span>
                            <span className="text-2xs text-slate-500 block">Puntaje</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* TAB 7: DOCUMENTACIÓN PARA CONTRATACIÓN */}
            {activeTab === 'documentos' && (
              <DocumentacionContratacionTab candidate={candidate} />
            )}

            {/* TAB 8: HISTORIAL & TRAZABILIDAD */}
            {activeTab === 'historial' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <History className="w-4 h-4 text-sky-600" />
                    Bitácora de Trazabilidad Integral
                  </h4>
                  <span className="text-2xs text-slate-500">
                    Registro auditable inmutable de cada cambio de etapa y acción
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Fecha & Hora</th>
                        <th className="py-2.5 px-3">Usuario</th>
                        <th className="py-2.5 px-3">Transición de Etapa</th>
                        <th className="py-2.5 px-3">Observación / Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(candidate.selection?.traceability || []).map((tr, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-500 text-2xs font-mono whitespace-nowrap">
                            {tr.date} {tr.time}
                          </td>

                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {tr.user}
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 text-2xs">
                              <span className="text-slate-400 font-mono">{tr.previousStage}</span>
                              <span className="text-slate-400">→</span>
                              <span className="font-bold text-sky-700 font-mono">{tr.newStage}</span>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-slate-700">
                            {tr.observation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

          </div>

          {/* Footer Close */}
          <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-2.5">
            <span className="text-2xs font-medium text-slate-500">
              ID: <span className="font-mono font-bold text-slate-700">{candidate.id}</span>
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              Cerrar
            </button>
          </div>

        </div>
      </div>

      {/* Discard Modal */}
      <DiscardCandidateModal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        candidate={candidate}
      />
    </>
  );
};
