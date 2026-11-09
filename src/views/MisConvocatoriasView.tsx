import { TransferredCandidates } from '../components/candidates/CandidateTransfer';
import {InjectParticipantsModal} from '../components/training/InjectParticipantsModal';
import React, { useState } from 'react';
import { getWorkerErrorMessage } from '../services/workerApi';
import { IdentityAvatar } from '../components/common/IdentityAvatar';
import { 
  Building2, 
  Users, 
  Target, 
  Layers, 
  Share2, 
  BarChart3, 
  FileText, 
  Search, 
  Plus, 
  ArrowLeft, 
  PhoneCall, 
  Mail, 
  ChevronRight, 
  ArrowRight, 
  CheckCircle2, 
  UserX, 
  Sparkles, 
  Award, 
  Laptop, 
  DollarSign, 
  MapPin, 
  Clock, 
  Calendar,
  AlertTriangle,
  MoveRight,
  ExternalLink,
  Percent,
  TrendingUp,
  UserCheck,
  Phone,
  MessageCircle,
  Filter,
  Check,
  ChevronDown,
  List,
  Eye,
  RefreshCw,
  X,
  Copy,
  Link2,
  MoreVertical,
  Briefcase
} from 'lucide-react';
import { useTalent } from '../context/TalentContext';
import { CampaignCall, CandidateRecord, SelectionStage, LeadSourceType, ContactType, ContactOutcome } from '../types';
import { Candidate360Modal } from '../components/candidates/Candidate360Modal';
import { SelectionProcessConfiguration } from '../components/candidates/SelectionProcessConfiguration';
import { CandidateCreateModal } from '../components/modals/CandidateCreateModal';
import { DiscardCandidateModal } from '../components/modals/DiscardCandidateModal';
import { SourcesModal } from '../components/modals/SourcesModal';
import { CreateTrainingCohortModal } from '../components/modals/CreateTrainingCohortModal';
import { GraduationCap } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from 'recharts';

type SubTabType = 'candidatos' | 'kanban' | 'resumen' | 'fuentes' | 'indicadores' | 'proceso';

