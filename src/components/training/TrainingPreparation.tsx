import React, { useState } from 'react';
import { useTalent } from '../../context/TalentContext';
import type { TrainingCohort, CandidateRecord } from '../../types';
import { getWorkerErrorMessage } from '../../services/workerApi';
import { limaDay } from '../../../shared/trainingRules';

export const TrainingPreparation: React.FC<{cohort: TrainingCohort; participants?: CandidateRecord[]}> = ({cohort, participants = []}) => {
  const {currentUser, addCustomEvaluationToCohort, updateParticipantTrainingStatus} = useTalent();
  const [name, setName] = useState('');
  const [maxScore, setMaxScore] = useState('20');
  const [minScore, setMinScore] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canConfigure = ['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION'].includes(currentUser.role)
    || (currentUser.role === 'FORMADOR' && cohort.trainerId === currentUser.id);
  const definitions = cohort.evaluationsConfig ?? [];
  const pending = participants.filter(p => ['PENDIENTE_INICIO', 'REPROGRAMADO'].includes(String(p.training?.status)));
  const run = async (action: () => Promise<void>) => {
    if (saving) return;
    setSaving(true); setError('');
    try { await action(); } catch (e) { setError(getWorkerErrorMessage(e, 'No se pudo completar la acción.')); }
    finally { setSaving(false); }
  };
  return <section className="mb-4 space-y-3 rounded-xl border border-slate-200 p-4">
    <h2 className="font-semibold">Preparación de la capacitación</h2>
    {definitions.length === 0 ? <p role="status" className="text-sm text-amber-800">Falta configurar las evaluaciones. El formador asignado puede definir aquí los módulos y sus notas mínimas antes de evaluar.</p>
      : <ul className="text-sm text-slate-600">{definitions.map(d => <li key={d.id}>{d.name}: mínimo {d.minScore} de {d.maxScore}</li>)}</ul>}
    {canConfigure && !['FINALIZADA', 'CANCELADA'].includes(cohort.status) && <form className="flex flex-wrap items-end gap-3" onSubmit={e => {
      e.preventDefault();
      void run(async () => { await addCustomEvaluationToCohort(cohort.id, {name: name.trim(), date: limaDay(), maxScore: Number(maxScore), minScore: Number(minScore)}); setName(''); });
    }}>
      <label className="text-sm">Módulo<input required value={name} onChange={e => setName(e.target.value)} className="block rounded border p-2" /></label>
      <label className="text-sm">Nota máxima<input required type="number" min="0.01" step="any" value={maxScore} onChange={e => setMaxScore(e.target.value)} className="block w-28 rounded border p-2" /></label>
      <label className="text-sm">Nota mínima<input required type="number" min="0" max={maxScore} step="any" value={minScore} onChange={e => setMinScore(e.target.value)} className="block w-28 rounded border p-2" /></label>
      <button disabled={saving || !name.trim()} className="rounded bg-[#143c55] px-4 py-2 text-white disabled:opacity-50">Agregar evaluación</button>
    </form>}
    {pending.length > 0 && <div>
      {cohort.status !== 'EN_CAPACITACION' && <p className="text-sm text-slate-600">El responsable de Formación debe iniciar el grupo antes de iniciar a sus participantes.</p>}
      <ul className="mt-2 space-y-2">{pending.map(p => <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
        <span>{p.fullName} · Pendiente de inicio</span>
        <button disabled={saving || cohort.status !== 'EN_CAPACITACION'} className="rounded border px-3 py-2 disabled:opacity-50"
          onClick={() => void run(() => updateParticipantTrainingStatus(p.id, 'EN_CAPACITACION', 'Inicio confirmado por Formación.'))}>Iniciar capacitación</button>
      </li>)}</ul>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
};
