import React, { useState } from 'react';
import { useTalent } from '../../context/TalentContext';
import type { TrainingCohort, CandidateRecord } from '../../types';
import { getWorkerErrorMessage, workerApi } from '../../services/workerApi';

export const TrainingPreparation: React.FC<{cohort: TrainingCohort; participants?: CandidateRecord[]}> = ({cohort, participants}) => {
  const {currentUser, scopedCandidates} = useTalent();
  const people = participants ?? scopedCandidates.filter(p => p.training?.cohortId === cohort.id || p.trainingId === cohort.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [grades, setGrades] = useState<Record<string,string>>({});
  const canManage = ['ADMIN','JEFE_FORMACION','COORDINADOR_FORMACION'].includes(currentUser.role)
    || (currentUser.role === 'FORMADOR' && cohort.trainerId === currentUser.id);
  const pending = people.filter(p => p.training?.status === 'PENDIENTE_INICIO');
  const active = people.filter(p => p.training?.status === 'EN_CAPACITACION');
  const valid = active.length > 0 && active.every(p => grades[p.id]?.trim() && Number.isFinite(Number(grades[p.id])) && Number(grades[p.id]) >= 0 && Number(grades[p.id]) <= 20);
  const run = async (action: 'start' | 'finish') => {
    if(saving) return;
    setSaving(true); setError('');
    try {
      await workerApi(`/api/trainings/${encodeURIComponent(cohort.id)}/theory/${action}`, {
        method:'POST', body:JSON.stringify(action === 'finish' ? {grades:active.map(p=>({candidateId:p.id,score:Number(grades[p.id])}))} : {})
      },cohort.companyId);
      setFinishing(false); setGrades({});
    } catch(e) { setError(getWorkerErrorMessage(e,'No se pudo completar la acción.')); }
    finally { setSaving(false); }
  };
  return <section className="mb-4 space-y-3 rounded-xl border border-slate-200 p-4">
    <h2 className="font-semibold">Etapa teórica</h2>
    <p className="text-sm text-slate-600">Inicia al grupo en una sola acción. Al finalizar, registra la nota final de cada participante; no necesitas configurar evaluaciones.</p>
    {canManage && <div className="flex flex-wrap gap-3">
      {pending.length > 0 && ['PROGRAMADA','EN_CAPACITACION'].includes(cohort.status) &&
        <button disabled={saving} onClick={()=>void run('start')} className="rounded bg-[#143c55] px-4 py-2 text-white disabled:opacity-50">Iniciar capacitación del grupo ({pending.length})</button>}
      {cohort.status === 'EN_CAPACITACION' && active.length > 0 &&
        <button disabled={saving} onClick={()=>{setFinishing(true);setError('');}} className="rounded border border-[#143c55] px-4 py-2 disabled:opacity-50">Finalizar etapa teórica</button>}
    </div>}
    {finishing && cohort.status === 'EN_CAPACITACION' && <form className="space-y-3 rounded-lg bg-slate-50 p-4" onSubmit={e=>{e.preventDefault();if(valid)void run('finish');}}>
      <h3 className="font-semibold">Nota final de la capacitación</h3>
      <p className="text-sm text-slate-600">Escala de 0 a 20. Al guardar, los participantes quedarán en Pendiente a OJT.</p>
      {active.map(p=><label key={p.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">{p.fullName}
        <input aria-label={'Nota final de '+p.fullName} type="number" min="0" max="20" step="any" required disabled={saving} value={grades[p.id]??''}
          onChange={e=>setGrades(previous=>({...previous,[p.id]:e.target.value}))} className="w-28 rounded border p-2" />
      </label>)}
      <div className="flex gap-3"><button type="button" disabled={saving} onClick={()=>setFinishing(false)} className="rounded border px-4 py-2">Cancelar</button>
        <button disabled={saving || !valid} className="rounded bg-[#143c55] px-4 py-2 text-white disabled:opacity-50">Guardar notas y finalizar etapa teórica</button></div>
    </form>}
    <ul className="space-y-2 text-sm">{people.map(p=><li key={p.id} className="flex flex-wrap justify-between gap-2">
      <span>{p.fullName}</span><span>{p.training?.status === 'PENDIENTE_OJT' ? 'Pendiente a OJT' : p.training?.status === 'EN_CAPACITACION' ? 'En capacitación' : p.training?.status === 'PENDIENTE_INICIO' ? 'Pendiente de inicio' : p.training?.status?.replaceAll('_',' ')}
      {typeof p.training?.finalGrade === 'number' && <> · Nota final: {p.training.finalGrade}/20</>}</span>
    </li>)}</ul>
    {people.some(p=>(p.training?.evaluations?.length??0)>0) && <details className="text-sm"><summary className="cursor-pointer">Historial de notas anteriores</summary>
      {people.filter(p=>(p.training?.evaluations?.length??0)>0).map(p=><div key={p.id} className="mt-2"><strong>{p.fullName}</strong><ul>{p.training.evaluations.map(e=><li key={e.id}>{e.moduleName}: {e.score}/{e.maxScore}</li>)}</ul></div>)}
    </details>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
};
