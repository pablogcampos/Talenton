import {OjtMetricModal,OjtMetricsTable} from '../components/training/OjtMetrics';
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
  // Feedback form modal
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [fbStrong, setFbStrong] = useState('');
  const [fbImprove, setFbImprove] = useState('');
  const [fbPlan, setFbPlan] = useState('');
  const [fbDate, setFbDate] = useState(limaDay());

  // Extension modal
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [extensionDays, setExtensionDays] = useState(2);
  const [extensionReason, setExtensionReason] = useState('Refuerzo de gestión comercial.');
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
            Seguimiento de venta bruta, venta neta, días de OJT y calidad. Los indicadores no condicionan la asistencia ni la aptitud para alta.
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
                const totalSales = (cand.ojt?.dailyMetrics||[]).reduce((sum,m)=>sum+(m.grossSales??m.sales??0),0);


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
                        <span className="text-slate-400">Días OJT:</span> <strong>{cand.ojt?.dailyMetrics?.at(-1)?.ojtDays??cand.ojt?.dailyMetrics?.length??0}</strong>
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
                    Indicadores OJT
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

              <OjtMetricsTable metrics={activeCandidate.ojt?.dailyMetrics||[]}/>
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

      {showMetricModal&&activeCandidate&&<OjtMetricModal onClose={()=>setShowMetricModal(false)} onSave={metric=>recordOjtDailyMetricForParticipant(activeCandidate.id,metric)}/>}
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
