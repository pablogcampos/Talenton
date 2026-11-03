import { TrainingPreparation } from '../components/training/TrainingPreparation';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarDays,
  Clock,
  Flag,
  GraduationCap,
  History,
  MapPin,
  MoreVertical,
  Plus,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import { useTalent } from '../context/TalentContext';
import { TrainingCohort, TrainingCohortStatus } from '../types';
import { AssignTrainerModal } from '../components/modals/AssignTrainerModal';
import { CreateTrainingCohortModal } from '../components/modals/CreateTrainingCohortModal';
import { createDemoTrainingData, DEMO_FORMACION_ENABLED } from '../data/demoTrainingData';

interface CapacitacionesViewProps {
  onOpenNewCohortModal?: () => void;
}

type AdminTab = 'RESUMEN' | 'CRONOGRAMA' | 'HISTORIAL';

const statusOptions: { value: 'TODOS' | TrainingCohortStatus; label: string }[] = [
  { value: 'TODOS', label: 'Todos los estados' },
  { value: 'PENDIENTE_ASIGNACION', label: 'Por asignar' },
  { value: 'PROGRAMADA', label: 'Programadas' },
  { value: 'EN_CAPACITACION', label: 'En capacitación' },
  { value: 'PENDIENTE_OJT', label: 'Pendiente a OJT' },
  { value: 'EN_OJT', label: 'En OJT' },
  { value: 'FINALIZADA', label: 'Finalizadas' },
];

const statusLabel = (status: TrainingCohortStatus) => {
  const labels: Record<TrainingCohortStatus, string> = {
    PENDIENTE_ASIGNACION: 'Por asignar',
    PROGRAMADA: 'Programada',
    EN_CAPACITACION: 'En capacitación',
    PENDIENTE_OJT: 'Pendiente a OJT',
    EN_OJT: 'En OJT',
    EXTENSION_OJT: 'Extensión OJT',
    FINALIZADA: 'Finalizada',
    CANCELADA: 'Cancelada',
  };
  return labels[status] || status;
};

const statusTone = (status: TrainingCohortStatus) => {
  if (status === 'FINALIZADA') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'EN_OJT') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'EN_CAPACITACION') return 'bg-sky-50 text-sky-700 border-sky-100';
  if (status === 'PROGRAMADA') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (status === 'PENDIENTE_ASIGNACION') return 'bg-slate-100 text-slate-700 border-slate-200';
  if (status === 'CANCELADA') return 'bg-rose-50 text-rose-700 border-rose-100';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const stageLabel = (cohort?: TrainingCohort) => {
  if (!cohort) return '-';
  if (cohort.status === 'EN_OJT' || cohort.status === 'EXTENSION_OJT') return 'OJT en piso';
  if (cohort.status === 'EN_CAPACITACION') return 'Teoría en curso';
  if (cohort.status === 'PROGRAMADA') return 'Programada';
  if (cohort.status === 'FINALIZADA') return 'Finalizada';
  if (cohort.status === 'CANCELADA') return 'Cancelada';
  return 'Pendiente de asignación';
};