export const MisConvocatoriasView: React.FC = () => {
  const { 
    myAssignedCampaigns, 
    scopedCampaigns, 
    candidates, 
    currentUser, 
    selectedCampaignId, 
    setSelectedCampaignId,
    openCandidate360,
    selectedCandidateId,
    closeCandidate360,
    updateCandidateSelectionStage,
    markCandidateAptoCapacitacion,
    addCandidateContactHistory
  } = useTalent();

  // If Jefe, allow seeing all campaigns in Mis Convocatorias if none assigned specifically
  const availableCampaigns = currentUser.role === 'JEFE_SELECCION' ? scopedCampaigns : (myAssignedCampaigns.length > 0 ? myAssignedCampaigns : scopedCampaigns);

  // Selected Campaign State
  const activeCampaign = selectedCampaignId 
    ? availableCampaigns.find(c => c.id === selectedCampaignId) || availableCampaigns[0]
    : null;

  // Default to 'candidatos' (Listado ordenado con cambio de estado)
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>('candidatos');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [recruiterFilter, setRecruiterFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [overviewSearch, setOverviewSearch] = useState('');
  const [overviewStatus, setOverviewStatus] = useState('ALL');
  const [overviewCampaign, setOverviewCampaign] = useState('ALL');
  const [overviewLocation, setOverviewLocation] = useState('ALL');

  // Modals
  const [isCandidateCreateOpen, setIsCandidateCreateOpen] = useState(false);
  const [injectOpen,setInjectOpen]=useState(false);
  const [isCreateCohortModalOpen, setIsCreateCohortModalOpen] = useState(false);
  const [candidateToDiscard, setCandidateToDiscard] = useState<CandidateRecord | null>(null);
  const [isSourcesModalOpen, setIsSourcesModalOpen] = useState(false);
  
  // Quick Contact Modal State
  const [contactCandidate, setContactCandidate] = useState<CandidateRecord | null>(null);
  const [contactType, setContactType] = useState<ContactType>('LLAMADA');
  const [contactOutcome, setContactOutcome] = useState<ContactOutcome>('CONTESTO');
  const [contactSummary, setContactSummary] = useState('');
  const [contactNextStep, setContactNextStep] = useState('');

  const campaignCandidatesFor = (campaignId: string) => candidates.filter(candidate =>
    candidate.campaignId === campaignId && (currentUser.role !== 'RECLUTADOR' || candidate.recruiterId === currentUser.id)
  );
  const campaignMetrics = (campaign: CampaignCall) => {
    const rows = campaignCandidatesFor(campaign.id);
    const responsible = campaign.responsibles?.find(item => item.userId === currentUser.id);
    const target = responsible ? Number(responsible.target) : campaign.vacancies;
    const ingresos = rows.filter(candidate => candidate.currentStage === 'CONTRATADO' || candidate.selection?.hiringConfirmed).length;
    const aptos = rows.filter(candidate => candidate.selection?.stage === 'APTO_CAPACITACION' || ['CAPACITACION', 'OJT', 'APTO_ALTA', 'GESTION_TALENTO', 'CONTRATADO'].includes(candidate.currentStage)).length;
    return { target, ingresos, aptos, advance: target > 0 ? Math.round((ingresos / target) * 100) : 0 };
  };
  const statusLabel = (status: CampaignCall['status']) => ({
    EN_PROCESO: 'En proceso', PUBLICADO: 'Publicado', CERRADO: 'Cerrado', ANULADO: 'Anulado', ACTIVA: 'Activa', EN_PAUSA: 'En pausa',
  }[status] || status);
  const campaignCompanies = [...new Set(availableCampaigns.map(campaign => campaign.company || campaign.client).filter(Boolean))] as string[];
  const campaignLocations = [...new Set(availableCampaigns.map(campaign => campaign.location).filter(Boolean))];
  const filteredOverviewCampaigns = availableCampaigns.filter(campaign => {
    const query = overviewSearch.trim().toLowerCase();
    const searchable = [campaign.title, campaign.company, campaign.client, campaign.code, campaign.location].filter(Boolean).join(' ').toLowerCase();
    return (!query || searchable.includes(query))
      && (overviewStatus === 'ALL' || campaign.status === overviewStatus)
      && (overviewCampaign === 'ALL' || (campaign.company || campaign.client) === overviewCampaign)
      && (overviewLocation === 'ALL' || campaign.location === overviewLocation);
  });
  const overviewMetrics = availableCampaigns.reduce((summary, campaign) => {
    const metrics = campaignMetrics(campaign);
    summary.vacancies += metrics.target;
    summary.aptos += metrics.aptos;
    summary.ingresos += metrics.ingresos;
    if (['EN_PROCESO', 'PUBLICADO', 'ACTIVA'].includes(campaign.status)) summary.active += 1;
    return summary;
  }, { active: 0, vacancies: 0, aptos: 0, ingresos: 0 });

  // Candidates belonging to current active campaign
  const campaignCandidates = activeCampaign 
    ? candidates.filter(c => c.campaignId === activeCampaign.id)
    : [];

  const filteredCampaignCandidates = campaignCandidates.filter(c => {
    if (candidateSearch) {
      const q = candidateSearch.toLowerCase();
      const match = c.fullName.toLowerCase().includes(q) ||
                    c.dni.includes(q) ||
                    c.phone.includes(q) ||
                    c.email.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (stageFilter !== 'ALL') {
      if (stageFilter === 'DESCARTADO') {
        if (c.currentStage !== 'DESCARTADO' && c.selection?.stage !== 'DESCARTADO' && c.selection?.status !== 'NO_APTO') {
          return false;
        }
      } else if (c.selection?.stage !== stageFilter || c.currentStage === 'DESCARTADO') {
        return false;
      }
    }
    if (recruiterFilter !== 'ALL' && c.recruiterId !== recruiterFilter) {
      return false;
    }
    if (sourceFilter !== 'ALL' && c.source !== sourceFilter) {
      return false;
    }
    return true;
  });

  // Stage Options with colors and labels
  const STAGES_CONFIG: { id: SelectionStage; title: string; colorBadge: string; iconBg: string }[] = [
    { id: 'NUEVO', title: 'Nuevo Postulante', colorBadge: 'bg-slate-100 text-slate-800 border-slate-300', iconBg: 'bg-slate-500' },
    { id: 'CONTACTADO', title: 'Contactado', colorBadge: 'bg-sky-100 text-sky-800 border-sky-300', iconBg: 'bg-sky-500' },
    { id: 'ENTREVISTA', title: 'Entrevista', colorBadge: 'bg-blue-100 text-blue-800 border-blue-300', iconBg: 'bg-blue-600' },
    { id: 'VERIFICACION_TECNICA', title: 'Verif. Técnica', colorBadge: 'bg-indigo-100 text-indigo-800 border-indigo-300', iconBg: 'bg-indigo-600' },
    { id: 'EVALUACIONES', title: 'Evaluaciones', colorBadge: 'bg-purple-100 text-purple-800 border-purple-300', iconBg: 'bg-purple-600' },
    { id: 'APTO_CAPACITACION', title: 'Apto Capacitación', colorBadge: 'bg-emerald-100 text-emerald-800 border-emerald-300', iconBg: 'bg-emerald-600' },
    { id: 'DESCARTADO', title: 'Descartado / No Apto', colorBadge: 'bg-rose-100 text-rose-800 border-rose-300', iconBg: 'bg-rose-600' },
  ];

  // Stage sequence for quick advance
  const STAGE_SEQUENCE: SelectionStage[] = [
    'NUEVO',
    'CONTACTADO',
    'ENTREVISTA',
    'VERIFICACION_TECNICA',
    'EVALUACIONES',
    'APTO_CAPACITACION'
  ];

  // Quick Advance Handler
  const handleQuickAdvance = (candidate: CandidateRecord) => {
    const currentIdx = STAGE_SEQUENCE.indexOf(candidate.selection?.stage || 'NUEVO');
    if (currentIdx >= 0 && currentIdx < STAGE_SEQUENCE.length - 1) {
      const nextStage = STAGE_SEQUENCE[currentIdx + 1];
      updateCandidateSelectionStage(
        candidate.id,
        nextStage,
        undefined,
        undefined,
        `Avance de etapa a ${nextStage} desde lista de postulantes`
      );
    }
  };

  // Direct Stage Change Handler from Dropdown
  const handleStageSelectChange = (candidate: CandidateRecord, newStage: SelectionStage) => {
    if (newStage === 'DESCARTADO') {
      setCandidateToDiscard(candidate);
      return;
    }
    if (newStage === 'APTO_CAPACITACION') {
      void markCandidateAptoCapacitacion(candidate.id, 'Marcado como Apto desde selector de estado').catch(error=>alert(getWorkerErrorMessage(error)));
      return;
    }
    updateCandidateSelectionStage(
      candidate.id,
      newStage,
      undefined,
      undefined,
      `Cambio manual de etapa a ${newStage} por ${currentUser.name}`
    ).catch(error=>alert(getWorkerErrorMessage(error)));
  };

  // Quick Contact Save Handler
  const handleSaveQuickContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactCandidate) return;

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    addCandidateContactHistory(contactCandidate.id, {
      date: dateStr,
      time: timeStr,
      type: contactType,
      outcome: contactOutcome,
      summary: contactSummary.trim() || `Contacto registrado vía ${contactType}`,
      agentName: currentUser.name,
      nextStep: contactNextStep.trim() || undefined
    });

    // If candidate was in 'NUEVO', advance automatically to 'CONTACTADO' if outcome is positive
    if (contactCandidate.selection?.stage === 'NUEVO' && (contactOutcome === 'CONTESTO' || contactOutcome === 'CITA_AGENDADA')) {
      updateCandidateSelectionStage(
        contactCandidate.id,
        'CONTACTADO',
        undefined,
        undefined,
        `Postulante contactado exitosamente por ${currentUser.name}.`
      );
    }

    // Reset modal
    setContactCandidate(null);
    setContactSummary('');
    setContactNextStep('');
  };

  // If no campaign selected, render the assigned campaigns overview.
  if (!activeCampaign) {
    return (
      <div className="pipeline-overview space-y-5 pb-12">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Mis Convocatorias Asignadas</h1>
          <p className="mt-1 text-sm text-slate-500">Gestiona candidatos, avance de etapas y cumplimiento de cuotas.</p>
        </header>

        <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-slate-200" aria-label="Resumen de convocatorias">
          {[
            { label: 'Convocatorias activas', value: overviewMetrics.active, icon: FileText, tone: 'text-sky-700 bg-sky-50' },
            { label: 'Vacantes asignadas', value: overviewMetrics.vacancies, icon: Users, tone: 'text-slate-700 bg-slate-100' },
            { label: 'Candidatos aptos', value: overviewMetrics.aptos, icon: UserCheck, tone: 'text-emerald-700 bg-emerald-50' },
            { label: 'Ingresos realizados', value: overviewMetrics.ingresos, icon: BarChart3, tone: 'text-violet-700 bg-violet-50' },
          ].map(({ label, value, icon: Icon, tone }) => <div key={label} className="flex items-center gap-3 px-5 py-4 sm:border-b sm:border-slate-100 xl:border-b-0">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
            <div><strong className="block text-2xl leading-none text-slate-950">{value}</strong><span className="mt-1 block text-xs text-slate-500">{label}</span></div>
          </div>)}
        </section>

        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs lg:grid-cols-[minmax(220px,1fr)_160px_180px_180px_auto]">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={overviewSearch} onChange={event => setOverviewSearch(event.target.value)} placeholder="Buscar por convocatoria, cargo o código..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white" /></label>
          <label className="relative"><span className="absolute left-3 top-1.5 text-2xs font-semibold text-slate-500">Estado</span><select value={overviewStatus} onChange={event => setOverviewStatus(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pb-0 pt-3.5 text-xs font-semibold text-slate-700 outline-none"><option value="ALL">Todos</option>{['EN_PROCESO', 'PUBLICADO', 'ACTIVA', 'EN_PAUSA', 'CERRADO', 'ANULADO'].map(status => <option key={status} value={status}>{statusLabel(status as CampaignCall['status'])}</option>)}</select><ChevronDown className="pointer-events-none absolute bottom-2.5 right-3 h-4 w-4 text-slate-500" /></label>
          <label className="relative"><span className="absolute left-3 top-1.5 text-2xs font-semibold text-slate-500">Campaña</span><select value={overviewCampaign} onChange={event => setOverviewCampaign(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pb-0 pt-3.5 text-xs font-semibold text-slate-700 outline-none"><option value="ALL">Todas</option>{campaignCompanies.map(company => <option key={company} value={company}>{company}</option>)}</select><ChevronDown className="pointer-events-none absolute bottom-2.5 right-3 h-4 w-4 text-slate-500" /></label>
          <label className="relative"><span className="absolute left-3 top-1.5 text-2xs font-semibold text-slate-500">Sede</span><select value={overviewLocation} onChange={event => setOverviewLocation(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pb-0 pt-3.5 text-xs font-semibold text-slate-700 outline-none"><option value="ALL">Todas</option>{campaignLocations.map(location => <option key={location} value={location}>{location}</option>)}</select><ChevronDown className="pointer-events-none absolute bottom-2.5 right-3 h-4 w-4 text-slate-500" /></label>
          <button type="button" onClick={() => { setOverviewSearch(''); setOverviewStatus('ALL'); setOverviewCampaign('ALL'); setOverviewLocation('ALL'); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"><Filter className="h-4 w-4" />Limpiar</button>
        </section>

        <section className="space-y-3" aria-label="Convocatorias asignadas">
          {filteredOverviewCampaigns.map(camp => {
            const { target, ingresos, aptos, advance } = campaignMetrics(camp);
            const deadline = camp.endDate ? new Date(`${camp.endDate}T12:00:00`) : null;
            const daysLeft = deadline && !Number.isNaN(deadline.getTime())
              ? Math.ceil((deadline.getTime() - Date.now()) / 86_400_000)
              : null;
            const risk = advance >= 100
              ? 'BAJO'
              : daysLeft !== null && (daysLeft < 0 || (daysLeft <= 7 && advance < 70))
                ? 'ALTO'
                : (daysLeft !== null && daysLeft <= 15) || advance < 40
                  ? 'MEDIO'
                  : 'BAJO';
            const positiveStatus = ['PUBLICADO', 'EN_PROCESO', 'ACTIVA'].includes(camp.status);
            const attentionStatus = camp.status === 'EN_PAUSA';

            return (
              <article
                key={camp.id}
                onClick={() => setSelectedCampaignId(camp.id)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedCampaignId(camp.id); } }}
                role="button"
                tabIndex={0}
                className="group grid cursor-pointer gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs transition hover:border-sky-300 hover:shadow-sm xl:grid-cols-[minmax(300px,0.9fr)_minmax(420px,1.35fr)_220px] xl:items-center"
              >
                <div className="min-w-0 border-b border-slate-100 pb-4 xl:border-b-0 xl:border-r xl:pb-0 xl:pr-5">
                  <div className="mb-3 flex items-start justify-between gap-3 xl:hidden"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold ${positiveStatus ? 'bg-emerald-50 text-emerald-700' : attentionStatus ? 'bg-amber-50 text-amber-700' : camp.status === 'ANULADO' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}><span className={`h-1.5 w-1.5 rounded-full ${positiveStatus ? 'bg-emerald-500' : attentionStatus ? 'bg-amber-500' : camp.status === 'ANULADO' ? 'bg-rose-500' : 'bg-slate-400'}`} />{statusLabel(camp.status)}</span></div>
                  <div className="flex gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Building2 className="h-5 w-5" /></span><div className="min-w-0"><h2 className="truncate text-lg font-bold text-slate-950 group-hover:text-sky-800">{camp.company || camp.client || camp.title}</h2><p className="mt-0.5 text-sm font-semibold text-slate-700">{camp.title}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{camp.location || 'Sede sin definir'}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><FileText className="h-3.5 w-3.5" />{camp.code}</p></div></div>
                </div>
                <div className="min-w-0 space-y-4">
                  <div className="grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-4"><div className="px-3 first:pl-0"><span className="text-2xs text-slate-500">Meta</span><strong className="mt-1 block text-lg leading-none text-slate-950">{target}</strong></div><div className="px-3"><span className="text-2xs text-slate-500">Aptos</span><strong className="mt-1 block text-lg leading-none text-emerald-700">{aptos}</strong></div><div className="px-3"><span className="text-2xs text-slate-500">Ingresos</span><strong className="mt-1 block text-lg leading-none text-sky-800">{ingresos}</strong></div><div className="px-3"><span className="text-2xs text-slate-500">Avance</span><strong className="mt-1 block text-lg leading-none text-slate-950">{advance}%</strong></div></div>
                  <div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${advance >= 100 ? 'bg-emerald-500' : advance >= 50 ? 'bg-sky-600' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, advance)}%` }} /></div><span className="text-xs font-bold text-slate-700">{advance}%</span></div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{daysLeft === null ? 'Sin fecha límite' : daysLeft < 0 ? `Vencida hace ${Math.abs(daysLeft)} días` : `Vence en ${daysLeft} días`}</span><span className={`inline-flex items-center gap-1.5 font-semibold ${risk === 'ALTO' ? 'text-rose-700' : risk === 'MEDIO' ? 'text-amber-700' : 'text-emerald-700'}`}><span className={`h-1.5 w-1.5 rounded-full ${risk === 'ALTO' ? 'bg-rose-500' : risk === 'MEDIO' ? 'bg-amber-500' : 'bg-emerald-500'}`} />Prioridad {risk === 'BAJO' ? 'baja' : risk === 'MEDIO' ? 'media' : 'alta'}</span></div>
                </div>
                <div className="flex items-center justify-between gap-3 xl:flex-col xl:items-end"><span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold xl:inline-flex ${positiveStatus ? 'bg-emerald-50 text-emerald-700' : attentionStatus ? 'bg-amber-50 text-amber-700' : camp.status === 'ANULADO' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}><span className={`h-1.5 w-1.5 rounded-full ${positiveStatus ? 'bg-emerald-500' : attentionStatus ? 'bg-amber-500' : camp.status === 'ANULADO' ? 'bg-rose-500' : 'bg-slate-400'}`} />{statusLabel(camp.status)}</span><button type="button" onClick={event => { event.stopPropagation(); setSelectedCampaignId(camp.id); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0C2745] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#154E7D]"><span>Abrir pipeline</span><ArrowRight className="h-4 w-4" /></button></div>
              </article>
            );
          })}
          {!filteredOverviewCampaigns.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center text-sm text-slate-500">No hay convocatorias que coincidan con los filtros.</div>}
        </section>
      </div>
    );
  }

  // Inside Selected Convocatoria Workspace
  const totalRQ = activeCampaign.vacancies || 1;
  const myResp = activeCampaign.responsibles?.find(r => r.userId === currentUser.id);
  const myMeta = myResp ? Number(myResp.target) : totalRQ;
  const hiredCount = campaignCandidates.filter(c => c.currentStage === 'CONTRATADO' || c.selection?.hiringConfirmed).length;
  const aptosCount = campaignCandidates.filter(c => c.selection?.stage === 'APTO_CAPACITACION' || c.currentStage === 'CAPACITACION' || c.currentStage === 'CONTRATADO').length;
  const descartadosCount = campaignCandidates.filter(c => c.currentStage === 'DESCARTADO' || c.selection?.stage === 'DESCARTADO' || c.selection?.status === 'NO_APTO').length;
  const enProcesoCount = campaignCandidates.length - aptosCount - descartadosCount;
  const cumplimientoPct = myMeta > 0 ? Math.round((aptosCount / myMeta) * 100) : 0;
  const pendingCount = Math.max(0, myMeta - aptosCount);
  const stageOrder: SelectionStage[] = ['NUEVO', 'CONTACTADO', 'ENTREVISTA', 'VERIFICACION_TECNICA', 'EVALUACIONES', 'APTO_CAPACITACION'];
  const stageChipLabels: Partial<Record<SelectionStage, string>> = {
    NUEVO: 'Nuevo',
    CONTACTADO: 'Contactado',
    ENTREVISTA: 'Entrevista',
    VERIFICACION_TECNICA: 'Verificación',
    EVALUACIONES: 'Evaluación',
    APTO_CAPACITACION: 'Apto',
    DESCARTADO: 'Descartado',
  };
  const funnelData = stageOrder.map((stage, stageIndex) => ({
    name: STAGES_CONFIG.find(item => item.id === stage)?.title || stage,
    cantidad: campaignCandidates.filter(candidate => {
      const currentIndex = stageOrder.indexOf(candidate.selection?.stage || 'NUEVO');
      const downstream = ['CAPACITACION', 'OJT', 'APTO_ALTA', 'GESTION_TALENTO', 'CONTRATADO'].includes(candidate.currentStage);
      return downstream || currentIndex >= stageIndex;
    }).length,
  }));
  const totalSourcesLeads = (activeCampaign.sources || []).reduce((sum, source) => sum + Number(source.leadsCount || 0), 0);
  const sourceRows = (activeCampaign.sources || []).map(source => {
    const sourceCandidates = campaignCandidates.filter(candidate => candidate.source === source.sourceName);
    const sourceAptos = sourceCandidates.filter(candidate => candidate.selection?.stage === 'APTO_CAPACITACION' || ['CAPACITACION', 'OJT', 'APTO_ALTA', 'GESTION_TALENTO', 'CONTRATADO'].includes(candidate.currentStage)).length;
    return { ...source, conversion: source.leadsCount > 0 ? Math.round((sourceAptos / source.leadsCount) * 100) : 0 };
  });
  const activeSources = sourceRows.filter(source => source.isEnabled);
  const averageSourceConversion = activeSources.length ? Math.round(activeSources.reduce((sum, source) => sum + source.conversion, 0) / activeSources.length) : 0;
  const bestSource = [...sourceRows].sort((a, b) => b.conversion - a.conversion)[0];
  const validApplications = campaignCandidates.map(candidate => new Date(candidate.applicationDate)).filter(date => !Number.isNaN(date.getTime()));
  const averageProcessDays = validApplications.length ? Math.round(validApplications.reduce((sum, date) => sum + Math.max(0, (Date.now() - date.getTime()) / 86_400_000), 0) / validApplications.length * 10) / 10 : null;
  const conversionTotal = campaignCandidates.length ? Math.round((aptosCount / campaignCandidates.length) * 100) : 0;
  const discardRate = campaignCandidates.length ? Math.round((descartadosCount / campaignCandidates.length) * 1000) / 10 : 0;
  const weeklyEvolution = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const rows = campaignCandidates.filter(candidate => candidate.applicationDate?.slice(0, 10) === key);
    return { day: date.toLocaleDateString('es-PE', { weekday: 'short' }), postulantes: rows.length, aptos: rows.filter(candidate => candidate.selection?.stage === 'APTO_CAPACITACION').length };
  });
  const hasWeeklyData = weeklyEvolution.some(item => item.postulantes > 0 || item.aptos > 0);
  const stageConversionData = funnelData.slice(1).map((item, index) => ({
    name: item.name,
    conversion: funnelData[index].cantidad > 0 ? Math.round((item.cantidad / funnelData[index].cantidad) * 100) : 0,
  }));
  const stageDurationData = stageOrder.map(stage => {
    const durations = campaignCandidates.flatMap(candidate => {
      const history = [...(candidate.selection?.traceability || [])].sort((a, b) =>
        `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`)
      );
      return history.flatMap((entry, index) => {
        if (entry.newStage !== stage) return [];
        const start = new Date(`${entry.date}T${entry.time || '00:00'}`);
        const nextEntry = history[index + 1];
        const end = nextEntry ? new Date(`${nextEntry.date}T${nextEntry.time || '00:00'}`) : new Date();
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
        return [Math.max(0, (end.getTime() - start.getTime()) / 86_400_000)];
      });
    });
    return {
      name: STAGES_CONFIG.find(item => item.id === stage)?.title || stage,
      dias: durations.length ? Math.round((durations.reduce((sum, days) => sum + days, 0) / durations.length) * 10) / 10 : null,
    };
  });
  const hasStageDurationData = stageDurationData.some(item => item.dias !== null);
  const campaignDeadline = activeCampaign.endDate ? new Date(`${activeCampaign.endDate}T12:00:00`) : null;
  const campaignDaysLeft = campaignDeadline && !Number.isNaN(campaignDeadline.getTime()) ? Math.ceil((campaignDeadline.getTime() - Date.now()) / 86_400_000) : null;
  const roleLabel = (role: string) => ({
    JEFE_SELECCION: 'Jefe de Selección',
    ANALISTA_SELECCION: 'Analista de Selección',
    RECLUTADOR: 'Reclutador',
    ADMIN: 'Administrador',
  }[role] || role.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase()));

  // Distinct sources and recruiters for filters
  const availableSources = Array.from(new Set(campaignCandidates.map(c => c.source))).filter(Boolean);
  const availableRecruiters = Array.from(new Set(campaignCandidates.map(c => c.recruiterName))).filter(Boolean);

  return (
    <div className="campaign-workspace space-y-4 pb-10">
      
      {/* Top Workspace Header */}
      <div className="campaign-workspace-header sticky top-0 z-10 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedCampaignId(null)}
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors cursor-pointer"
              title="Volver al listado de convocatorias"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-slate-900">
                <span className="text-sm font-bold">{activeCampaign.code}</span>
                <span className="text-slate-400">•</span>
                <h2 className="text-sm font-bold">{activeCampaign.title}</h2>
              </div>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                {activeCampaign.company || activeCampaign.client} • {activeCampaign.location} • <span className="font-semibold text-slate-700">{activeCampaign.managementType}</span>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold ${activeCampaign.status === 'EN_PROCESO' || activeCampaign.status === 'PUBLICADO' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{activeCampaign.status === 'EN_PROCESO' ? 'En proceso' : activeCampaign.status === 'PUBLICADO' ? 'Publicado' : activeCampaign.status}</span>
            <span className={`flex items-center gap-1 text-2xs font-semibold ${campaignDaysLeft !== null && campaignDaysLeft <= 7 ? 'text-rose-600' : 'text-slate-500'}`}><Calendar className="h-3.5 w-3.5" />{campaignDaysLeft === null ? 'Sin fecha límite' : campaignDaysLeft < 0 ? `Vencida hace ${Math.abs(campaignDaysLeft)} días` : `Vence en ${campaignDaysLeft} días`}</span>
            <button
              type="button"
              onClick={() => setIsCandidateCreateOpen(true)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4 text-sky-400" />
              <span>Registrar Postulante</span>
            </button>
            <details className="group relative">
              <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 [&::-webkit-details-marker]:hidden" title="Más acciones"><MoreVertical className="h-4 w-4" /></summary>
              <div className="absolute right-0 top-10 z-30 w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                <button type="button" onClick={() => setIsCreateCohortModalOpen(true)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50" title="Crear grupo de capacitación con los postulantes aptos"><GraduationCap className="h-3.5 w-3.5" />Crear capacitación{aptosCount > 0 && <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-2xs">{aptosCount}</span>}</button>
                {['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION'].includes(currentUser.role)&&<button type="button" onClick={()=>setInjectOpen(true)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"><Users className="h-3.5 w-3.5"/>Inyectar a capacitación existente</button>}
              </div>
            </details>
          </div>
        </div>

        {/* Sub-tabs Navigation */}
        <div className="flex items-center gap-1 border-t border-slate-200 px-3 overflow-x-auto custom-scrollbar">
          {[
            { id: 'candidatos', label: 'Lista', icon: List },
            { id: 'kanban', label: 'Kanban', icon: Layers },
            { id: 'resumen', label: 'Resumen', icon: FileText },
            { id: 'fuentes', label: 'Fuentes', icon: Share2 },
            { id: 'indicadores', label: 'Métricas', icon: BarChart3 },
            { id: 'proceso', label: 'Proceso y plantillas', icon: FileText },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as SubTabType)}
                className={`relative px-4 py-3 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                  isActive
                    ? 'text-sky-800 border-sky-700'
                    : 'text-slate-500 hover:text-slate-900 border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-sky-600' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

      </div>

      {/* SUBTAB 1 (PRIMARY): LISTADO DE POSTULANTES Y CAMBIO DE ESTADO */}
      {activeSubTab === 'proceso' && activeCampaign && <SelectionProcessConfiguration campaignId={activeCampaign.id} />}
      {activeSubTab === 'candidatos' && (
        <div className="space-y-5">
          
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-slate-200">
            {[
              { label: 'Meta', value: myMeta, detail: 'cupos', Icon: Target, tone: 'text-sky-800', iconBg: 'bg-sky-50' },
              { label: 'Postulantes', value: campaignCandidates.length, detail: 'total', Icon: Users, tone: 'text-slate-900', iconBg: 'bg-slate-100' },
              { label: 'En proceso', value: enProcesoCount, detail: `${campaignCandidates.length ? Math.round((enProcesoCount / campaignCandidates.length) * 100) : 0}%`, Icon: Clock, tone: 'text-sky-800', iconBg: 'bg-sky-50' },
              { label: 'Aptos', value: aptosCount, detail: `/ ${myMeta}`, Icon: CheckCircle2, tone: 'text-emerald-700', iconBg: 'bg-emerald-50' },
              { label: 'Pendientes', value: pendingCount, detail: 'restantes', Icon: Percent, tone: 'text-slate-900', iconBg: 'bg-slate-100' },
              { label: 'Descartados', value: descartadosCount, detail: `${campaignCandidates.length ? Math.round((descartadosCount / campaignCandidates.length) * 100) : 0}%`, Icon: UserX, tone: 'text-rose-700', iconBg: 'bg-rose-50' },
            ].map(({ label, value, detail, Icon, tone, iconBg }) => (
              <div key={label} className="flex items-center gap-3 p-3.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBg}`}><Icon className={`h-4 w-4 ${tone}`} /></span>
                <div className="min-w-0"><span className="block text-2xs font-semibold text-slate-500">{label}</span><div className="mt-0.5 flex items-baseline gap-1.5"><strong className={`text-base ${tone}`}>{value}</strong><span className="truncate text-2xs text-slate-500">{detail}</span></div></div>
              </div>
            ))}
          </div>

          {/* Stage Filter Chips */}
          <div className="flex flex-wrap items-center gap-2 px-1">
            <span className="mr-1 text-xs font-semibold text-slate-700">
              Etapa:
            </span>

            <button
              type="button"
              onClick={() => setStageFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                stageFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>Todas</span>
              <span className={`text-2xs px-1.5 py-0.2 rounded-full ${stageFilter === 'ALL' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {campaignCandidates.length}
              </span>
            </button>

            {STAGES_CONFIG.map(st => {
              const count = campaignCandidates.filter(c => {
                if (st.id === 'DESCARTADO') {
                  return c.currentStage === 'DESCARTADO' || c.selection?.stage === 'DESCARTADO' || c.selection?.status === 'NO_APTO';
                }
                return c.selection?.stage === st.id && c.currentStage !== 'DESCARTADO';
              }).length;

              const isSelected = stageFilter === st.id;

              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStageFilter(st.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-sky-700 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${st.iconBg}`} />
                  <span>{stageChipLabels[st.id] || st.title}</span>
                  <span className={`text-2xs px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-sky-900 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search & Extra Filters Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar postulante..."
                value={candidateSearch}
                onChange={e => setCandidateSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
              />
              {candidateSearch && (
                <button
                  onClick={() => setCandidateSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-2xs text-slate-500 font-semibold ml-2">
                Mostrando <strong className="text-slate-900">{filteredCampaignCandidates.length}</strong> de {campaignCandidates.length}
              </span>
              {(availableRecruiters.length > 1 || availableSources.length > 0) && (
                <details className="group relative">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-sky-800 hover:bg-sky-50 [&::-webkit-details-marker]:hidden"><Filter className="h-3.5 w-3.5" />Filtros</summary>
                  <div className="absolute right-0 top-10 z-20 w-60 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                    {availableRecruiters.length > 1 && <select value={recruiterFilter} onChange={e => setRecruiterFilter(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700"><option value="ALL">Todos los responsables</option>{availableRecruiters.map(recruiter => <option key={recruiter} value={recruiter}>{recruiter}</option>)}</select>}
                    {availableSources.length > 0 && <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700"><option value="ALL">Todas las fuentes</option>{availableSources.map(source => <option key={source} value={source}>{source}</option>)}</select>}
                  </div>
                </details>
              )}
            </div>

          </div>

          {/* Tabla operativa compacta */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[1080px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">Postulante</th>
                    <th className="px-3 py-2.5">Contacto</th>
                    <th className="px-3 py-2.5">Fuente</th>
                    <th className="px-3 py-2.5">Etapa</th>
                    <th className="px-3 py-2.5">Responsable</th>
                    <th className="px-3 py-2.5">Próxima acción</th>
                    <th className="px-3 py-2.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCampaignCandidates.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500"><div className="flex flex-col items-center"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100"><Users className="h-6 w-6 text-slate-500" /></span><strong className="text-xs text-slate-900">No se encontraron postulantes</strong><span className="mt-1 text-2xs">Intenta cambiar los filtros o el término de búsqueda.</span></div></td></tr>
                  ) : filteredCampaignCandidates.map(cand => {
                    const isApto = cand.selection?.stage === 'APTO_CAPACITACION';
                    const isDescartado = cand.currentStage === 'DESCARTADO' || cand.selection?.stage === 'DESCARTADO' || cand.selection?.status === 'NO_APTO';
                    const currentStage = cand.selection?.stage || 'NUEVO';
                    const cleanPhone = cand.phone.replace(/[^0-9]/g, '');
                    const latestContact = cand.selection?.contactHistory?.[cand.selection.contactHistory.length - 1];
                    return (
                      <tr key={cand.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <IdentityAvatar src={cand.avatarUrl} name={cand.fullName} className="h-8 w-8 rounded-full border border-slate-200 text-2xs" />
                            <div className="min-w-0">
                              <button type="button" onClick={() => openCandidate360(cand.id)} className="block max-w-[170px] truncate font-semibold text-slate-900 hover:text-sky-700">{cand.fullName}</button>
                              <span className="text-2xs text-slate-500">DNI {cand.dni}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <a href={`https://wa.me/${cleanPhone.startsWith('51') ? cleanPhone : `51${cleanPhone}`}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-emerald-700"><MessageCircle className="h-3 w-3" />{cand.phone}</a>
                          <span className="block max-w-[150px] truncate text-2xs text-slate-500">{cand.email}</span>
                        </td>
                        <td className="px-3 py-2.5"><span className="rounded-md bg-slate-100 px-2 py-1 text-2xs font-medium text-slate-700">{cand.source}</span></td>
                        <td className="px-3 py-2.5">
                          <div className="relative max-w-[180px]">
                            <select value={isDescartado ? 'DESCARTADO' : currentStage} onChange={event => handleStageSelectChange(cand, event.target.value as SelectionStage)} className={`w-full appearance-none rounded-lg border px-2.5 py-1.5 pr-7 text-2xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500 ${isDescartado ? 'border-rose-200 bg-rose-50 text-rose-700' : isApto ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-sky-200 bg-sky-50 text-sky-800'}`}>
                              {STAGES_CONFIG.map(stage => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2" />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-700">{cand.recruiterName || 'Sin asignar'}</td>
                        <td className="px-3 py-2.5">
                          <span className="block max-w-[170px] truncate font-medium text-slate-700">{latestContact?.nextStep || (isApto ? 'Preparar capacitación' : isDescartado ? 'Sin acción pendiente' : 'Seguimiento pendiente')}</span>
                          <span className="text-2xs text-slate-500">{latestContact?.nextStepDate || 'Sin fecha definida'}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => setContactCandidate(cand)} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-sky-50 hover:text-sky-700" title="Registrar contacto"><PhoneCall className="h-3.5 w-3.5" /></button>
                            {!isDescartado && !isApto && <button type="button" onClick={() => handleQuickAdvance(cand)} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-sky-50 hover:text-sky-700" title="Avanzar etapa"><ArrowRight className="h-3.5 w-3.5" /></button>}
                            {!isDescartado && <button type="button" onClick={() => setCandidateToDiscard(cand)} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-700" title="Descartar"><UserX className="h-3.5 w-3.5" /></button>}
                            {isDescartado && <button type="button" onClick={() => updateCandidateSelectionStage(cand.id, 'NUEVO', undefined, undefined, 'Reactivación de candidato')} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-sky-50" title="Reactivar"><RefreshCw className="h-3.5 w-3.5" /></button>}
                            <button type="button" onClick={() => openCandidate360(cand.id)} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-sky-50 hover:text-sky-700" title="Ver ficha"><Eye className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {activeCampaign && <TransferredCandidates campaignId={activeCampaign.id} />}

      {/* SUBTAB 2: KANBAN CRM (FIXED HORIZONTAL SCROLL & SPACING) */}
      {activeSubTab === 'kanban' && (
        <div className="space-y-4">
          
          {/* Quick Filters */}
          <div className="flex items-center justify-between gap-4 text-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar candidatos en el tablero..."
                value={candidateSearch}
                onChange={e => setCandidateSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-2 text-2xs text-slate-500 font-semibold">
              <span>Total Postulantes: <strong className="text-slate-900">{campaignCandidates.length}</strong></span>
              <span>•</span>
              <span>Aptos: <strong className="text-emerald-700">{aptosCount}</strong></span>
              <span>•</span>
              <span>Meta: <strong className="text-slate-900">{myMeta}</strong></span>
            </div>
          </div>

          {/* Kanban Columns Board with Adequate Min-Width to Prevent Text Squishing */}
          <div className="overflow-x-auto pb-4 custom-scrollbar">
            <div className="flex min-w-[1320px] items-start gap-3">
              {STAGES_CONFIG.filter(col => col.id !== 'DESCARTADO').map(col => {
                const stageCandidates = campaignCandidates.filter(c => {
                  if (col.id === 'DESCARTADO') {
                    return c.currentStage === 'DESCARTADO' || c.selection?.stage === 'DESCARTADO' || c.selection?.status === 'NO_APTO';
                  }
                  return c.selection?.stage === col.id && c.currentStage !== 'DESCARTADO';
                }).filter(c => {
                  if (candidateSearch) {
                    const q = candidateSearch.toLowerCase();
                    return c.fullName.toLowerCase().includes(q) || c.dni.includes(q);
                  }
                  return true;
                });

                return (
                  <div 
                    key={col.id}
                    className="flex w-[210px] shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50 p-2.5 shadow-2xs"
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${col.iconBg}`} />
                        <span className="text-xs font-bold text-slate-800">
                          {col.title}
                        </span>
                      </div>
                      <span className="text-2xs px-2 py-0.5 bg-white border border-slate-200 rounded-full font-bold text-slate-700 shadow-2xs">
                        {stageCandidates.length}
                      </span>
                    </div>

                    {/* Column Cards */}
                    <div className="max-h-[560px] space-y-2 overflow-y-auto pr-0.5 custom-scrollbar">
                      {stageCandidates.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 px-2 py-4 text-center text-2xs text-slate-400">
                          Sin postulantes
                        </div>
                      ) : (
                        stageCandidates.map(cand => {
                          const isApto = cand.selection?.stage === 'APTO_CAPACITACION';
                          const isDisc = cand.selection?.stage === 'DESCARTADO' || cand.currentStage === 'DESCARTADO';

                          return (
                            <div
                              key={cand.id}
                              className="group space-y-2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-2xs transition-all hover:border-sky-300"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div 
                                  onClick={() => openCandidate360(cand.id)}
                                  className="cursor-pointer flex-1"
                                >
                                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-sky-700 transition-colors leading-tight">
                                    {cand.fullName}
                                  </h4>
                                  <div className="mt-0.5 text-2xs text-slate-500">{cand.source}</div>
                                </div>

                                <MoreVertical className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              </div>

                              <div className="border-t border-slate-100 pt-1.5 text-2xs text-slate-500">
                                <span className="block truncate">{cand.recruiterName || 'Sin asignar'}</span>
                                <span className="mt-0.5 block truncate font-medium text-slate-700">{cand.selection?.contactHistory?.[cand.selection.contactHistory.length - 1]?.nextStep || 'Seguimiento pendiente'}</span>
                              </div>

                              {/* Card Footer Actions */}
                              <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-1">
                                
                                <button
                                  type="button"
                                  onClick={() => openCandidate360(cand.id)}
                                  className="text-2xs font-bold text-sky-600 hover:text-sky-800 cursor-pointer"
                                >
                                  Ver Ficha 360°
                                </button>

                                <div className="flex items-center gap-1">
                                  {!isDisc && !isApto && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setCandidateToDiscard(cand)}
                                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                        title="Descartar"
                                      >
                                        <UserX className="w-3.5 h-3.5" />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleQuickAdvance(cand)}
                                        className="p-1 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded transition-colors cursor-pointer flex items-center gap-0.5 text-2xs font-bold"
                                        title="Avanzar etapa"
                                      >
                                        <ArrowRight className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}

                                  {col.id === 'EVALUACIONES' && (
                                    <button
                                      type="button"
                                      onClick={() => void markCandidateAptoCapacitacion(cand.id).catch(error=>alert(getWorkerErrorMessage(error)))}
                                      className="px-2 py-0.5 bg-emerald-600 text-white rounded text-2xs font-bold hover:bg-emerald-500 cursor-pointer"
                                      title="Marcar como Apto para Capacitación"
                                    >
                                      Apto
                                    </button>
                                  )}
                                </div>

                              </div>

                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* SUBTAB 3: RESUMEN DE LA CONVOCATORIA */}
      {activeSubTab === 'resumen' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900"><DollarSign className="h-4 w-4 text-emerald-600" />Condiciones laborales</h3>
            <div className="grid grid-cols-2 gap-2">
              {[['Sueldo base', activeCampaign.salaryBase ? `S/ ${activeCampaign.salaryBase}` : 'No especificado'], ['Bonos', [activeCampaign.variableBonus, activeCampaign.adminBonus, activeCampaign.mobilityBonus].some(Boolean) ? `S/ ${Number(activeCampaign.variableBonus || 0) + Number(activeCampaign.adminBonus || 0) + Number(activeCampaign.mobilityBonus || 0)}` : 'No especificado'], ['Horario', activeCampaign.shift || 'No especificado'], ['Sede', activeCampaign.location || 'No especificada'], ['Modalidad', activeCampaign.managementType || activeCampaign.processType || 'No especificada']].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="block text-2xs font-medium text-slate-500">{label}</span><strong className="mt-1 block text-xs text-slate-900">{value}</strong></div>
              ))}
            </div>
            {activeCampaign.additionalConditions && <p className="rounded-lg bg-slate-50 p-3 text-2xs text-slate-600">{activeCampaign.additionalConditions}</p>}
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900"><CheckCircle2 className="h-4 w-4 text-teal-600" />Perfil requerido</h3>
            {activeCampaign.requirements?.length ? (
              <ul className="space-y-2">{activeCampaign.requirements.map((requirement, index) => <li key={`${requirement}-${index}`} className="flex gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-700"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /><span>{requirement}</span></li>)}</ul>
            ) : <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No se registraron requisitos para esta convocatoria.</div>}
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900"><Briefcase className="h-4 w-4 text-sky-700" />Gestión de la convocatoria</h3>
            <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50 px-3">
              {[['Código', activeCampaign.code], ['Meta / RQ', `${totalRQ} vacantes`], ['Fecha de apertura', activeCampaign.startDate || 'Sin definir'], ['Fecha límite', activeCampaign.endDate || 'Sin definir'], ['Estado', activeCampaign.status === 'EN_PROCESO' ? 'En proceso' : activeCampaign.status]].map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-2 text-xs"><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold text-slate-900">{value}</dd></div>)}
            </dl>
            <div className="space-y-2">
              <span className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Responsables</span>
              {(activeCampaign.responsibles || []).length ? activeCampaign.responsibles.map(resp => <div key={resp.userId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><div><strong className="block text-slate-900">{resp.userName}</strong><span className="text-2xs text-slate-500">{roleLabel(resp.userRole)}</span></div><span className="font-semibold text-sky-800">Meta {resp.target}</span></div>) : <p className="text-xs text-slate-500">Sin responsables asignados.</p>}
            </div>
          </section>
        </div>
      )}

      {/* SUBTAB 4: FUENTES DE DIFUSIÓN */}
      {activeSubTab === 'fuentes' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Share2 className="w-4 h-4 text-sky-600" />
              Fuentes y enlaces
            </h3>
            <button
              type="button"
              onClick={() => setIsSourcesModalOpen(true)}
              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 cursor-pointer"
            >
              Configurar Fuentes
            </button>
          </div>

          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 md:grid-cols-4 md:divide-x md:divide-slate-200">
            {[['Fuentes activas', activeSources.length], ['Total leads', totalSourcesLeads], ['Conversión promedio', `${averageSourceConversion}%`], ['Mejor fuente', bestSource ? `${bestSource.sourceName} (${bestSource.conversion}%)` : 'Sin datos']].map(([label, value]) => <div key={label} className="p-3"><span className="block text-2xs font-medium text-slate-500">{label}</span><strong className="mt-1 block truncate text-sm text-slate-900">{value}</strong></div>)}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr><th className="px-3 py-2.5">Fuente</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5">Leads ingresados</th><th className="px-3 py-2.5">Conversión</th><th className="px-3 py-2.5">Enlace</th><th className="px-3 py-2.5 text-right">Acciones</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sourceRows.length ? sourceRows.map(src => <tr key={src.sourceName} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{src.sourceName}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-1 text-2xs font-semibold ${src.isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{src.isEnabled ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{src.leadsCount}</td>
                  <td className="px-3 py-2.5"><span className="font-semibold text-teal-700">{src.conversion}%</span></td>
                  <td className="px-3 py-2.5"><span className="block max-w-[220px] truncate text-slate-500" title={src.link}>{src.link || 'Sin enlace'}</span></td>
                  <td className="px-3 py-2.5"><div className="flex justify-end gap-1"><button type="button" disabled={!src.link} onClick={() => src.link && navigator.clipboard.writeText(src.link)} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-sky-50 disabled:opacity-40" title="Copiar enlace"><Copy className="h-3.5 w-3.5" /></button>{src.link && <a href={src.link} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-sky-50" title="Abrir enlace"><Link2 className="h-3.5 w-3.5" /></a>}</div></td>
                </tr>) : <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No hay fuentes configuradas.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 5: INDICADORES Y MÉTRICAS */}
      {activeSubTab === 'indicadores' && (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><BarChart3 className="h-4 w-4 text-sky-700" />Embudo de selección</h3><span className="text-2xs text-slate-500">Datos de la convocatoria actual</span></div>
            {campaignCandidates.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={funnelData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" /><XAxis dataKey="name" interval={0} tick={{ fontSize: 9, fill: '#6F7E8F' }} /><YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#6F7E8F' }} /><Tooltip /><Bar dataKey="cantidad" name="Postulantes" fill="#154E7D" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="rounded-lg border border-dashed border-slate-200 py-16 text-center text-xs text-slate-500">Aún no hay postulantes para construir el embudo.</div>}
          </section>

          <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs lg:grid-cols-4 lg:divide-x lg:divide-slate-200">
            {[['Conversión total', `${conversionTotal}%`, `${aptosCount} de ${campaignCandidates.length || 0}`], ['Aptos / meta', `${aptosCount} / ${myMeta}`, `${cumplimientoPct}% de cobertura`], ['Tiempo promedio en proceso', averageProcessDays === null ? 'Sin datos' : `${averageProcessDays} días`, `${validApplications.length} postulantes medidos`], ['Tasa de descarte', `${discardRate}%`, `${descartadosCount} postulantes`]].map(([label, value, detail]) => <div key={label} className="p-4"><span className="block text-2xs font-medium text-slate-500">{label}</span><strong className="mt-1 block text-lg text-slate-900">{value}</strong><span className="text-2xs text-slate-500">{detail}</span></div>)}
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"><h3 className="mb-3 text-xs font-bold text-slate-900">Conversión entre etapas</h3>{campaignCandidates.length ? <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={stageConversionData} layout="vertical" margin={{ left: 25, right: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" /><XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 9 }} /><Tooltip formatter={(value: number) => [`${value}%`, 'Conversión']} /><Bar dataKey="conversion" fill="#4CA899" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div> : <p className="py-16 text-center text-xs text-slate-500">Sin datos suficientes.</p>}</section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"><h3 className="mb-3 text-xs font-bold text-slate-900">Tiempo promedio por etapa</h3>{hasStageDurationData ? <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={stageDurationData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" /><XAxis dataKey="name" interval={0} tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 9 }} /><Tooltip formatter={(value: number) => [`${value} días`, 'Promedio']} /><Bar dataKey="dias" fill="#87C6A2" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="py-16 text-center text-xs text-slate-500">La trazabilidad actual aún no permite calcular tiempos por etapa.</p>}</section>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"><h3 className="mb-3 text-xs font-bold text-slate-900">Evolución semanal</h3>{hasWeeklyData ? <div className="h-60"><ResponsiveContainer width="100%" height="100%"><LineChart data={weeklyEvolution}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" /><XAxis dataKey="day" tick={{ fontSize: 9 }} /><YAxis allowDecimals={false} tick={{ fontSize: 9 }} /><Tooltip /><Legend /><Line type="monotone" dataKey="postulantes" name="Postulantes" stroke="#154E7D" strokeWidth={2} dot={{ r: 3 }} /><Line type="monotone" dataKey="aptos" name="Aptos" stroke="#4CA899" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div> : <p className="py-16 text-center text-xs text-slate-500">No hay movimientos registrados durante los últimos siete días.</p>}</section>
        </div>
      )}

      {/* Unified 360° Candidate Record Modal */}
      {selectedCandidateId && (
        <Candidate360Modal
          candidateId={selectedCandidateId}
          onClose={closeCandidate360}
        />
      )}

      {/* Discard Modal with Categories and Reasons */}
      <DiscardCandidateModal
        isOpen={!!candidateToDiscard}
        candidate={candidateToDiscard}
        onClose={() => setCandidateToDiscard(null)}
      />

      {/* Register Candidate Modal */}
      <CandidateCreateModal
        isOpen={isCandidateCreateOpen}
        onClose={() => setIsCandidateCreateOpen(false)}
        defaultCampaignId={activeCampaign.id}
      />

      {/* Sources & Links Modal */}
      <SourcesModal
        isOpen={isSourcesModalOpen}
        onClose={() => setIsSourcesModalOpen(false)}
        convocatoria={activeCampaign}
      />

      {/* Quick Contact Logger Modal */}
      {contactCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PhoneCall className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-white">
                  Registrar Contacto Rápido
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setContactCandidate(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickContact} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900">{contactCandidate.fullName}</div>
                <div className="text-2xs text-slate-500 font-mono mt-0.5">
                  DNI: {contactCandidate.dni} • Teléfono: {contactCandidate.phone}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-bold text-slate-700 mb-1">
                    Tipo de Contacto:
                  </label>
                  <select
                    value={contactType}
                    onChange={e => setContactType(e.target.value as ContactType)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-semibold"
                  >
                    <option value="LLAMADA">Llamada Telefónica</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="CORREO">Correo Electrónico</option>
                    <option value="ENTREVISTA">Entrevista</option>
                  </select>
                </div>

                <div>
                  <label className="block text-2xs font-bold text-slate-700 mb-1">
                    Resultado:
                  </label>
                  <select
                    value={contactOutcome}
                    onChange={e => setContactOutcome(e.target.value as ContactOutcome)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-semibold"
                  >
                    <option value="CONTESTO">Contestó / Contacto Positivo</option>
                    <option value="CITA_AGENDADA">Cita Agendada</option>
                    <option value="NO_CONTESTO">No Contestó</option>
                    <option value="BUZON">Buzón de Voz</option>
                    <option value="RECHAZA_OFERTA">Rechaza Oferta</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-700 mb-1">
                  Resumen o Notas de la Conversación:
                </label>
                <textarea
                  rows={3}
                  value={contactSummary}
                  onChange={e => setContactSummary(e.target.value)}
                  placeholder="Detalla lo conversado con el postulante (disponibilidad, interés, etc.)..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-700 mb-1">
                  Próximo Paso / Compromiso (Opcional):
                </label>
                <input
                  type="text"
                  value={contactNextStep}
                  onChange={e => setContactNextStep(e.target.value)}
                  placeholder="Ej: Entrevista técnica mañana a las 10:00 am"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setContactCandidate(null)}
                  className="px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                >
                  Guardar Contacto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {injectOpen&&activeCampaign&&<InjectParticipantsModal campaign={activeCampaign} onClose={()=>setInjectOpen(false)}/>}
      {/* Create Training Cohort Modal */}
      {isCreateCohortModalOpen && (
        <CreateTrainingCohortModal
          isOpen={true}
          onClose={() => setIsCreateCohortModalOpen(false)}
          initialCampaignId={activeCampaign?.id}
        />
      )}

    </div>
  );
};
