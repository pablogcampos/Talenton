import { TrainingFinalPanel } from '../components/training/TrainingFinalPanel';
import { limaDay } from '../../shared/trainingRules';
import React, { useState } from 'react';
import { 
  Headphones, 
  TrendingUp, 
  Award, 
  Clock, 
  PhoneCall, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare, 
  Plus, 
  Check, 
  RotateCw, 
  UserX, 
  X,
  Sliders,
  ChevronRight,
  Sparkles,
  BarChart2,
  Calendar,
  Building2,
  Users,
  Target,
  ArrowUpRight,
  ShieldCheck,
  UserMinus,
  Briefcase
} from 'lucide-react';
import { useTalent } from '../context/TalentContext';
import { getWorkerErrorMessage } from '../services/workerApi';
import { 
  CandidateRecord, 
  OjtStatus, 
  OjtSkillsMatrix, 
  OjtDailyMetric, 
  OjtFeedback 
} from '../types';
import { RegisterDropoutModal } from '../components/modals/RegisterDropoutModal';

export const OjtView: React.FC = () => {
  const { 
    scopedCandidates: candidates,
    openCandidate360, 
    updateOjtStatus, 
    recordOjtDailyMetricForParticipant,
    updateOjtSkillsMatrix, 
    addOjtFeedback,
    updateParticipantTrainingStatus,
    approveParticipantToTalentAlta,
    extendCohortOjt,
    setActiveModule,
    currentUser,
  } = useTalent();

  // Candidates with OJT presence (active OJT, Apto para Alta, or dropped in OJT)
  const ojtCandidates = candidates.filter(c => 
    c.currentStage === 'OJT' || 
    c.training?.status === 'PENDIENTE_OJT' ||
    c.training?.status === 'EN_OJT' || 
    c.ojt?.status === 'EN_PISO' || 
    c.ojt?.status === 'EN_PROCESO' || 
    c.currentStage === 'APTO_ALTA' || 
    c.ojt?.status === 'APTO_ALTA'
  );

  const [selectedParticipantId, setSelectedParticipantId] = useState<string>(ojtCandidates[0]?.id || '');
  const activeCandidate = candidates.find(c => c.id === selectedParticipantId) || ojtCandidates[0];

  const [statusTab, setStatusTab] = useState<'PENDIENTE_OJT' | 'EN_PISO' | 'APTO_ALTA' | 'TODOS'>('TODOS');

  // Daily metric logger modal
  const [showMetricModal, setShowMetricModal] = useState(false);
  const [metricSales, setMetricSales] = useState<number>(3);
  const [metricHours, setMetricHours] = useState<number>(6);
  const [metricCalls, setMetricCalls] = useState<number>(85);
  const [metricAht, setMetricAht] = useState<number>(240);
  const [metricQa, setMetricQa] = useState<number>(90);

  // Skills matrix modal
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [skillsForm, setSkillsForm] = useState<OjtSkillsMatrix>({
    manejoObjeciones: 4,
    diccionModulacion: 4,
    velocidadSistemas: 4,
    empatiaEscucha: 4,
    tecnicaCierre: 4,
    cumplimientoProcesos: 4
  });

  // Feedback form modal
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [fbStrong, setFbStrong] = useState('');
  const [fbImprove, setFbImprove] = useState('');
  const [fbPlan, setFbPlan] = useState('');
  const [fbDate, setFbDate] = useState(limaDay());

  // Extension modal
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [extensionDays, setExtensionDays] = useState(2);
  const [extensionReason, setExtensionReason] = useState('Refuerzo de técnica de cierre y superación de meta SPH.');
  const [actionError, setActionError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const canExtendOjt = ['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION'].includes(currentUser.role);

  // Dropout modal
  const [dropoutTarget, setDropoutTarget] = useState<CandidateRecord | null>(null);

  // Filtered by sub-tab
  const filteredList = ojtCandidates.filter(c => {
    if (statusTab === 'PENDIENTE_OJT') return c.training?.status === 'PENDIENTE_OJT';
    if (statusTab === 'EN_PISO') return c.currentStage === 'OJT' || c.ojt?.status === 'EN_PISO' || c.ojt?.status === 'EN_PROCESO';
    if (statusTab === 'APTO_ALTA') return c.currentStage === 'APTO_ALTA' || c.ojt?.status === 'APTO_ALTA';
    return true;
  });

  const handleSaveMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate) return;

    const currentMetrics = activeCandidate.ojt?.dailyMetrics || [];
    const dayNum = currentMetrics.length + 1;
    const sph = metricHours > 0 ? Number((metricSales / metricHours).toFixed(2)) : 0;
    const spd = metricSales;

    setActionError(''); setIsSaving(true);
    try { await recordOjtDailyMetricForParticipant(activeCandidate.id, {
      dayNumber: dayNum,
      date: limaDay(),
      hoursWorked: Number(metricHours),
      sales: Number(metricSales),
      sph,
      spd,
      ahtSeconds: Number(metricAht),
      qaScore: Number(metricQa)
    }); setShowMetricModal(false); } catch (error) { setActionError(getWorkerErrorMessage(error, 'No se pudo guardar la métrica.')); } finally { setIsSaving(false); }
  };

  const handleSaveSkills = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate) return;
    setActionError(''); setIsSaving(true);
    try { await updateOjtSkillsMatrix(activeCandidate.id, skillsForm); setShowSkillsModal(false); } catch (error) { setActionError(getWorkerErrorMessage(error, 'No se pudo guardar la evaluación.')); } finally { setIsSaving(false); }
  };

  const handleSaveFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate) return;
    setActionError(''); setIsSaving(true);
    try { await addOjtFeedback(activeCandidate.id, {
      date: fbDate,
      strongPoints: fbStrong,
      improvementPoints: fbImprove,
      actionPlan: fbPlan,
      coach: activeCandidate.ojt?.coachName || 'Formador OJT asignado',
      commitmentDate: fbDate,
      participantSigned: false
    }); setShowFeedbackModal(false);
    setFbStrong('');
    setFbImprove('');
    setFbPlan(''); } catch (error) { setActionError(getWorkerErrorMessage(error, 'No se pudo guardar el feedback.')); } finally { setIsSaving(false); }
  };

  const handleApproveAptoAlta = async (candId: string) => {
    setActionError(''); setIsSaving(true);
    try { await updateParticipantTrainingStatus(candId, 'APTO_ALTA', 'Completó satisfactoriamente el periodo OJT.'); } catch (error) { setActionError(getWorkerErrorMessage(error, 'No se pudo actualizar el resultado.')); } finally { setIsSaving(false); }
  };

  const sendToTalent = async (candidate: CandidateRecord) => {
    if(isSaving) return;
    setIsSaving(true); setActionError('');
    try { await approveParticipantToTalentAlta(candidate.id, 'Requisitos verificados por Formación.'); }
    catch(e) { setActionError(getWorkerErrorMessage(e, 'No se pudo enviar a Gestión de Talento.')); }
    finally { setIsSaving(false); }
  };
  const handleApplyExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate) return;
    if (!canExtendOjt) return setActionError('Solo Jefe o Coordinación de Formación puede extender el OJT.');
    setActionError(''); setIsSaving(true);
    try { if (activeCandidate.training?.cohortId) await extendCohortOjt(activeCandidate.training.cohortId, extensionDays, extensionReason); setShowExtensionModal(false); } catch (error) { setActionError(getWorkerErrorMessage(error, 'No se pudo extender el OJT.')); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header */}
      {activeCandidate?.training?.status === 'OJT_APROBADO' && <TrainingFinalPanel participants={[activeCandidate]} saving={isSaving} onAlta={sendToTalent} />}
      {actionError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{actionError}</div>}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900">
              Formación & OJT (En Piso)
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Seguimiento Operativo y Curva de Aprendizaje
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Gestión de OJT (entrenamiento en puesto)</h1>
          <p className="text-sm text-slate-500">
            Monitoreo diario de ventas (SPH/SPD), matriz de habilidades comerciales, sesiones de coaching y pase de aptos a contratación.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-amber-50 text-amber-900 px-3.5 py-2 rounded-xl border border-amber-200 text-xs font-bold">
          <Headphones className="w-4 h-4 text-amber-700" />
          <span>{ojtCandidates.length} en seguimiento OJT</span>
        </div>
      </div>

      {/* Main 2-Column Split: Participants list & Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: OJT Participants List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/70 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>Participantes en Piso</span>
              <span className="text-indigo-600 font-bold">{filteredList.length}</span>
            </h2>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-[11px]">
              <button onClick={()=>setStatusTab('PENDIENTE_OJT')} className="rounded-lg px-3 py-2 text-xs font-semibold">Pendiente a OJT ({ojtCandidates.filter(c=>c.training?.status==='PENDIENTE_OJT').length})</button>
              <button
                onClick={() => setStatusTab('EN_PISO')}
                className={`flex-1 py-1 text-center font-bold rounded-lg transition-colors ${
                  statusTab === 'EN_PISO' ? 'bg-amber-100 text-amber-900' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                En Piso ({ojtCandidates.filter(c => c.currentStage === 'OJT' || c.ojt?.status === 'EN_PISO' || c.ojt?.status === 'EN_PROCESO').length})
              </button>
              <button
                onClick={() => setStatusTab('APTO_ALTA')}
                className={`flex-1 py-1 text-center font-bold rounded-lg transition-colors ${
                  statusTab === 'APTO_ALTA' ? 'bg-emerald-100 text-emerald-900' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Aptos Alta ({ojtCandidates.filter(c => c.currentStage === 'APTO_ALTA' || c.ojt?.status === 'APTO_ALTA').length})
              </button>
              <button
                onClick={() => setStatusTab('TODOS')}
                className={`px-2 py-1 text-center font-bold rounded-lg transition-colors ${
                  statusTab === 'TODOS' ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Todos
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[660px] overflow-y-auto custom-scrollbar">
            {filteredList.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Headphones className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No hay participantes en esta vista</p>
                <p className="text-[11px] text-slate-400 mt-1">Los alumnos aprobados en Capacitación aparecerán aquí.</p>
              </div>
            ) : (
              filteredList.map(cand => {
                const isSelected = cand.id === activeCandidate?.id;
                const isReadyHiring = cand.currentStage === 'APTO_ALTA' || cand.ojt?.status === 'APTO_ALTA';
                const totalSales = cand.ojt?.totalSales || 0;
                const sph = cand.ojt?.averageSph || 0;

                return (
                  <div
                    key={cand.id}
                    onClick={() => setSelectedParticipantId(cand.id)}
                    className={`p-4 cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-amber-50/60 border-l-4 border-amber-500' 
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-900">{cand.fullName}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        isReadyHiring 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {cand.training?.status === 'PENDIENTE_OJT' ? 'Pendiente a OJT' : isReadyHiring ? 'Apto Alta' : 'En Piso'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                      DNI {cand.dni} &bull; {cand.training?.cohortCode || 'OJT'}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-400">Ventas:</span> <strong className="text-slate-900">{totalSales}</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400">SPH:</span> <strong className="text-amber-700">{sph}</strong>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Participant OJT Dashboard (8 cols) */}
        {activeCandidate ? (
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-6 p-6">
            
            {/* Participant Top Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    DNI {activeCandidate.dni}
                  </span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                    activeCandidate.currentStage === 'APTO_ALTA'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {activeCandidate.training?.status === 'PENDIENTE_OJT' ? 'Pendiente a OJT' : activeCandidate.currentStage === 'APTO_ALTA' ? 'Apto para Alta' : 'En Piso OJT'}
                  </span>
                </div>

                <h2 className="text-xl font-bold text-slate-900 mt-1">{activeCandidate.fullName}</h2>
                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3 mt-1">
                  <span>Campaña: <strong className="text-slate-700">{activeCandidate.training?.cohortName || 'Servicio Operativo'}</strong></span>
                  <span>Formador: <strong>{activeCandidate.ojt?.coachName || 'Formador asignado'}</strong></span>
                </div>
              </div>

              {activeCandidate.training?.status === 'PENDIENTE_OJT' && <button disabled={isSaving} className="rounded bg-[#143c55] px-4 py-2 text-white disabled:opacity-50" onClick={async()=>{
                setIsSaving(true);setActionError('');
                try{await updateParticipantTrainingStatus(activeCandidate.id,'EN_OJT','Inicio después de finalizar teoría.');}
                catch(e){setActionError(getWorkerErrorMessage(e,'No se pudo iniciar OJT.'));}
                finally{setIsSaving(false);}
              }}>Iniciar OJT</button>}
              {/* Action Buttons: Apto Alta, Extension, Baja */}
              <div className="flex flex-wrap items-center gap-2">
                {activeCandidate.currentStage !== 'APTO_ALTA' ? (
                  <>
                    <button
                      onClick={() => handleApproveAptoAlta(activeCandidate.id)}
                      disabled={isSaving || activeCandidate.training?.status !== 'EN_OJT'}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Aprobar OJT</span>
                    </button>

                    {canExtendOjt && <button
                      onClick={() => setShowExtensionModal(true)}
                      className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                      title="Extender días de OJT"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Extender OJT</span>
                    </button>}
                  </>
                ) : (
                  <button
                    onClick={() => setActiveModule('FORMACION_MIS_CAPACITACIONES')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Briefcase className="w-4 h-4" />
                    <span>Ver capacitación</span>
                  </button>
                )}

                <button
                  onClick={() => setDropoutTarget(activeCandidate)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 transition-colors"
                  title="Reportar Baja en OJT"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Daily Operational Metrics Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                    Métricas Operativas en Piso (SPH / SPD)
                  </h3>
                  <p className="text-xs text-slate-500">Registro diario de productividad durante la fase de OJT.</p>
                </div>

                <button
                  onClick={() => setShowMetricModal(true)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar Día OJT</span>
                </button>
              </div>

              {/* KPI Summary boxes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Total Ventas / Cierres</span>
                  <div className="text-xl font-extrabold text-slate-900 mt-0.5">{activeCandidate.ojt?.totalSales || 0}</div>
                  <span className="text-[10px] text-slate-400">Acumulado OJT</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Promedio SPH</span>
                  <div className="text-xl font-extrabold text-amber-700 mt-0.5">{activeCandidate.ojt?.averageSph || 0}</div>
                  <span className="text-[10px] text-slate-400">Ventas por hora</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Promedio SPD</span>
                  <div className="text-xl font-extrabold text-slate-900 mt-0.5">{activeCandidate.ojt?.averageSpd || 0}</div>
                  <span className="text-[10px] text-slate-400">Ventas por día</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Días Registrados</span>
                  <div className="text-xl font-extrabold text-indigo-700 mt-0.5">{activeCandidate.ojt?.dailyMetrics?.length || 0}</div>
                  <span className="text-[10px] text-slate-400">Jornadas en piso</span>
                </div>
              </div>

              {/* Daily Log Table */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Jornada</th>
                      <th className="p-3">Fecha</th>
                      <th className="p-3 text-center">Horas</th>
                      <th className="p-3 text-center">Ventas</th>
                      <th className="p-3 text-center">SPH</th>
                      <th className="p-3 text-center">AHT</th>
                      <th className="p-3 text-center">Calidad QA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(!activeCandidate.ojt?.dailyMetrics || activeCandidate.ojt.dailyMetrics.length === 0) ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-slate-400 italic">
                          No hay registros diarios de OJT para este participante.
                        </td>
                      </tr>
                    ) : (
                      activeCandidate.ojt.dailyMetrics.map((m, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-800">Día {m.dayNumber || idx + 1}</td>
                          <td className="p-3 text-slate-500">{m.date}</td>
                          <td className="p-3 text-center">{m.hoursWorked || 6}h</td>
                          <td className="p-3 text-center font-bold text-slate-900">{m.sales || m.conversions || 0}</td>
                          <td className="p-3 text-center font-bold text-amber-700">{m.sph || 0}</td>
                          <td className="p-3 text-center text-slate-600">{m.ahtSeconds || 240}s</td>
                          <td className="p-3 text-center font-bold text-emerald-700">{m.qaScore || 90}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Skills Matrix Section (6 Core Competencies) */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-600" />
                    Matriz de Habilidades Operativas (1 - 5)
                  </h3>
                  <p className="text-xs text-slate-500">Evaluación continua de competencias críticas en llamada.</p>
                </div>

                <button
                  onClick={() => {
                    if (activeCandidate.ojt?.skillsMatrix) {
                      setSkillsForm(activeCandidate.ojt.skillsMatrix);
                    }
                    setShowSkillsModal(true);
                  }}
                  className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                >
                  Editar Matriz
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Manejo de Objeciones', val: activeCandidate.ojt?.skillsMatrix?.manejoObjeciones || 4 },
                  { label: 'Dicción y Modulación', val: activeCandidate.ojt?.skillsMatrix?.diccionModulacion || 4 },
                  { label: 'Velocidad en Sistemas', val: activeCandidate.ojt?.skillsMatrix?.velocidadSistemas || 4 },
                  { label: 'Empatía y Escucha Activa', val: activeCandidate.ojt?.skillsMatrix?.empatiaEscucha || 4 },
                  { label: 'Técnica de Cierre', val: activeCandidate.ojt?.skillsMatrix?.tecnicaCierre || 4 },
                  { label: 'Cumplimiento de Procesos', val: activeCandidate.ojt?.skillsMatrix?.cumplimientoProcesos || 4 }
                ].map((skill, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{skill.label}</span>
                      <span className="font-bold text-purple-700">{skill.val} / 5</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-600 rounded-full transition-all"
                        style={{ width: `${(skill.val / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coaching & Feedback Log */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    Sesiones de Coaching y Retroalimentación
                  </h3>
                  <p className="text-xs text-slate-500">Historial de compromisos y feedback del coach.</p>
                </div>

                <button
                  onClick={() => setShowFeedbackModal(true)}
                  className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Nueva retroalimentación</span>
                </button>
              </div>

              {(!activeCandidate.ojt?.coachingFeedbacks || activeCandidate.ojt.coachingFeedbacks.length === 0) ? (
                <div className="p-4 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
                  No hay sesiones de feedback registradas.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeCandidate.ojt.coachingFeedbacks.map((fb, idx) => (
                    <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">Formador: {fb.coach}</span>
                        <span className="text-[11px] text-slate-500">{fb.date}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                        <div>
                          <strong className="text-emerald-700 block">Fortalezas:</strong>
                          <span className="text-slate-600">{fb.strongPoints || '-'}</span>
                        </div>
                        <div>
                          <strong className="text-amber-700 block">Oportunidades:</strong>
                          <span className="text-slate-600">{fb.improvementPoints || '-'}</span>
                        </div>
                        <div>
                          <strong className="text-indigo-700 block">Plan de Acción:</strong>
                          <span className="text-slate-600">{fb.actionPlan || '-'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : null}
      </div>

      {/* Metric Modal */}
      {showMetricModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                Registrar Productividad Diaria OJT
              </h3>
              <button onClick={() => setShowMetricModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMetric} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Ventas / Cierres</label>
                  <input
                    type="number"
                    min="0"
                    value={metricSales}
                    onChange={(e) => setMetricSales(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-center text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Horas Trabajadas</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={metricHours}
                    onChange={(e) => setMetricHours(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-center text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">AHT Promedio (segundos)</label>
                  <input
                    type="number"
                    min="60"
                    max="900"
                    value={metricAht}
                    onChange={(e) => setMetricAht(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-center text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Nota Calidad QA (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={metricQa}
                    onChange={(e) => setMetricQa(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-center text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowMetricModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs"
                >
                  Guardar Métricas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Skills Matrix Modal */}
      {showSkillsModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-400" />
                Actualizar Matriz de Habilidades
              </h3>
              <button onClick={() => setShowSkillsModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSkills} className="p-6 space-y-3">
              {([ 
                { key: 'manejoObjeciones', label: 'Manejo de Objeciones' },
                { key: 'diccionModulacion', label: 'Dicción y Modulación' },
                { key: 'velocidadSistemas', label: 'Velocidad en Sistemas' },
                { key: 'empatiaEscucha', label: 'Empatía y Escucha Activa' },
                { key: 'tecnicaCierre', label: 'Técnica de Cierre' },
                { key: 'cumplimientoProcesos', label: 'Cumplimiento de Procesos' }
              ] as { key: keyof OjtSkillsMatrix; label: string }[]).map(item => (
                <div key={item.key} className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700">{item.label}</label>
                  <select
                    value={skillsForm[item.key]}
                    onChange={(e) => setSkillsForm({ ...skillsForm, [item.key]: Number(e.target.value) })}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-purple-700"
                  >
                    <option value="1">1 - Inicial</option>
                    <option value="2">2 - Básico</option>
                    <option value="3">3 - En Desarrollo</option>
                    <option value="4">4 - Competente</option>
                    <option value="5">5 - Sobresaliente</option>
                  </select>
                </div>
              ))}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSkillsModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs"
                >
                  Guardar Matriz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                Registrar retroalimentación
              </h3>
              <button onClick={() => setShowFeedbackModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFeedback} className="p-6 space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Fortalezas Demostradas</label>
                <textarea
                  value={fbStrong}
                  onChange={(e) => setFbStrong(e.target.value)}
                  rows={2}
                  placeholder="Ej: Excelente tono de voz y saludo protocolar..."
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-800"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Oportunidades de Mejora</label>
                <textarea
                  value={fbImprove}
                  onChange={(e) => setFbImprove(e.target.value)}
                  rows={2}
                  placeholder="Ej: Mayor agilidad en búsqueda de promociones en CRM..."
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-800"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Plan de Acción y Compromisos</label>
                <textarea
                  value={fbPlan}
                  onChange={(e) => setFbPlan(e.target.value)}
                  rows={2}
                  placeholder="Ej: Realizar 2 llamadas de calibración con formador mañana..."
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-800"
                  required
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowFeedbackModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Guardar retroalimentación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Extension Modal */}
      {showExtensionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Extensión de Periodo OJT
              </h3>
              <button onClick={() => setShowExtensionModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyExtension} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Días Adicionales de OJT</label>
                <select
                  value={extensionDays}
                  onChange={(e) => setExtensionDays(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-bold"
                >
                  <option value="1">+1 Día adicional de refuerzo</option>
                  <option value="2">+2 Días adicionales de refuerzo</option>
                  <option value="3">+3 Días adicionales (Máximo permitido)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Justificación Técnica de la Extensión</label>
                <textarea
                  value={extensionReason}
                  onChange={(e) => setExtensionReason(e.target.value)}
                  rows={3}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-800"
                  required
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowExtensionModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs"
                >
                  Confirmar Extensión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register Dropout Modal */}
      {dropoutTarget && (
        <RegisterDropoutModal
          isOpen={true}
          onClose={() => setDropoutTarget(null)}
          candidate={dropoutTarget}
          defaultStage="OJT"
        />
      )}

    </div>
  );
};
