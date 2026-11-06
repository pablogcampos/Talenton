import { OffersPanel } from './LaborOffersView';
import { trainingDayNumber } from '../../shared/trainingRules';
import { TrainingPreparation } from '../components/training/TrainingPreparation';
import { TrainingFinalPanel } from '../components/training/TrainingFinalPanel';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Award, BarChart3, BookOpenCheck, Calendar, ClipboardCheck, Clock3, GraduationCap, Lock, MapPin, MoreVertical, TimerReset, UserCheck, Users, X } from 'lucide-react';
import { AttendanceWindowInfo, useTalent } from '../context/TalentContext';
import { AttendanceStatus, CandidateRecord, TrainingCohort } from '../types';
import { getWorkerErrorMessage } from '../services/workerApi';
import { AttendancePanel } from '../components/training/AttendancePanel';
import { limaDate } from '../components/training/attendanceTime';

type WorkspaceTab = 'PROPUESTAS' | 'RESUMEN' | 'ASISTENCIA' | 'OJT' | 'RESULTADO';
const tabs: Array<{ id: WorkspaceTab; label: string; icon: React.ElementType }> = [
  { id: 'PROPUESTAS', label: 'Propuestas', icon: ClipboardCheck },
  { id: 'RESUMEN', label: 'Resumen', icon: BarChart3 }, { id: 'ASISTENCIA', label: 'Asistencia', icon: UserCheck },
  { id: 'OJT', label: 'OJT', icon: BookOpenCheck }, { id: 'RESULTADO', label: 'Resultado final', icon: Award },
];
const statusLabel = (value: string) => ({ PENDIENTE_ASIGNACION: 'Por asignar', PROGRAMADA: 'Programada', EN_CAPACITACION: 'En capacitación', PENDIENTE_OJT: 'Pendiente a OJT', EN_OJT: 'En OJT', EXTENSION_OJT: 'Extensión OJT', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada' }[value] ?? value.replaceAll('_', ' '));
const statusClass = (value: string) => value === 'EN_OJT' || value === 'FINALIZADA' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : value === 'EN_CAPACITACION' ? 'bg-blue-50 text-blue-700 border-blue-200' : value === 'PROGRAMADA' ? 'bg-violet-50 text-violet-700 border-violet-200' : value === 'CANCELADA' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200';
const formatDate = (value?: string, compact = false) => { if (!value) return '—'; const [y, m, d] = value.slice(0, 10).split('-').map(Number); return y && m && d ? new Intl.DateTimeFormat('es-PE', compact ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d)) : value; };
const todayInLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const attendanceLabel: Record<string, string> = { PRESENTE: 'Presente', TARDANZA: 'Tardanza', FALTA: 'Ausente', JUSTIFICADO: 'Justificado', NSP: 'Ausente', FALTA_JUSTIFICADA: 'Justificado', FALTA_INJUSTIFICADA: 'Ausente' };
const attendanceClass: Record<string, string> = { PRESENTE: 'bg-emerald-50 text-emerald-700 border-emerald-200', TARDANZA: 'bg-amber-50 text-amber-700 border-amber-200', FALTA: 'bg-rose-50 text-rose-700 border-rose-200', NSP: 'bg-rose-50 text-rose-700 border-rose-200', JUSTIFICADO: 'bg-blue-50 text-blue-700 border-blue-200', FALTA_JUSTIFICADA: 'bg-blue-50 text-blue-700 border-blue-200', FALTA_INJUSTIFICADA: 'bg-rose-50 text-rose-700 border-rose-200' };
const candidateAttendance = (candidate: CandidateRecord, date: string) => candidate.training?.attendance?.find(item => item.date === date);


const Metric: React.FC<{ icon: React.ElementType; value: string | number; label: string; detail?: string; tone?: 'blue' | 'green' | 'orange' | 'violet' }> = ({ icon: Icon, value, label, detail, tone = 'blue' }) => {
  const colors = { blue: 'bg-blue-50 text-blue-700', green: 'bg-emerald-50 text-emerald-700', orange: 'bg-orange-50 text-orange-700', violet: 'bg-violet-50 text-violet-700' };
  return <div className="flex min-w-0 items-center gap-3 px-5 py-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${colors[tone]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><div className="text-xl font-bold leading-none text-[#0B2847]">{value}</div><div className="mt-1 text-xs font-semibold text-slate-700">{label}</div>{detail && <div className="mt-0.5 truncate text-[11px] text-slate-500">{detail}</div>}</div></div>;
};

export const MisCapacitacionesView: React.FC = () => {
  const { myAssignedCohorts, scopedCandidates, currentUser, openCandidate360, recordParticipantAttendance, recordOjtDailyMetricForParticipant, updateParticipantTrainingStatus, approveParticipantToTalentAlta, getAttendanceWindow, requestAttendanceUnlock, decideAttendanceUnlock } = useTalent();
  const assigned = useMemo(() => myAssignedCohorts.filter(cohort => currentUser.role !== 'FORMADOR' || cohort.trainerId === currentUser.id), [currentUser.id, currentUser.role, myAssignedCohorts]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('RESUMEN');
  const selected = assigned.find(cohort => cohort.id === workspaceId) ?? null;
  const participants = useMemo(() => selected ? scopedCandidates.filter(candidate => candidate.training?.cohortId === selected.id || candidate.trainingId === selected.id) : [], [scopedCandidates, selected]);
  const [attendanceDate, setAttendanceDate] = useState(todayInLima());
  const [followingToday, setFollowingToday] = useState(true);
  const windowReader = useRef(getAttendanceWindow);
  useEffect(() => { windowReader.current = getAttendanceWindow; }, [getAttendanceWindow]);
  const [windowInfo, setWindowInfo] = useState<AttendanceWindowInfo | null>(null);
  const [windowLoading, setWindowLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (workspaceId && !assigned.some(cohort => cohort.id === workspaceId)) setWorkspaceId(null); }, [assigned, workspaceId]);
  useEffect(() => {
    if (!selected || tab !== 'ASISTENCIA') return;
    let active = true, pending = false;
    setWindowInfo(null); setWindowLoading(true); setActionError('');
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const value = await windowReader.current(selected.id, attendanceDate);
        if (active) {
          const serverDate = limaDate(new Date(value.serverNow));
          if (followingToday && serverDate !== attendanceDate) { setAttendanceDate(serverDate); setWindowInfo(null); }
          else setWindowInfo(value);
        }
      } catch (error) {
        if (active) { setWindowInfo(null); setActionError(getWorkerErrorMessage(error, 'No se pudo validar la ventana de asistencia.')); }
      } finally { pending = false; if (active) setWindowLoading(false); }
    };
    void refresh();
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [attendanceDate, followingToday, selected?.id, tab]);

  const today = todayInLima();
  const pendingOjt = scopedCandidates.filter(p => p.training?.status === 'PENDIENTE_OJT').length;
  const markAttendance = async (candidateId: string, status: AttendanceStatus) => { if (!selected || !windowInfo || !['OPEN', 'UNLOCKED'].includes(windowInfo.state) || saving) return; setSaving(true); setActionError(''); try { await recordParticipantAttendance(candidateId, trainingDayNumber(selected.startDate, attendanceDate), attendanceDate, status); } catch (error) { setActionError(getWorkerErrorMessage(error, 'No se pudo guardar la asistencia.')); } finally { setSaving(false); } };
  const submitUnlock = async () => { if (!selected || saving) return; if(unlockReason.trim().length<5){setActionError('Explica el motivo con al menos 5 caracteres.');return;} setSaving(true); setActionError(''); try { const request = await requestAttendanceUnlock(selected.id, attendanceDate, unlockReason.trim()); setWindowInfo(current => current ? { ...current, unlock: request } : current); setUnlockOpen(false); setUnlockReason(''); } catch (error) { setActionError(getWorkerErrorMessage(error, 'No se pudo enviar la solicitud.')); } finally { setSaving(false); } };
  const decideUnlock = async (decision: 'APROBADA' | 'RECHAZADA') => { if (!selected || saving) return; setSaving(true); setActionError(''); try { const request = await decideAttendanceUnlock(selected.id, attendanceDate, decision); setWindowInfo(current => current ? { ...current, state: decision === 'APROBADA' ? 'UNLOCKED' : 'LOCKED', unlock: request } : current); } catch (error) { setActionError(getWorkerErrorMessage(error, 'No se pudo resolver la solicitud.')); } finally { setSaving(false); } };
  const changeParticipant = async (candidate: CandidateRecord, status: 'EN_OJT' | 'APTO_ALTA') => {
    if (saving) return; setSaving(true); setActionError('');
    try { await updateParticipantTrainingStatus(candidate.id, status, status === 'EN_OJT' ? 'Inicio OJT después de finalizar teoría.' : 'OJT aprobado por el formador.'); }
    catch(error) { setActionError(getWorkerErrorMessage(error, 'No se pudo actualizar el participante.')); }
    finally { setSaving(false); }
  };
  const sendToTalent = async (candidate: CandidateRecord) => {
    if (saving) return; setSaving(true); setActionError('');
    try { await approveParticipantToTalentAlta(candidate.id, 'Requisitos verificados por Formación.'); }
    catch(error) { setActionError(getWorkerErrorMessage(error, 'No se pudo enviar a Gestión de Talento.')); }
    finally { setSaving(false); }
  };

  const addOjtMetric = async (candidate: CandidateRecord) => { if (saving) return; const hoursRaw = window.prompt('Horas gestionadas'); if (hoursRaw === null) return; const salesRaw = window.prompt('Resultados / ventas'); if (salesRaw === null) return; const hours = Number(hoursRaw); const sales = Number(salesRaw); if (!(hours > 0) || sales < 0) { setActionError('Ingresa valores válidos.'); return; } setSaving(true); try { await recordOjtDailyMetricForParticipant(candidate.id, { date: today, dayNumber: 1, attendance: 'PRESENTE', hoursWorked: hours, sales }); } catch (error) { setActionError(getWorkerErrorMessage(error, 'No se pudo registrar la métrica OJT.')); } finally { setSaving(false); } };

  if (!selected) return <AssignedList assigned={assigned} candidates={scopedCandidates} today={today} pendingOjt={pendingOjt} onOpen={cohort => { setWorkspaceId(cohort.id); setTab('RESUMEN'); setFollowingToday(true); setAttendanceDate(today); }} />;

  const activeParticipants = participants.filter(candidate => !['DESERTO', 'NO_APTO', 'NSP'].includes(String(candidate.training?.status))).length;
  const incidentCount = participants.filter(candidate => ['FALTA', 'TARDANZA', 'NSP'].includes(String(candidateAttendance(candidate, today)?.status))).length;

  const pendingInGroup = participants.filter(p => p.training?.status === 'PENDIENTE_OJT').length;
  return <div className="min-h-full bg-[#F3F6F8] p-4 md:p-6">
    <button onClick={() => { setWorkspaceId(null); setTab('RESUMEN'); }} className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#0A4F87]"><ArrowLeft className="h-4 w-4" /> Mis capacitaciones</button>
    <section className="overflow-hidden rounded-2xl border border-[#DCE5EA] bg-white shadow-[0_4px_18px_rgba(15,35,55,.04)]">
      <header className="p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">{selected.code}</span><h1 className="mt-2 text-xl font-bold text-[#092446]">{selected.name}</h1><p className="mt-1 text-xs text-slate-500">{selected.campaignName} · {selected.modality} · {selected.location || 'Sede por definir'} · {selected.schedule}</p></div><div className="flex items-center gap-2"><span className={`rounded-lg border px-3 py-2 text-[10px] font-bold uppercase ${statusClass(selected.status)}`}>{statusLabel(selected.status)}</span><button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500" aria-label="Más acciones"><MoreVertical className="h-4 w-4" /></button></div></div>
        <div className="mt-5 grid overflow-hidden rounded-xl border border-slate-200 bg-[#FBFCFD] sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-slate-200"><Metric icon={Users} value={participants.length || selected.enrolledCount} label="Inscritos" tone="green" /><Metric icon={UserCheck} value={activeParticipants} label="Activos" /><Metric icon={AlertCircle} value={incidentCount} label="Incidencias hoy" tone="orange" /><Metric icon={ClipboardCheck} value={pendingInGroup} label="Pendientes a OJT" tone="violet" /></div></header>
      <nav className="flex overflow-x-auto border-y border-slate-200 px-3">{tabs.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold ${tab === item.id ? 'border-[#0A5AA3] text-[#0A5AA3]' : 'border-transparent text-slate-500'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</nav>
      {actionError && <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertCircle className="h-4 w-4" />{actionError}<button className="ml-auto" onClick={() => setActionError('')}><X className="h-4 w-4" /></button></div>}
      <div className="p-5">
        {tab === 'PROPUESTAS' && <OffersPanel key={selected.id} companyId={selected.companyId!} groupId={selected.id}/>}
        {tab === 'RESUMEN' && <><TrainingPreparation cohort={selected} participants={participants} /><Summary cohort={selected} participants={participants} trainerName={currentUser.name} /></>}
        {tab === 'ASISTENCIA' && <AttendancePanel participants={participants} date={attendanceDate} setDate={date => { setFollowingToday(false); setWindowInfo(null); setAttendanceDate(date); }} onToday={() => { setFollowingToday(true); setAttendanceDate(windowInfo ? limaDate(new Date(windowInfo.serverNow)) : todayInLima()); }} windowInfo={windowInfo} loading={windowLoading} saving={saving} onMark={markAttendance} onUnlock={() => { setActionError(''); setUnlockOpen(true); }} onDecision={decideUnlock} canDecide={['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION'].includes(currentUser.role)} openCandidate360={openCandidate360} />}

        {tab === 'OJT' && <OjtPanel participants={participants} saving={saving} onStart={candidate => void changeParticipant(candidate, 'EN_OJT')} onApprove={candidate => void changeParticipant(candidate, 'APTO_ALTA')} onAdd={addOjtMetric} />}
        {tab === 'RESULTADO' && <TrainingFinalPanel participants={participants} saving={saving} onAlta={sendToTalent} />}
      </div>
    </section>
    {unlockOpen && <UnlockModal cohort={selected} date={attendanceDate} error={actionError} reason={unlockReason} setReason={setUnlockReason} saving={saving} onClose={() => setUnlockOpen(false)} onSubmit={submitUnlock} />}
  </div>;
};

const AssignedList: React.FC<{ assigned: TrainingCohort[]; candidates: CandidateRecord[]; today: string; pendingOjt: number; onOpen: (cohort: TrainingCohort) => void }> = ({ assigned, candidates, today, pendingOjt, onOpen }) => <div className="min-h-full bg-[#F3F6F8] p-4 md:p-6"><header className="mb-5"><h1 className="text-2xl font-bold tracking-tight text-[#092446]">Mis Capacitaciones Asignadas</h1><p className="mt-1 text-xs text-slate-500">Selecciona una capacitación para gestionar asistencia, finalizar la etapa teórica y dar seguimiento a OJT.</p></header><section className="mb-5 grid overflow-hidden rounded-2xl border border-[#DCE5EA] bg-white shadow-[0_4px_18px_rgba(15,35,55,.04)] sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-slate-200"><Metric icon={Users} value={assigned.length} label="Grupos asignados" detail="Total de grupos a tu cargo" tone="green" /><Metric icon={Calendar} value={assigned.filter(item => item.startDate === today).length} label="Programados hoy" detail="Inician en la fecha actual" /><Metric icon={GraduationCap} value={assigned.filter(item => item.status === 'EN_OJT').length} label="En OJT" detail="Con actividad en piso" tone="orange" /><Metric icon={ClipboardCheck} value={pendingOjt} label="Pendientes a OJT" detail="Etapa teórica finalizada" tone="violet" /></section>{assigned.length === 0 ? <section className="rounded-2xl border border-[#DCE5EA] bg-white px-6 py-16 text-center"><GraduationCap className="mx-auto h-11 w-11 text-slate-300" /><h2 className="mt-3 text-base font-bold text-[#0B2847]">No tienes capacitaciones asignadas</h2><p className="mt-1 text-xs text-slate-500">Cuando el coordinador te asigne un grupo aparecerá aquí.</p></section> : <section className="grid gap-4 lg:grid-cols-2">{assigned.map(cohort => { const count = candidates.filter(item => item.training?.cohortId === cohort.id || item.trainingId === cohort.id).length || cohort.enrolledCount; const capacity = cohort.maxCapacity || cohort.enrolledCount || 1; const progress = Math.max(0, Math.min(100, cohort.progressPercent ?? Math.round((count / capacity) * 100))); return <article key={cohort.id} className="rounded-2xl border border-[#DCE5EA] bg-white p-4 shadow-[0_4px_16px_rgba(15,35,55,.035)] transition hover:border-blue-300"><div className="flex items-start justify-between gap-3"><div><span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">{cohort.code}</span><h2 className="mt-2 text-sm font-bold text-[#092446]">{cohort.name}</h2><p className="mt-1 text-[11px] text-slate-500">{cohort.campaignName} · {cohort.modality} · {cohort.location || 'Sede por definir'}</p></div><span className={`rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(cohort.status)}`}>{statusLabel(cohort.status)}</span></div><div className="mt-4 grid grid-cols-[1fr_auto] gap-5 border-t border-slate-100 pt-3"><div className="space-y-1.5 text-[11px] text-slate-600"><p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" />{formatDate(cohort.startDate)} – {formatDate(cohort.endDate)}</p><p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />{cohort.schedule}</p><p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{cohort.location || 'Sede por definir'}</p></div><div className="min-w-32 text-right"><p className="text-sm font-bold text-[#0B2847]">{count} / {capacity}</p><p className="text-[10px] text-slate-500">Participantes</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#159E9C]" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-[10px] font-semibold text-slate-500">{progress}%</p></div></div><div className="mt-3 flex justify-end"><button onClick={() => onOpen(cohort)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-4 py-2 text-xs font-bold text-[#0A4F87] hover:bg-blue-50">Abrir gestión <ArrowRight className="h-3.5 w-3.5" /></button></div></article>; })}</section>}</div>;

const Summary: React.FC<{ cohort: TrainingCohort; participants: CandidateRecord[]; trainerName: string }> = ({ cohort, participants, trainerName }) => <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Formador', cohort.trainerName || trainerName], ['Participantes', `${participants.length || cohort.enrolledCount}/${cohort.maxCapacity || cohort.enrolledCount || 0}`], ['Modalidad / sede', `${cohort.modality} · ${cohort.location || 'Por definir'}`], ['Horario de clases', cohort.schedule]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-[#0B2847]">{value}</p></div>)}</div><div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Etapa actual</p><h2 className="mt-1 text-base font-bold text-[#0B2847]">{statusLabel(cohort.status)}</h2></div><strong className="text-2xl text-[#159E9C]">{cohort.progressPercent ?? 0}%</strong></div><div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#159E9C]" style={{ width: `${cohort.progressPercent ?? 0}%` }} /></div><div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">{[['Inicio', cohort.startDate], ['Fin teoría', cohort.ojtStartDate], ['Inicio OJT', cohort.ojtStartDate], ['Fin OJT', cohort.ojtEndDate || cohort.endDate]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xs font-bold text-slate-700">{formatDate(value)}</p></div>)}</div></div></div>;



const OjtPanel: React.FC<{participants: CandidateRecord[]; saving: boolean; onStart: (c: CandidateRecord) => void; onApprove: (c: CandidateRecord) => void; onAdd: (c: CandidateRecord) => void}> = ({participants, saving, onStart, onApprove, onAdd}) => <section>
<h2 className="mb-4 font-semibold">Seguimiento OJT</h2><div className="grid gap-3 lg:grid-cols-2">{participants.map(candidate => {
 const active = candidate.training?.status === 'EN_OJT';
 const approved = candidate.training?.status === 'OJT_APROBADO';
 const ready = candidate.training?.status === 'PENDIENTE_OJT';
 return <article key={candidate.id} className="rounded-xl border p-4"><h3 className="font-semibold">{candidate.fullName}</h3>
 <p className="text-sm text-slate-600">{approved ? 'OJT aprobado' : active ? 'En OJT' : ready ? 'Pendiente a OJT' : 'Etapa teórica pendiente'} · {candidate.ojt?.dailyMetrics?.length ?? 0} jornadas</p>
 <div className="mt-3 flex flex-wrap gap-2"><button disabled={saving || !ready} onClick={() => onStart(candidate)} className="rounded border px-3 py-2 disabled:opacity-50">Iniciar OJT</button>
 <button disabled={saving || !active} onClick={() => onAdd(candidate)} className="rounded border px-3 py-2 disabled:opacity-50">Registrar avance</button>
 <button disabled={saving || !active} onClick={() => onApprove(candidate)} className="rounded bg-[#143c55] px-3 py-2 text-white disabled:opacity-50">Aprobar OJT</button></div></article>;
})}</div></section>;

const UnlockModal: React.FC<{ cohort: TrainingCohort; date: string; error: string; reason: string; setReason: (value: string) => void; saving: boolean; onClose: () => void; onSubmit: () => void }> = ({ cohort, date, error, reason, setReason, saving, onClose, onSubmit }) => <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-200 p-5"><div><h2 className="text-base font-bold text-[#0B2847]">Solicitar desbloqueo</h2><p className="mt-1 text-[11px] text-slate-500">{cohort.code} · {formatDate(date)}</p></div><button onClick={onClose} className="text-slate-400"><X className="h-5 w-5" /></button></div><div className="p-5"><label className="text-xs font-semibold text-slate-700">Motivo obligatorio</label><textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} rows={4} placeholder="Explica por qué necesitas corregir la asistencia…" className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-blue-400" /><p className="mt-2 text-[10px] text-slate-500">Mínimo 5 caracteres. La solicitud llegará a la bandeja de Formación del coordinador autorizado y quedará auditada para este grupo y fecha.</p>{error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}</div><div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">Cancelar</button><button disabled={saving} onClick={onSubmit} className="rounded-lg bg-[#0B2847] px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">Enviar solicitud</button></div></div></div>;
