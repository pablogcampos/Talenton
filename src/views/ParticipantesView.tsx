import React, { useState } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  GraduationCap, 
  Headphones, 
  UserCheck, 
  UserMinus, 
  ArrowUpRight, 
  Award, 
  CheckCircle2, 
  Clock, 
  Building2,
  Calendar
} from 'lucide-react';
import { useTalent } from '../context/TalentContext';
import { ParticipantTrainingStatus, CandidateRecord } from '../types';
import { RegisterDropoutModal } from '../components/modals/RegisterDropoutModal';
import { ExpedientBadge } from '../components/common/ExpedientBadge';
import { createDemoTrainingData, DEMO_FORMACION_ENABLED } from '../data/demoTrainingData';

export const ParticipantesView: React.FC = () => {
  const { 
    candidates: liveCandidates, 
    cohorts: liveCohorts, 
    openCandidate360, 
    currentUser,
    updateParticipantTrainingStatus
  } = useTalent();

  const demoData = React.useMemo(() => createDemoTrainingData(currentUser), [currentUser]);
  const shouldUseDemoData = DEMO_FORMACION_ENABLED;
  const candidates = shouldUseDemoData ? demoData.candidates : liveCandidates;
  const cohorts = shouldUseDemoData ? demoData.cohorts : liveCohorts;

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [stageFilter, setStageFilter] = useState<string>('TODOS');
  const [cohortFilter, setCohortFilter] = useState<string>('TODOS');
  const [dropoutCandidateTarget, setDropoutCandidateTarget] = useState<CandidateRecord | null>(null);

  // All candidates in Formación & OJT
  const trainingCandidates = candidates.filter(c => 
    c.training?.cohortId || 
    c.currentStage === 'CAPACITACION' || 
    c.currentStage === 'OJT' || 
    c.currentStage === 'APTO_ALTA' || 
    c.training?.status === 'DESERTO'
  );

  const filteredCandidates = trainingCandidates.filter(c => {
    if (stageFilter === 'EN_CAPACITACION' && (c.currentStage !== 'CAPACITACION' || c.training?.status === 'PENDIENTE_OJT')) return false;
    if (stageFilter === 'PENDIENTE_OJT' && c.training?.status !== 'PENDIENTE_OJT') return false;
    if (stageFilter === 'EN_OJT' && c.currentStage !== 'OJT') return false;
    if (stageFilter === 'APTO_ALTA' && c.currentStage !== 'APTO_ALTA') return false;
    if (stageFilter === 'DESERTO' && c.currentStage !== 'BAJA' && c.training?.status !== 'DESERTO') return false;

    if (cohortFilter !== 'TODOS' && c.training?.cohortId !== cohortFilter) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const match = c.fullName.toLowerCase().includes(q) || 
                    c.dni.includes(q) || 
                    c.email.toLowerCase().includes(q) ||
                    (c.training?.cohortName && c.training.cohortName.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
              Módulo Formación & OJT
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Vista Consolidada de Alumnos
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Participantes en Formación</h1>
          <p className="text-sm text-slate-500">
            Padrón unificado de postulantes en capacitación teórica, piso OJT y aprobados para contratación.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
          <Users className="w-4 h-4 text-indigo-600" />
          <span>{filteredCandidates.length} Participantes</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, DNI o grupo..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-medium">Estado:</span>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="EN_CAPACITACION">En Capacitación (Teoría)</option>
              <option value="PENDIENTE_OJT">Pendiente a OJT</option>
              <option value="EN_OJT">En Piso (OJT)</option>
              <option value="APTO_ALTA">Aptos para Alta</option>
              <option value="DESERTO">Bajas / Deserciones</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-medium">Grupo:</span>
            <select
              value={cohortFilter}
              onChange={(e) => setCohortFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none"
            >
              <option value="TODOS">Todos los Grupos</option>
              {cohorts.map(coh => (
                <option key={coh.id} value={coh.id}>
                  [{coh.code}] {coh.name.slice(0, 30)}...
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Participants Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="p-4">Postulante</th>
                <th className="p-4">Grupo / Cohort</th>
                <th className="p-4">Estado en Formación</th>
                <th className="p-4">Control Documental</th>
                <th className="p-4 text-center">Asistencia %</th>
                <th className="p-4 text-center">Promedio</th>
                <th className="p-4">OJT / Ventas</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No se encontraron participantes con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredCandidates.map(cand => {
                  const isDropout = cand.currentStage === 'BAJA' || cand.training?.status === 'DESERTO';
                  const isOjt = cand.currentStage === 'OJT' || cand.training?.status === 'EN_OJT';
                  const isReadyHiring = cand.currentStage === 'APTO_ALTA';
                  
                  const attCount = cand.training?.attendance?.length || 0;
                  const presentCount = cand.training?.attendance?.filter(a => a.status === 'PRESENTE').length || 0;
                  const attPercent = attCount > 0 ? Math.round((presentCount / attCount) * 100) : 100;
                  
                  const evals = cand.training?.evaluations || [];
                  const avg = cand.training?.finalGrade ?? cand.training?.finalAverage ??
                    (evals.length > 0 ? Number((evals.reduce((a, b) => a + b.score, 0) / evals.length).toFixed(1)) : null);

                  return (
                    <tr key={cand.id} className={`hover:bg-slate-50/70 transition-colors ${isDropout ? 'bg-rose-50/20' : ''}`}>
                      <td className="p-4">
                        <button
                          onClick={() => openCandidate360(cand.id)}
                          className="font-bold text-slate-900 hover:text-indigo-600 text-left transition-colors flex items-center gap-1.5"
                        >
                          <span>{cand.fullName}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="font-mono">DNI {cand.dni}</span>
                          <span>&bull;</span>
                          <span>Tel: {cand.phone}</span>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="font-semibold text-slate-800">{cand.training?.cohortName || 'Sin grupo'}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{cand.training?.cohortCode || '-'}</div>
                      </td>

                      <td className="p-4">
                        {isDropout ? (
                          <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg font-bold text-[11px] inline-flex items-center gap-1">
                            <UserMinus className="w-3 h-3" />
                            <span>Baja / Deserción</span>
                          </span>
                        ) : isReadyHiring ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold text-[11px] inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Apto para Alta</span>
                          </span>
                        ) : isOjt ? (
                          <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg font-bold text-[11px] inline-flex items-center gap-1">
                            <Headphones className="w-3 h-3" />
                            <span>En Piso OJT</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg font-bold text-[11px] inline-flex items-center gap-1">
                            <GraduationCap className="w-3 h-3" />
                            <span>{cand.training?.status === 'PENDIENTE_OJT' ? 'Pendiente a OJT' : 'En Capacitación'}</span>
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <ExpedientBadge candidate={cand} size="xs" />
                      </td>

                      <td className="p-4 text-center font-bold">
                        <span className={attPercent >= 80 ? 'text-emerald-600' : 'text-rose-600'}>
                          {attPercent}%
                        </span>
                      </td>

                      <td className="p-4 text-center font-bold">
                        <span className={avg && avg >= 14 ? 'text-emerald-600' : 'text-slate-700'}>
                          {avg ? `${avg}/20` : '-'}
                        </span>
                      </td>

                      <td className="p-4">
                        {isOjt || isReadyHiring ? (
                          <div className="text-xs">
                            <span className="font-bold text-slate-900">{cand.ojt?.totalSales || 0} ventas</span>
                            <span className="text-[11px] text-slate-500 block">SPH: {cand.ojt?.averageSph || 0}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">En teoría</span>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openCandidate360(cand.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                          >
                            Expediente 360°
                          </button>

                          {!isDropout && (
                            <button
                              onClick={() => setDropoutCandidateTarget(cand)}
                              title="Registrar baja"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 transition-colors"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Dropout Modal */}
      {dropoutCandidateTarget && (
        <RegisterDropoutModal
          isOpen={true}
          onClose={() => setDropoutCandidateTarget(null)}
          candidate={dropoutCandidateTarget}
          defaultStage={dropoutCandidateTarget.currentStage === 'OJT' ? 'OJT' : 'CAPACITACION_TEORICA'}
        />
      )}
    </div>
  );
};
