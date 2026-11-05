import React, { useEffect, useState } from 'react';
import { useTalent } from '../../context/TalentContext';
import { captureApi, CaptureEvent } from '../../services/captureApi';
import { getWorkerErrorMessage } from '../../services/workerApi';
import { captureDay, formatCaptureTime } from '../../utils/captureTime';

export function RecruiterCaptureResponses() {
  const { currentUser } = useTalent();
  const [items, setItems] = useState<CaptureEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setItems([]); setLoading(true); setError(''); setPage(1);
    captureApi.inbox().then(result => {
      if (active) { setItems(result.items.filter(item => item.ownerUid === currentUser.id).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt))); setTruncated(result.truncated); }
    }).catch(cause => { if (active) setError(getWorkerErrorMessage(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentUser.id, refresh]);
  const rows = items.filter(item => {
    const day = captureDay(item.createdAt);
    return (!from || day >= from) && (!to || (!!day && day <= to)) && `${item.applicant.fullName} ${item.applicant.documentNumber} ${item.applicant.phone}`.toLowerCase().includes(query.toLowerCase().trim());
  });
  const control = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm';
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Mis candidatos · respuestas del formulario</h3><p className="text-sm text-slate-500">Fecha y hora de envío en Perú. Cada respuesta conserva su registro original.</p></div><button className={control} disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Actualizar</button></div>
    <div className="my-4 flex flex-wrap items-end gap-3">
      <label className="text-sm">Buscar<input className={`${control} block`} placeholder="Nombre, DNI o teléfono" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} /></label>
      <label className="text-sm">Desde<input type="date" className={`${control} block`} value={from} onChange={e=>{setFrom(e.target.value);setPage(1);}} /></label>
      <label className="text-sm">Hasta<input type="date" className={`${control} block`} value={to} onChange={e=>{setTo(e.target.value);setPage(1);}} /></label>
    </div>
    {error ? <p role="alert" className="text-red-700">{error}</p> : loading ? <p>Cargando respuestas…</p> : <>
      {truncated && <p className="text-sm text-amber-700">La consulta está limitada a las 200 respuestas más recientes por empresa.</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b border-slate-200">{['Postulante','DNI / Documento','Empresa','Fuente','Respuesta (hora de Perú)','Estado'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{rows.slice((page-1)*10,page*10).map(item=><tr key={`${item.companyId}-${item.id}`} className="border-b border-slate-100"><td className="p-2">{item.applicant.fullName}</td><td className="p-2">{item.applicant.documentNumber}</td><td className="p-2">{item.companyName || currentUser.companies?.find(company=>company.id===item.companyId)?.name || '—'}</td><td className="p-2">{item.source}</td><td className="p-2 whitespace-nowrap">{formatCaptureTime(item.createdAt)}</td><td className="p-2">{item.status}</td></tr>)}</tbody></table></div>
      {!rows.length && <p className="py-5 text-sm text-slate-500">No hay respuestas para estos filtros.</p>}
      <div className="mt-3 flex items-center justify-end gap-3 text-sm"><span>{rows.length} respuestas</span><button className={control} disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page}</span><button className={control} disabled={page*10>=rows.length} onClick={()=>setPage(page+1)}>Siguiente</button></div>
    </>}
  </section>;
}
