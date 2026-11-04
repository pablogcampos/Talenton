import React,{useEffect,useRef,useState} from 'react';
import {workerApi,getWorkerErrorMessage} from '../../services/workerApi';
import {offerWorkdays,type OfferWorkday} from '../../../shared/offerWorkdays';
type Row={participantId:string;name:string;workday:OfferWorkday|null;raw:string|null;source:string|null;templateId:string|null;title:string|null;status:'READY'|'SIGNED'|'ASSIGNED'|'MISSING_WORKDAY'|'MISSING_TEMPLATE'|'REVOKED_VERSION'};
type Plan={hash:string;participants:Row[];assigned?:number};
const statuses={READY:'Lista para asignar',SIGNED:'Firmada: se conserva',ASSIGNED:'Ya asignada',MISSING_WORKDAY:'Jornada ausente o no reconocida',MISSING_TEMPLATE:'No hay propuesta para esta jornada',REVOKED_VERSION:'Versión reemplazada: crea una nueva'};
export function OfferWorkdayAssignment({companyId,groupId,groups,onAssigned}:{companyId:string;groupId?:string;groups:{id:string;name:string;code:string}[];onAssigned:()=>void}){
 const [group,setGroup]=useState(groupId||''),[plan,setPlan]=useState<Plan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const sequence=useRef(0);
 useEffect(()=>{sequence.current++;setBusy(false);setGroup(groupId||'');setPlan(null);setError('');setNotice('');return()=>{sequence.current++;};},[companyId,groupId]);
 const load=async()=>{const run=++sequence.current;setBusy(true);setPlan(null);setError('');setNotice('');try{const result=await workerApi<Plan>('/api/offers/workday-plan?group='+encodeURIComponent(group),{},companyId);if(run===sequence.current)setPlan(result);}catch(e){if(run===sequence.current)setError(getWorkerErrorMessage(e));}finally{if(run===sequence.current)setBusy(false);}};
 const assign=async()=>{if(!plan||busy)return;const run=++sequence.current;setBusy(true);setError('');setNotice('');try{
  const result=await workerApi<Plan>('/api/offers/assign-workdays',{method:'POST',body:JSON.stringify({groupId:group,hash:plan.hash})},companyId);
  if(run!==sequence.current)return;setPlan(result);setNotice('Propuestas generadas: '+result.assigned+'. Revisa los casos pendientes en la lista.');onAssigned();
 }catch(e){if(run===sequence.current){setError(getWorkerErrorMessage(e));setPlan(null);}}finally{if(run===sequence.current)setBusy(false);}};
 const ready=plan?.participants.filter(p=>p.status==='READY').length||0;
 const pending=plan?.participants.filter(p=>['MISSING_WORKDAY','MISSING_TEMPLATE','REVOKED_VERSION'].includes(p.status)).length||0;
 return <section className="space-y-4 rounded-2xl border bg-white p-5"><div><h3 className="font-semibold">Asignación masiva por jornada</h3><p className="mt-1 text-sm text-slate-500">Cada participante recibe la versión más reciente de su empresa, campaña y jornada. Las propuestas sin jornada no se usan en la asignación automática.</p></div>
 <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Capacitación<select disabled={Boolean(groupId)||busy} className="mt-1 w-full rounded-xl border p-3" value={group} onChange={e=>{sequence.current++;setGroup(e.target.value);setPlan(null);setError('');setNotice('');}}><option value="">Selecciona una capacitación</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}</select></label><button disabled={!group||busy} className="rounded-xl border border-[#143c55] px-4 py-3 text-sm disabled:opacity-50" onClick={()=>void load()}>{busy?'Procesando…':'Validar jornadas'}</button></div>
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
 {notice&&<p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
 {plan&&<><p className="text-sm"><strong>{ready}</strong> por asignar · <strong>{pending}</strong> pendientes de revisión · {plan.participants.length} participantes</p>
 {plan.participants.length===0?<p>No hay participantes en esta capacitación.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{['Participante','Jornada registrada','Propuesta','Resultado'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y">{plan.participants.map(p=><tr key={p.participantId}><td className="p-3 font-medium">{p.name}</td><td className="p-3">{p.workday?offerWorkdays[p.workday]:(p.raw||'Sin especificar')}<span className="block text-xs text-slate-500">{p.source||'Sin datos'}</span></td><td className="p-3">{p.status==='SIGNED'?'Documento firmado original':p.title||'Sin propuesta compatible'}</td><td className="p-3"><span className={'rounded-lg px-2 py-1 text-xs '+(['READY','ASSIGNED','SIGNED'].includes(p.status)?'bg-teal-50 text-teal-800':'bg-amber-50 text-amber-800')}>{statuses[p.status]}</span></td></tr>)}</tbody></table></div>}
 <p className="text-xs text-slate-500">Las propuestas firmadas no cambian. Los enlaces sin firma incompatibles se revocan al confirmar. Quien no tenga jornada o propuesta compatible quedará pendiente. Vuelve a validar si agregas participantes o nuevas versiones.</p>
 <button disabled={busy||!plan.participants.length||(!ready&&!pending)} className="rounded-xl bg-[#143c55] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>void assign()}>Asignar masivamente por jornada ({ready})</button></>}
 </section>;
}
