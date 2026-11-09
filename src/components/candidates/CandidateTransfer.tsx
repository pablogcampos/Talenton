import React, { useEffect, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { useTalent } from '../../context/TalentContext';
import { CandidateRecord } from '../../types';
import { workerApi, getWorkerErrorMessage } from '../../services/workerApi';

export function CandidateTransfer({ candidate }: { candidate: CandidateRecord }) {
  const { currentUser, scopedCampaigns } = useTalent();
  const [menu, setMenu] = useState(false), [open, setOpen] = useState(false), [target, setTarget] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!['ADMIN', 'RECLUTADOR', 'ANALISTA_SELECCION', 'JEFE_SELECCION'].includes(currentUser.role) || candidate.captureOnly) return null;
  const campaigns = scopedCampaigns.filter(c => c.companyId === candidate.companyId && c.id !== candidate.campaignId && !['CERRADO', 'ANULADO', 'EN_PAUSA'].includes(c.status) && (candidate.recruiterId === currentUser.id && currentUser.role === 'ADMIN' || c.responsibles?.some(r => r.userId === candidate.recruiterId))); 
  return <div className="relative">
    <button type="button" title="Más acciones" aria-expanded={menu} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPosition({ top: Math.min(r.bottom + 4, window.innerHeight - 70), left: Math.max(8, r.right - 240) }); setMenu(!menu); }} className="rounded-lg border border-slate-200 p-1.5 text-slate-500"><MoreVertical className="h-3.5 w-3.5" /></button>
    {menu && <div style={position} className="fixed z-50 w-60 rounded-lg border bg-white p-2 shadow-lg"><button type="button" className="w-full p-2 text-left text-sm" onClick={() => { setOpen(true); setMenu(false); setError(''); }}>Asignar a otra convocatoria</button></div>}
    {open && <div role="dialog" aria-modal="true" aria-label="Asignar a otra convocatoria" className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 text-left"><form className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5" onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError('');
      try { await workerApi(`/api/selection/candidates/${encodeURIComponent(candidate.id)}/transfer`, { method: 'POST', body: JSON.stringify({ campaignId: target, fromCampaignId: candidate.campaignId }) }); setOpen(false); }
      catch (e) { setError(getWorkerErrorMessage(e)); } finally { setBusy(false); }
    }}>
      <h2 className="text-lg font-bold">Asignar a otra convocatoria</h2><p>{candidate.fullName}</p>
      <p className="text-sm text-slate-500">Se conservará el estado actual en la convocatoria anterior. La nueva participación comenzará como Nuevo.</p>
      <label className="block text-sm">Nueva convocatoria<select required disabled={busy} value={target} onChange={e => setTarget(e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Selecciona una convocatoria</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border p-2">Cancelar</button><button disabled={busy || !target} className="rounded-lg bg-sky-800 p-2 text-white disabled:opacity-50">{busy ? 'Asignando…' : 'Confirmar traslado'}</button></div>
    </form></div>}
  </div>;
}

export function TransferredCandidates({ campaignId }: { campaignId: string }) {
  const [items, setItems] = useState<any[]>([]), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => workerApi<{ items: any[] }>(`/api/selection/campaigns/${encodeURIComponent(campaignId)}/transfers`).then(r => { if (live) { setItems(r.items); setError(''); } }).catch(e => { if (live) setError(getWorkerErrorMessage(e)); });
    setItems([]); void load(); window.addEventListener('talent:data-changed', load);
    return () => { live = false; window.removeEventListener('talent:data-changed', load); };
  }, [campaignId]);
  if (error) return <p role="alert" className="p-3 text-sm text-red-700">No se pudo cargar el historial de traslados: {error}</p>;
  if (!items.length) return null;
  return <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-semibold">Postulantes trasladados · Historial</h3>{items.map(i => <div key={i.id} className="flex justify-between gap-4 border-t py-3 text-sm"><div><b>{i.name}</b><p className="text-xs text-slate-500">Se asignó a otra convocatoria</p></div><span>{({ APTO_CAPACITACION: 'Apto para capacitación', NO_APTO: 'No apto', DESCARTADO: 'Descartado' } as Record<string, string>)[i.outcome] || i.outcome?.replaceAll('_', ' ')}</span></div>)}</section>;
}