const dateShort = (value?: string) => {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const CapacitacionesView: React.FC<CapacitacionesViewProps> = ({ onOpenNewCohortModal }) => {
  const {
    cohorts: liveCohorts,
    scopedCohorts: liveScopedCohorts,
    campaigns: liveCampaigns,
    currentUser,
    selectedCohortId,
    setSelectedCohortId,
    updateCohortStatus,
    updateCohortDetails,
  } = useTalent();

  const demoData = useMemo(() => createDemoTrainingData(currentUser), [currentUser]);
  const shouldUseDemoData = DEMO_FORMACION_ENABLED;
  const cohorts = shouldUseDemoData ? demoData.cohorts : liveCohorts;
  const scopedCohorts = shouldUseDemoData ? demoData.cohorts : liveScopedCohorts;
  const campaigns = shouldUseDemoData ? demoData.campaigns : liveCampaigns;

  const [campaignFilter, setCampaignFilter] = useState('TODAS');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | TrainingCohortStatus>('TODOS');
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('RESUMEN');
  const [showLocalCreateModal, setShowLocalCreateModal] = useState(false);
  const [assignTrainerTarget, setAssignTrainerTarget] = useState<TrainingCohort | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState({
    startDate: '',
    endDate: '',
    ojtStartDate: '',
    ojtEndDate: '',
    schedule: '',
    location: '',
    roomOrLink: '',
  });

  const activeCohortList = scopedCohorts.length ? scopedCohorts : cohorts;
  const campaignIds = new Set(activeCohortList.map(cohort => cohort.campaignId));
  const availableCampaigns = campaigns.filter(campaign => campaignIds.has(campaign.id));

  const filteredCohorts = activeCohortList.filter(cohort => {
    if (campaignFilter !== 'TODAS' && cohort.campaignId !== campaignFilter) return false;
    if (statusFilter !== 'TODOS' && cohort.status !== statusFilter) return false;
    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase();
      const matches = [
        cohort.code,
        cohort.name,
        cohort.campaignName,
        cohort.company,
        cohort.trainerName,
      ].some(value => (value || '').toLowerCase().includes(query));
      if (!matches) return false;
    }
    return true;
  });

  const selectedCohort = filteredCohorts.find(cohort => cohort.id === selectedCohortId) || filteredCohorts[0] || null;

  useEffect(() => {
    if (selectedCohort && selectedCohort.id !== selectedCohortId) {
      setSelectedCohortId(selectedCohort.id);
    }
  }, [selectedCohort, selectedCohortId, setSelectedCohortId]);

  useEffect(() => {
    if (!selectedCohort) return;
    setScheduleDraft({
      startDate: selectedCohort.startDate || '',
      endDate: selectedCohort.endDate || '',
      ojtStartDate: selectedCohort.ojtStartDate || '',
      ojtEndDate: selectedCohort.ojtEndDate || '',
      schedule: selectedCohort.schedule || '',
      location: selectedCohort.location || '',
      roomOrLink: selectedCohort.roomOrLink || '',
    });
  }, [selectedCohort]);

  const summary = {
    active: activeCohortList.filter(cohort => ['PROGRAMADA', 'EN_CAPACITACION', 'PENDIENTE_OJT', 'EN_OJT', 'EXTENSION_OJT'].includes(cohort.status)).length,
    pending: activeCohortList.filter(cohort => cohort.status === 'PENDIENTE_ASIGNACION').length,
    training: activeCohortList.filter(cohort => cohort.status === 'EN_CAPACITACION').length,
    ojt: activeCohortList.filter(cohort => cohort.status === 'EN_OJT' || cohort.status === 'EXTENSION_OJT').length,
  };

  const saveSchedule = async () => {
    if (!selectedCohort) return;
    await updateCohortDetails(selectedCohort.id, scheduleDraft);
  };

  const createTraining = () => {
    if (onOpenNewCohortModal) {
      onOpenNewCohortModal();
      return;
    }
    setShowLocalCreateModal(true);
  };

  const occupancy = selectedCohort ? Math.round(((selectedCohort.enrolledCount || 0) / Math.max(1, selectedCohort.maxCapacity || selectedCohort.enrolledCount || 1)) * 100) : 0;
  const availableSeats = selectedCohort ? Math.max(0, (selectedCohort.maxCapacity || selectedCohort.enrolledCount || 0) - (selectedCohort.enrolledCount || 0)) : 0;

  return (
    <div className="space-y-4 bg-[#F3F6F8] pb-8">
      <section className="flex flex-col gap-4 px-1 py-1 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Capacitaciones Iniciales</h1>
          <p className="mt-0.5 text-xs text-slate-500">Gestión administrativa de capacitaciones y asignaciones.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex h-10 min-w-[250px] items-center gap-3 rounded-lg border border-[#DCE5EA] bg-white px-3 text-[11px] text-slate-500">
            <span>Campaña</span>
            <select value={campaignFilter} onChange={event => setCampaignFilter(event.target.value)} className="min-w-0 flex-1 bg-transparent font-semibold text-slate-900 outline-none">
              <option value="TODAS">Todas mis campañas</option>
              {availableCampaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}
            </select>
          </label>
          <button onClick={createTraining} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#143A56] px-4 text-xs font-bold text-white transition-colors hover:bg-[#0F2E44]">
            <Plus className="h-4 w-4" />
            Crear capacitación
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#DCE5EA] bg-white lg:grid-cols-4">
        {[
          { label: 'Activas', value: summary.active, icon: Users, tone: 'bg-sky-50 text-[#145986]' },
          { label: 'Por asignar', value: summary.pending, icon: UserCheck, tone: 'bg-amber-50 text-amber-700' },
          { label: 'En capacitación', value: summary.training, icon: GraduationCap, tone: 'bg-emerald-50 text-emerald-700' },
          { label: 'En OJT', value: summary.ojt, icon: Clock, tone: 'bg-cyan-50 text-cyan-700' },
        ].map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className={`flex min-h-20 items-center justify-center gap-4 px-4 py-3 ${index % 2 ? 'border-l border-[#DCE5EA]' : ''} ${index > 1 ? 'border-t border-[#DCE5EA] lg:border-t-0' : ''} ${index > 0 ? 'lg:border-l lg:border-[#DCE5EA]' : ''}`}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-full ${item.tone}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <div className="text-xl font-bold leading-none text-slate-950">{item.value}</div>
                <div className="mt-1 text-[11px] text-slate-500">{item.label}</div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-[#DCE5EA] bg-[#F8FAFC]">
          <div className="border-b border-[#DCE5EA] p-4">
            <h2 className="text-sm font-bold text-slate-950">Capacitaciones ({filteredCohorts.length})</h2>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchText}
                onChange={event => setSearchText(event.target.value)}
                placeholder="Buscar por código o nombre..."
                className="h-9 w-full rounded-lg border border-[#DCE5EA] bg-white pl-9 pr-3 text-[11px] text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as 'TODOS' | TrainingCohortStatus)}
              className="mt-2 h-9 w-full rounded-lg border border-[#DCE5EA] bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            >
              {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div className="max-h-[570px] overflow-y-auto custom-scrollbar">
            {filteredCohorts.length ? filteredCohorts.map(cohort => {
              const selected = selectedCohort?.id === cohort.id;
              return (
                <button
                  key={cohort.id}
                  onClick={() => {
                    setSelectedCohortId(cohort.id);
                    setActiveTab('RESUMEN');
                  }}
                  className={`w-full border-l-4 border-b border-b-[#E7EDF1] px-3 py-3 text-left transition ${
                    selected
                      ? 'border-l-sky-600 bg-sky-50/70'
                      : 'border-l-transparent bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#145986]">{cohort.code}</span>
                      </div>
                      <div className="mt-1 truncate text-xs font-bold text-slate-950">{cohort.name}</div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-500">{cohort.campaignName || cohort.company} · {cohort.trainerName || 'Sin asignar'}</div>
                    </div>
                    <span className={`inline-flex shrink-0 rounded-md border px-2 py-1 text-[9px] font-bold ${statusTone(cohort.status)}`}>{statusLabel(cohort.status)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-slate-500">
                    <span className="inline-flex min-w-0 items-center gap-1 truncate"><Calendar className="h-3 w-3 shrink-0" />{dateShort(cohort.startDate)} – {dateShort(cohort.ojtEndDate || cohort.endDate)}</span>
                    <span className="shrink-0 font-semibold text-slate-700">{cohort.enrolledCount}/{cohort.maxCapacity || cohort.enrolledCount}</span>
                  </div>
                </button>
              );
            }) : (
              <div className="m-3 rounded-lg border border-dashed border-[#DCE5EA] bg-white p-8 text-center text-xs text-slate-400">No hay capacitaciones para los filtros seleccionados.</div>
            )}
          </div>
          <div className="border-t border-[#DCE5EA] px-4 py-2.5 text-[10px] text-slate-500">
            Mostrando {filteredCohorts.length} de {activeCohortList.length} capacitaciones
          </div>
        </aside>

        <article className="overflow-hidden rounded-xl border border-[#DCE5EA] bg-white">
          {selectedCohort ? (
            <>
              <div className="flex flex-col gap-3 border-b border-[#DCE5EA] p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-slate-950"><span className="text-[#145986]">{selectedCohort.code}</span><span className="mx-2 text-slate-300">·</span>{selectedCohort.name}</h2>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {selectedCohort.campaignName || selectedCohort.company} · {selectedCohort.modality} · {selectedCohort.location || 'Sin sede'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md border px-2.5 py-1.5 text-[10px] font-bold ${statusTone(selectedCohort.status)}`}>{statusLabel(selectedCohort.status)}</span>
                  <select
                    value={selectedCohort.status}
                    onChange={event => updateCohortStatus(selectedCohort.id, event.target.value as TrainingCohortStatus)}
                    aria-label="Cambiar estado"
                    className="h-9 rounded-lg border border-[#DCE5EA] bg-white px-3 text-[11px] font-semibold text-slate-800 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="PENDIENTE_ASIGNACION">Por asignar</option>
                    <option value="PROGRAMADA">Programada</option>
                    <option value="EN_CAPACITACION">En capacitación</option>
                    <option value="EN_OJT">En OJT</option>
                    <option value="FINALIZADA">Finalizada</option>
                    <option value="CANCELADA">Cancelada</option>
                  </select>
                  <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#DCE5EA] text-slate-600 hover:bg-slate-50" title="Más acciones">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex overflow-x-auto border-b border-[#DCE5EA] bg-white px-4">
                {[
                  { id: 'RESUMEN' as const, label: 'Resumen', icon: Users },
                  { id: 'CRONOGRAMA' as const, label: 'Cronograma', icon: CalendarDays },
                  { id: 'HISTORIAL' as const, label: 'Historial', icon: History },
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-[11px] font-bold transition ${
                        activeTab === tab.id ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="p-4">
                <TrainingPreparation cohort={selectedCohort} />
                {activeTab === 'RESUMEN' && (
                  <div className="space-y-4">
                    <div className="grid overflow-hidden rounded-xl border border-[#DCE5EA] bg-[#F8FAFC] sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: 'Formador', value: selectedCohort.trainerName || 'Sin asignar', detail: 'Cambiar asignación', icon: UserCheck, tone: 'bg-sky-50 text-[#145986]', action: true },
                        { label: 'Capacidad', value: `${selectedCohort.enrolledCount} / ${selectedCohort.maxCapacity || selectedCohort.enrolledCount}`, detail: availableSeats === 0 ? 'Completo' : `${availableSeats} cupos disponibles`, icon: Users, tone: 'bg-emerald-50 text-emerald-700' },
                        { label: 'Modalidad / Sede', value: selectedCohort.modality, detail: selectedCohort.location || 'Sin sede', icon: MapPin, tone: 'bg-cyan-50 text-cyan-700' },
                        { label: 'Horario', value: selectedCohort.schedule || 'Sin horario', detail: selectedCohort.totalDays ? `${selectedCohort.totalDays} días de teoría` : '', icon: Clock, tone: 'bg-amber-50 text-amber-700' },
                      ].map((item, index) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.label} className={`min-w-0 p-4 ${index % 2 ? 'border-l border-[#DCE5EA]' : ''} ${index > 1 ? 'border-t border-[#DCE5EA] xl:border-t-0' : ''} ${index > 0 ? 'xl:border-l xl:border-[#DCE5EA]' : ''}`}>
                            <div className="flex items-start gap-3">
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.tone}`}><Icon className="h-4 w-4" /></span>
                              <div className="min-w-0">
                                <div className="text-[10px] text-slate-500">{item.label}</div>
                                <div className="mt-1 truncate text-sm font-bold text-slate-950">{item.value}</div>
                                {item.label === 'Capacidad' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, occupancy)}%` }} /></div>}
                                {item.action ? (
                                  <button onClick={() => setAssignTrainerTarget(selectedCohort)} className="mt-2 text-[10px] font-bold text-sky-700 hover:text-sky-900">{item.detail}</button>
                                ) : <div className={`mt-1 text-[10px] ${item.label === 'Capacidad' && availableSeats === 0 ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>{item.detail}</div>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-xl border border-[#DCE5EA] bg-white p-4">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Etapa actual</div>
                          <div className="mt-1 text-base font-bold text-slate-950">{stageLabel(selectedCohort)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-500">Avance</div>
                          <div className="text-xl font-bold text-slate-950">{selectedCohort.progressPercent || 0}%</div>
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, selectedCohort.progressPercent || 0)}%` }} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 border-t border-[#E7EDF1] pt-4 md:grid-cols-4">
                        {[
                          { label: 'Inicio', value: selectedCohort.startDate, icon: Calendar },
                          { label: 'Fin teoría', value: selectedCohort.endDate, icon: GraduationCap },
                          { label: 'Inicio OJT', value: selectedCohort.ojtStartDate, icon: Users },
                          { label: 'Fin OJT', value: selectedCohort.ojtEndDate, icon: Flag },
                        ].map((item, index) => {
                          const Icon = item.icon;
                          return (
                            <div key={item.label} className={`flex items-center justify-center gap-2 px-2 py-1 ${index % 2 ? 'border-l border-[#E7EDF1]' : ''} ${index > 1 ? 'mt-3 border-t border-[#E7EDF1] pt-3 md:mt-0 md:border-t-0 md:pt-1' : ''} ${index > 0 ? 'md:border-l' : ''}`}>
                              <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                              <div>
                                <div className="text-[9px] text-slate-500">{item.label}</div>
                                <div className="text-[11px] font-bold text-slate-950">{dateShort(item.value)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'CRONOGRAMA' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {[
                        { key: 'startDate', label: 'Fecha inicio teoría' },
                        { key: 'endDate', label: 'Fin de teoría' },
                        { key: 'ojtStartDate', label: 'Inicio OJT' },
                        { key: 'ojtEndDate', label: 'Fin OJT' },
                      ].map(item => (
                        <label key={item.key} className="space-y-1.5 text-xs font-semibold text-slate-700">
                          {item.label}
                          <input
                            type="date"
                            value={scheduleDraft[item.key as keyof typeof scheduleDraft]}
                            onChange={event => setScheduleDraft(prev => ({ ...prev, [item.key]: event.target.value }))}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                          />
                        </label>
                      ))}
                      <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                        Horario
                        <input
                          value={scheduleDraft.schedule}
                          onChange={event => setScheduleDraft(prev => ({ ...prev, schedule: event.target.value }))}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                        Aula, sala o enlace
                        <input
                          value={scheduleDraft.roomOrLink}
                          onChange={event => setScheduleDraft(prev => ({ ...prev, roomOrLink: event.target.value }))}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        />
                      </label>
                    </div>
                    <div className="flex justify-end border-t border-slate-100 pt-4">
                      <button onClick={saveSchedule} className="h-10 rounded-xl bg-[#143A56] px-4 text-xs font-bold text-white hover:bg-[#0F2E44]">Guardar cronograma</button>
                    </div>
                  </div>
                )}

                {activeTab === 'HISTORIAL' && (
                  <div className="space-y-3">
                    {[
                      { title: 'Creación de capacitación', detail: selectedCohort.coordinatorName || 'Sistema', date: selectedCohort.startDate },
                      selectedCohort.trainerName ? { title: 'Asignación de formador', detail: selectedCohort.trainerName, date: selectedCohort.trainerAssignedAt || selectedCohort.startDate } : null,
                      { title: `Estado actual: ${statusLabel(selectedCohort.status)}`, detail: stageLabel(selectedCohort), date: selectedCohort.endDate },
                    ].filter(Boolean).map((item, index) => {
                      const entry = item as { title: string; detail: string; date?: string };
                      return (
                        <div key={`${entry.title}-${index}`} className="grid grid-cols-[28px_1fr] gap-3">
                          <div className="flex flex-col items-center">
                            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-sky-600" />
                            {index < 2 && <span className="mt-1 h-full min-h-10 w-px bg-slate-200" />}
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs font-bold text-slate-950">{entry.title}</div>
                            <div className="mt-1 text-[11px] text-slate-500">{entry.detail} · {dateShort(entry.date)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-[520px] items-center justify-center text-xs text-slate-400">Selecciona una capacitación para ver su ficha administrativa.</div>
          )}
        </article>
      </section>

      {assignTrainerTarget && (
        <AssignTrainerModal
          isOpen
          onClose={() => setAssignTrainerTarget(null)}
          cohort={assignTrainerTarget}
        />
      )}

      {showLocalCreateModal && (
        <CreateTrainingCohortModal
          isOpen
          onClose={() => setShowLocalCreateModal(false)}
        />
      )}
    </div>
  );
};
