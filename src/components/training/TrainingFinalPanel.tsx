import React, {useEffect, useState} from 'react';
import type {CandidateRecord, CandidateEligibility} from '../../types';
import {workerApi, getWorkerErrorMessage} from '../../services/workerApi';

const EligibilityRow: React.FC<{candidate: CandidateRecord; saving: boolean; onAlta: (candidate: CandidateRecord) => void}> = ({candidate, saving, onAlta}) => {
  const [eligibility, setEligibility] = useState<CandidateEligibility | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setEligibility(null); setError('');
    workerApi<CandidateEligibility>(`/api/candidates/${encodeURIComponent(candidate.id)}/eligibility`, {}, candidate.companyId)
      .then(value => { if(active) setEligibility(value); })
      .catch(e => { if(active) setError(getWorkerErrorMessage(e, 'No se pudieron verificar los requisitos.')); });
    return () => { active = false; };
  }, [candidate.id, candidate.companyId, candidate.training, candidate.ojt, revision]);
  const transferred = candidate.currentProcess === 'GESTION_TALENTO' || candidate.currentStage === 'GESTION_TALENTO';
  return <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
    <div><h3 className="font-semibold">{candidate.fullName}</h3>
      <p className="text-sm text-slate-600">{transferred ? 'Enviado a Gestión de Talento' : eligibility ? eligibility.eligible ? 'Requisitos completos' : eligibility.pending.join(' · ') : error || 'Verificando requisitos…'}</p>
    </div>
    <div className="flex gap-2"><button disabled={saving} onClick={() => setRevision(r => r + 1)} className="rounded border px-3 py-2">Actualizar requisitos</button>
      <button disabled={saving || transferred || !eligibility?.eligible} onClick={() => onAlta(candidate)} className="rounded bg-[#143c55] px-3 py-2 text-white disabled:opacity-50">Enviar a Gestión de Talento</button></div>
  </li>;
};
export const TrainingFinalPanel: React.FC<{participants: CandidateRecord[]; saving: boolean; onAlta: (candidate: CandidateRecord) => void}> = ({participants, saving, onAlta}) =>
  <section><h2 className="font-semibold">Resultado final</h2><p className="mb-4 text-sm text-slate-600">Se verifican capacitación, OJT, documentos y cuenta sueldo antes del envío.</p>
    <ul className="space-y-3">{participants.map(candidate => <EligibilityRow key={candidate.id} candidate={candidate} saving={saving} onAlta={onAlta} />)}</ul>
  </section>;
