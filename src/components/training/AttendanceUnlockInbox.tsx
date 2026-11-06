import React, {useEffect,useState} from 'react';
import {useTalent} from '../../context/TalentContext';
import {workerApi,getWorkerErrorMessage} from '../../services/workerApi';
import {formatCaptureTime} from '../../utils/captureTime';
type Pending={id:string;companyId:string;companyName?:string;trainingId:string;trainingName:string;trainingCode:string;trainerName:string;date:string;reason:string;createdAt:string;requestedAt?:string};
export function AttendanceUnlockInbox(){
 const {currentUser}=useTalent();
 const allowed=['ADMIN','JEFE_FORMACION','COORDINADOR_FORMACION'].includes(currentUser.role);
 const [items,setItems]=useState<Pending[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!allowed)return;let active=true,running=false;setItems([]);setLoading(true);
 const refresh=async()=>{if(running)return;running=true;try{const data=await workerApi<{items:Pending[]}>('/api/attendance-unlocks');if(active){setItems(data.items);setError('');}}catch(e){if(active)setError(getWorkerErrorMessage(e));}finally{running=false;if(active)setLoading(false);}};
 void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);const update=()=>void refresh();window.addEventListener('focus',update);window.addEventListener('talent:data-changed',update);
 return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('talent:data-changed',update);};
 },[allowed,currentUser.id,revision]);
 if(!allowed)return null;
 const decide=async(item:Pending,decision:'APROBADA'|'RECHAZADA')=>{if(busy)return;
 if(!window.confirm(decision==='APROBADA'?`¿Autorizar la asistencia de ${item.date} en ${item.trainingCode} durante 30 minutos?`:`¿Rechazar la solicitud de ${item.trainingCode} para ${item.date}?`))return;
 setBusy(true);setError('');setNotice('');try{await workerApi(`/api/trainings/${encodeURIComponent(item.trainingId)}/attendance-unlocks/${item.date}`,{method:'PATCH',body:JSON.stringify({decision,reason:decision==='APROBADA'?'Corrección de asistencia autorizada por Formación.':'Solicitud rechazada por Formación.'})},item.companyId);setItems(rows=>rows.filter(row=>row.id!==item.id||row.companyId!==item.companyId));setNotice(decision==='APROBADA'?'Solicitud aprobada. El formador podrá registrar asistencia durante 30 minutos para ese grupo y fecha.':'Solicitud rechazada. La asistencia permanece bloqueada.');}catch(e){setError(getWorkerErrorMessage(e));}finally{setBusy(false);}};
 return <section className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Solicitudes de desbloqueo de asistencia ({items.length})</h2><button type="button" disabled={busy||loading} className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setRevision(value=>value+1)}>Actualizar solicitudes</button></div>
 <p className="mt-1 text-xs text-slate-500">Solicitudes de tus capacitaciones. La aprobación habilita únicamente el grupo y la fecha solicitados durante 30 minutos.</p>
 {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
 {loading?<p className="mt-3 text-sm">Cargando solicitudes…</p>:!items.length&&!error?<p className="mt-3 text-sm text-slate-500">No hay solicitudes pendientes.</p>:items.map(item=><article key={item.companyId+item.id} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><strong>{item.trainingCode} · {item.trainingName}</strong><p>{item.companyName||item.companyId} · Formador: {item.trainerName||'Asignado al grupo'}</p><p>Fecha de asistencia: {item.date.split('-').reverse().join('/')} · Solicitada: {formatCaptureTime(item.requestedAt||item.createdAt)} (Perú)</p><p className="mt-2 whitespace-pre-wrap break-words">Motivo: {item.reason}</p><div className="mt-3 flex gap-2"><button disabled={busy} className="rounded-lg border bg-white px-3 py-2" onClick={()=>void decide(item,'RECHAZADA')}>Rechazar</button><button disabled={busy} className="rounded-lg bg-[#143A56] px-3 py-2 text-white" onClick={()=>void decide(item,'APROBADA')}>Aprobar desbloqueo</button></div></article>)}
 </section>;
}
