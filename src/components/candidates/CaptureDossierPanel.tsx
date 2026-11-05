import React from 'react';
import { X } from 'lucide-react';
import type { CaptureDossier } from '../../services/captureApi';
import { IdentityAvatar } from '../common/IdentityAvatar';
import { CaptureLinkToCampaign } from './CaptureLinkToCampaign';
import { useTalent } from '../../context/TalentContext';
import { CaptureApplicantDetails } from '../capture/CaptureApplicantDetails';

export function CaptureDossierPanel({ dossier, onClose }: { dossier: CaptureDossier; onClose: () => void }) {
  const { candidate, events } = dossier;
  const { currentUser } = useTalent();
  return <div role="dialog" aria-modal="true" aria-label="Expediente del postulante" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"><section className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5">
    <header className="flex items-center justify-between border-b border-slate-200 pb-4"><div className="flex items-center gap-3"><IdentityAvatar name={candidate.fullName} /><div><h2 className="text-lg font-bold">{candidate.fullName}</h2><p className="text-xs text-slate-500">Expediente · {candidate.id}</p></div></div><button aria-label="Cerrar expediente" onClick={onClose}><X size={20} /></button></header>
    <h3 className="mt-4 font-semibold">Datos generales y contacto</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{[['Documento', `${candidate.documentType} ${candidate.documentNumber}`], ['Celular', candidate.phone], ['Correo', candidate.email || 'No registrado'], ['Distrito', candidate.district]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd>{value}</dd></div>)}</dl>
    <h3 className="mt-6 font-semibold">Origen e historial de captaciones</h3><p className="text-xs text-slate-500">Solo se muestra el historial dentro de tu alcance autorizado.</p>
    {events.map(event => <article key={event.id} className="mt-3 rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2 text-sm"><b>{event.source} · {event.status}</b><span>{new Date(event.createdAt).toLocaleString('es-PE')}</span></div><p className="mt-1 text-xs text-slate-500">Reclutador vinculado: {event.ownerUid}</p><CaptureApplicantDetails event={event} />{event.conflict && <p className="text-xs text-orange-700">Coincidencias pendientes de revisión administrativa.</p>}{event.history.map((h, index) => <div key={index} className="mt-3 border-l-2 border-slate-200 pl-3 text-sm"><div>{h.action} · {h.status}</div><div className="text-xs text-slate-500">{new Date(h.at).toLocaleString('es-PE')} · {h.actorUid === 'PUBLIC' ? 'Formulario público' : h.actorUid}</div>{h.note && <p>{h.note}</p>}</div>)}</article>)}
    {['ADMIN', 'RECLUTADOR', 'ANALISTA_SELECCION'].includes(currentUser.role) && <section className="mt-5 border-t border-slate-200 pt-4"><h3 className="mb-3 font-semibold">Vinculación manual a convocatoria</h3>{events.filter(e => !e.conflict && (currentUser.role === 'ADMIN' || currentUser.role === 'ANALISTA_SELECCION' || e.ownerUid === currentUser.id)).map(e => <div key={e.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{e.source} · {new Date(e.createdAt).toLocaleDateString('es-PE')}</span><CaptureLinkToCampaign eventId={e.id} companyId={e.companyId} ownerUid={e.ownerUid} /></div>)}</section>}
  </section></div>;
}
