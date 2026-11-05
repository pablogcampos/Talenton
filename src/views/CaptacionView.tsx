import { formatCaptureTime, captureDay } from '../utils/captureTime';
import React, { useEffect, useState } from 'react';
import { Copy, Download, Link, Plus, RefreshCw } from 'lucide-react';
import { useTalent } from '../context/TalentContext';
import { captureApi, captureSources, captureStates, CaptureLink, CaptureEvent, CaptureDossier } from '../services/captureApi';
import { CaptureDossierPanel } from '../components/candidates/CaptureDossierPanel';
import { getWorkerErrorMessage } from '../services/workerApi';
import { CaptureManagementView } from './CaptureManagementView';
import {CompanyCampaignPicker} from '../components/common/CompanyCampaignPicker';
const CaptureFormBuilder=React.lazy(()=>import('../components/capture/CaptureFormBuilder'));

export function CaptacionView() {
  const { currentUser } = useTalent();
  const [screen,setScreen]=useState<'capture'|'forms'>('capture');
  const canEditForms=currentUser.globalAdmin||(['RECLUTADOR','ANALISTA_SELECCION'].includes(currentUser.role)&&currentUser.allowedModules?.includes('SELECCION'));
  return <div className="space-y-4">
    {canEditForms&&<nav aria-label="Gestión de captación" className="flex gap-2 border-b border-slate-200">
      <button className="rounded-t-lg px-4 py-3 text-sm" aria-current={screen==='capture'?'page':undefined} onClick={()=>setScreen('capture')}>Captaciones y enlaces</button>
      <button className="rounded-t-lg px-4 py-3 text-sm font-semibold text-[#143A56]" aria-current={screen==='forms'?'page':undefined} onClick={()=>setScreen('forms')}>Formularios · Crear y editar</button>
    </nav>}
    {screen==='forms'&&canEditForms?<React.Suspense fallback={<p>Cargando editor…</p>}><CaptureFormBuilder/></React.Suspense>:currentUser.role === 'RECLUTADOR' ? <RecruiterCaptacionView /> : <CaptureManagementView />}
  </div>;
}
function RecruiterCaptacionView() {
  const [responseDate,setResponseDate]=useState('');
  const [companyId,setCompanyId]=useState('');
  const [companyCampaignId,setCompanyCampaignId]=useState('');
  const { currentUser } = useTalent();
  const [tab, setTab] = useState<'links' | 'inbox'>('links'), [links, setLinks] = useState<CaptureLink[]>([]), [events, setEvents] = useState<CaptureEvent[]>([]);
  const [source, setSource] = useState(captureSources[0]), [search, setSearch] = useState(''), [status, setStatus] = useState(''), [sourceFilter, setSourceFilter] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [truncated, setTruncated] = useState(false);
  const [editing, setEditing] = useState<CaptureEvent | null>(null), [nextStatus, setNextStatus] = useState('Nuevo'), [note, setNote] = useState(''), [dossier, setDossier] = useState<CaptureDossier | null>(null);
  const load = async () => { setLoading(true); setError(''); try { const [l, e] = await Promise.all([captureApi.links(), captureApi.inbox()]); setLinks(l.items); setEvents(e.items); setTruncated(l.truncated || e.truncated); } catch (e) { setError(getWorkerErrorMessage(e)); } finally { setLoading(false); } };
  useEffect(() => { setLinks([]); setEvents([]); setDossier(null); void load(); }, [currentUser.id]);
  const run = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); setNotice(''); try { await work(); await load(); } catch(e) { setError(getWorkerErrorMessage(e)); } finally { setBusy(false); } };
  const removeLink = async (link: CaptureLink) => {
    if (!window.confirm('¿Eliminar este enlace? Dejará de funcionar y se conservarán las postulaciones recibidas.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await captureApi.remove(link.id, link.companyId);
      // La eliminación confirmada no depende de que la bandeja u otra empresa se recargue.
      setLinks(previous => previous.filter(item => item.id !== link.id));
      setNotice('Enlace eliminado. Las postulaciones recibidas se conservan.');
    } catch (cause) {
      setError(`No se pudo eliminar el enlace. ${getWorkerErrorMessage(cause)}`);
    } finally { setBusy(false); }
  };
  const toggleLink = async (link: CaptureLink) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await captureApi.toggle(link.id, !link.active, link.companyId);
      setLinks(previous => previous.map(item => item.id === link.id ? { ...item, active: !link.active } : item));
      setNotice(link.active ? 'Enlace desactivado.' : 'Enlace activado.');
    } catch (cause) {
      setError(`No se pudo cambiar el estado del enlace. ${getWorkerErrorMessage(cause)}`);
    } finally { setBusy(false); }
  };
  const publicFormUrl = (link: CaptureLink) => `${window.location.origin}/captacion/${link.id}`;
  const downloadQr = async (link: CaptureLink) => {
    setError(''); setNotice('');
    try {
      const { toDataURL } = await import('qrcode');
      const png = await toDataURL(publicFormUrl(link), { width: 512, margin: 2, errorCorrectionLevel: 'M' });
      const download = document.createElement('a');
      download.href = png;
      download.download = `talent-on-captacion-${link.id.slice(0, 8)}.png`;
      document.body.appendChild(download);
      download.click();
      download.remove();
      setNotice('Código QR generado.');
    } catch {
      setError('No se pudo generar el código QR. Inténtalo nuevamente.');
    }
  };
  const filtered = events.filter(e => (!responseDate || captureDay(e.createdAt) === responseDate) && (!status || e.status === status) && (!sourceFilter || e.source === sourceFilter) && `${e.applicant.fullName} ${e.applicant.phone} ${e.applicant.documentNumber}`.toLowerCase().includes(search.toLowerCase()));
  const control = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm';
  return <div className="space-y-5"><header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Captación de postulantes</h1><p className="text-sm text-slate-500">{currentUser.role === 'ADMIN' ? 'Supervisión global de enlaces y captaciones.' : 'Tus enlaces y tu bandeja individual, sin asignación automática a convocatorias.'}</p></div><button className={control} onClick={() => void load()} disabled={loading || busy}><RefreshCw className="mr-2 inline h-4 w-4" />Actualizar</button></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}{truncated && <p className="text-sm text-orange-700">Se muestran hasta 200 registros. Consulta el alcance antes de gestionar bandejas mayores.</p>}
    <nav aria-label="Captación" className="flex gap-2 border-b border-slate-200"><button onClick={() => setTab('links')} className={`px-4 py-3 text-sm ${tab === 'links' ? 'border-b-2 border-sky-700 font-bold text-sky-700' : ''}`}>Mis enlaces</button><button onClick={() => setTab('inbox')} className={`px-4 py-3 text-sm ${tab === 'inbox' ? 'border-b-2 border-sky-700 font-bold text-sky-700' : ''}`}>Mi bandeja ({events.length})</button></nav>
    {loading ? <p className="py-8 text-center text-slate-500">Cargando captaciones…</p> : tab === 'links' ? <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex flex-wrap items-end gap-3"><CompanyCampaignPicker companyId={companyId} onCompanyChange={setCompanyId} value={companyCampaignId} onChange={setCompanyCampaignId}/><label className="text-sm">Fuente<select className={`${control} ml-3`} value={source} onChange={e => setSource(e.target.value)}>{captureSources.map(s => <option key={s}>{s}</option>)}</select></label><button disabled={busy||!companyId||(!!currentUser.companies?.find(c=>c.id===companyId)?.managed&&!companyCampaignId)} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void run(() => captureApi.create(source,companyCampaignId||undefined,companyId))}><Plus className="mr-2 inline h-4 w-4" />Crear enlace</button></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead><tr>{['Fuente', 'Fecha', ...(currentUser.role === 'ADMIN' ? ['Propietario'] : []), 'Estado', 'Acciones'].map(t => <th className="p-3" key={t}>{t}</th>)}</tr></thead><tbody>{links.map(link => <tr key={link.id} className="border-t border-slate-100"><td className="p-3"><span className="block text-xs text-slate-500">{currentUser.companies?.find(c=>c.id===link.companyId)?.name}</span><Link className="mr-2 inline h-4 w-4" />{link.source}</td><td>{new Date(link.createdAt).toLocaleDateString('es-PE')}</td>{currentUser.role === 'ADMIN' && <td className="text-xs">{link.ownerUid}</td>}<td className={link.active ? 'text-emerald-700' : 'text-slate-500'}>{link.active ? 'Activo' : 'Inactivo'}</td><td><div className="flex gap-2"><button className={control} onClick={async () => { try { await navigator.clipboard.writeText(publicFormUrl(link)); setNotice('Enlace copiado.'); } catch { setError('No se pudo copiar. Revisa el permiso del portapapeles.'); } }}><Copy className="mr-1 inline h-4 w-4" />Copiar</button><button type="button" className={control} disabled={!link.active} title={link.active ? 'Descargar QR del formulario' : 'Activa el enlace para descargar su QR'} onClick={() => void downloadQr(link)}><Download className="mr-1 inline h-4 w-4" />Descargar QR</button><button className={control} disabled={busy} onClick={() => void toggleLink(link)}>{link.active ? 'Desactivar' : 'Activar'}</button><button type="button" className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={busy} onClick={() => void removeLink(link)}>Eliminar</button></div></td></tr>)}</tbody></table></div>{!links.length && <p className="py-8 text-center text-slate-500">Aún no hay enlaces de captación.</p>}</section> : <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex flex-wrap gap-3"><label className="text-sm">Fecha de respuesta<input type="date" className={control} value={responseDate} onChange={e=>setResponseDate(e.target.value)} /></label><input aria-label="Buscar postulante" placeholder="Nombre, celular o documento" className={control} value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Estado de captación" className={control} value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos los estados</option>{captureStates.map(s => <option key={s}>{s}</option>)}</select><select aria-label="Fuente de captación" className={control} value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}><option value="">Todas las fuentes</option>{captureSources.map(s => <option key={s}>{s}</option>)}</select></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr>{['Postulante', 'Teléfono', 'Fuente', 'Respuesta (hora de Perú)', 'Estado', 'Acciones'].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{filtered.map(event => <tr key={event.id} className="border-t border-slate-100"><td className="p-3 font-semibold">{event.applicant.fullName}{event.conflict && <div className="text-xs font-normal text-orange-700">Revisión de identidad pendiente</div>}</td><td>{event.applicant.phone}</td><td>{event.source}</td><td>{formatCaptureTime(event.createdAt)}</td><td>{event.status}</td><td><div className="flex gap-2"><button className={control} disabled={busy} onClick={() => { setEditing(event); setNextStatus(event.status); setNote(''); }}>Gestionar</button><button className={control} disabled={busy} onClick={() => void run(async () => setDossier(await captureApi.dossier(event.candidateId)))}>Expediente</button></div></td></tr>)}</tbody></table></div>{!filtered.length && <p className="py-8 text-center text-slate-500">No hay captaciones para estos filtros.</p>}</section>}
    {editing && <div role="dialog" aria-modal="true" aria-label="Gestionar captación" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"><form className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5" onSubmit={e => { e.preventDefault(); void run(async () => { await captureApi.manage(editing.id, nextStatus, note); setEditing(null); }); }}><h2 className="font-bold">Gestionar · {editing.applicant.fullName}</h2><label className="block">Estado<select className={`${control} mt-1 w-full`} value={nextStatus} onChange={e => setNextStatus(e.target.value)}>{captureStates.map(s => <option key={s}>{s}</option>)}</select></label><label className="block">Observaciones<textarea className={`${control} mt-1 w-full`} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={busy} className={control} onClick={() => setEditing(null)}>Cancelar</button><button disabled={busy} className="rounded-lg bg-sky-700 px-4 py-2 text-sm text-white">Guardar gestión</button></div></form></div>}
    {dossier && <CaptureDossierPanel dossier={dossier} onClose={() => setDossier(null)} />}
  </div>;
}
