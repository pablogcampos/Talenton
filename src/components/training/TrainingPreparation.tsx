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
  return <section className="mb-6 space-y-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="-mx-5 -mt-5 border-b border-teal-100 bg-gradient-to-r from-teal-50 to-white px-5 py-5 sm:-mx-6 sm:-mt-6 sm:px-6"><p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Formación del grupo</p><h2 className="mt-1 text-xl font-bold text-[#0b2847]">Etapa teórica</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">Gestiona el inicio del grupo y registra las notas finales para continuar a OJT.</p></div>
    {canManage && <div className="flex flex-wrap gap-3">
      {pending.length > 0 && ['PROGRAMADA','EN_CAPACITACION'].includes(cohort.status) &&
        <button disabled={saving} onClick={()=>void run('start')} className="min-h-11 rounded-xl bg-[#143c55] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b2847] focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50">Iniciar capacitación del grupo ({pending.length})</button>}
      {cohort.status === 'EN_CAPACITACION' && active.length > 0 &&
        <button disabled={saving} onClick={()=>{setFinishing(true);setError('');}} className="min-h-11 rounded-xl bg-[#143c55] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b2847] focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50">Finalizar etapa teórica</button>}
    </div>}
    {finishing && cohort.status === 'EN_CAPACITACION' && <form className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4 sm:p-5" onSubmit={e=>{e.preventDefault();if(valid)void run('finish');}}>
      <h3 className="font-semibold">Nota final de la capacitación</h3>
      <p className="text-sm text-slate-600">Escala de 0 a 20. Al guardar, los participantes quedarán en Pendiente a OJT.</p>
      {active.map(p=><label key={p.id} className="flex flex-col justify-between gap-3 border-b border-teal-100 py-3 text-sm font-medium sm:flex-row sm:items-center">{p.fullName}
        <input aria-label={'Nota final de '+p.fullName} type="number" min="0" max="20" step="any" required disabled={saving} value={grades[p.id]??''}
          onChange={e=>setGrades(previous=>({...previous,[p.id]:e.target.value}))} className="w-28 rounded-lg border border-slate-300 bg-white p-3 text-center font-semibold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
      </label>)}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={saving} onClick={()=>setFinishing(false)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Cancelar</button>
        <button disabled={saving || !valid} className="min-h-11 rounded-xl bg-[#143c55] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b2847] focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50">Guardar notas y finalizar etapa teórica</button></div>
    </form>}
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#0b2847]">Participantes <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{people.length}</span></h3><span className="text-xs text-slate-500">Estado de la etapa teórica</span></div><ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-sm">{people.map(p=><li key={p.id} className="flex flex-col justify-between gap-3 px-4 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center">
      <span className="flex min-w-0 items-center gap-3 font-medium text-[#0b2847]"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#edf4f8] text-xs font-semibold text-[#143c55]">{p.fullName.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('')}</span><span className="break-words">{p.fullName}</span></span><span className={`self-start rounded-full px-3 py-1.5 text-xs font-medium sm:self-auto ${p.training?.status === 'PENDIENTE_OJT' ? 'bg-amber-50 text-amber-800' : p.training?.status === 'EN_CAPACITACION' ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>{p.training?.status === 'PENDIENTE_OJT' ? 'Pendiente a OJT' : p.training?.status === 'EN_CAPACITACION' ? 'En capacitación' : p.training?.status === 'PENDIENTE_INICIO' ? 'Pendiente de inicio' : p.training?.status?.replaceAll('_',' ')}
      {typeof p.training?.finalGrade === 'number' && <> · Nota final: {p.training.finalGrade}/20</>}</span>
    </li>)}</ul>
    {people.some(p=>(p.training?.evaluations?.length??0)>0) && <details className="rounded-xl border border-slate-200 px-4 py-3 text-sm"><summary className="cursor-pointer">Historial de notas anteriores</summary>
      {people.filter(p=>(p.training?.evaluations?.length??0)>0).map(p=><div key={p.id} className="mt-2"><strong>{p.fullName}</strong><ul>{p.training.evaluations.map(e=><li key={e.id}>{e.moduleName}: {e.score}/{e.maxScore}</li>)}</ul></div>)}
    </details>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
  </section>;
};
