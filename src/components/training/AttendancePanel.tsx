import {InjectionBadge} from './InjectionBadge';
import React, {useEffect, useState} from 'react';
import {History, Lock, TimerReset} from 'lucide-react';
import type {AttendanceWindowInfo} from '../../context/TalentContext';
import type {AttendanceStatus, CandidateRecord} from '../../types';
import {attendanceDateLabel, limaDate, limaTime, liveAttendanceState, pastAttendanceDates} from './attendanceTime';

const labels: Record<string,string> = {PRESENTE:'Presente',TARDANZA:'Tardanza',FALTA:'Ausente',NSP:'Ausente',JUSTIFICADO:'Justificado',FALTA_JUSTIFICADA:'Justificado',FALTA_INJUSTIFICADA:'Ausente'};
type Props = {
 participants:CandidateRecord[]; date:string; setDate:(date:string)=>void; onToday:()=>void;
 windowInfo:AttendanceWindowInfo|null; loading:boolean; saving:boolean;
 onMark:(id:string,status:AttendanceStatus)=>void; onUnlock:()=>void;
 onDecision:(decision:'APROBADA'|'RECHAZADA')=>void; canDecide:boolean; openCandidate360:(id:string)=>void;
};
export function AttendancePanel({participants,date,setDate,onToday,windowInfo,loading,saving,onMark,onUnlock,onDecision,canDecide,openCandidate360}:Props) {
 const [historyOpen,setHistoryOpen]=useState(false);
 const [historyDate,setHistoryDate]=useState('');
 const [clock,setClock]=useState<{source:string;now:number}|null>(null);
 useEffect(()=>{
  if(!windowInfo)return;
  const source=windowInfo.serverNow;
  const server=Date.parse(source); const received=performance.now();
  const tick=()=>setClock({source,now:server+performance.now()-received});
  tick();const interval=window.setInterval(tick,1000);
  return ()=>clearInterval(interval);
 },[windowInfo?.serverNow]);
 const now=windowInfo ? (clock?.source===windowInfo.serverNow?clock.now:Date.parse(windowInfo.serverNow)) : null;
 const state=windowInfo&&now!==null?liveAttendanceState(windowInfo,now):null;
 const matchesDate=windowInfo?.startAt.slice(0,10)===date;
 const canMark=!loading&&matchesDate&&(state==='OPEN'||state==='UNLOCKED');
 const dates=pastAttendanceDates(participants,now===null?limaDate():limaDate(now));
 const historicalDate=dates.includes(historyDate)?historyDate:dates[0];
 const button='rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0B2847] hover:bg-blue-50 disabled:opacity-50';
 return <div className="space-y-5">
  <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
   <div className="min-w-0">
    <div className="flex flex-wrap items-end justify-between gap-3">
     <div><h2 className="text-sm font-bold text-[#0B2847]">Asistencia diaria</h2><p className="mt-1 text-xs text-slate-500">Fecha consultada: {attendanceDateLabel(date)}</p></div>
     <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-600">Fecha de asistencia<input aria-label="Fecha de asistencia" type="date" value={date} onChange={e=>{if(e.target.value)setDate(e.target.value);}} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2"/></label>
      <button className={button} onClick={onToday}>Hoy</button>
      <button className={button+' inline-flex items-center gap-2'} aria-expanded={historyOpen} aria-controls="past-attendance" onClick={()=>setHistoryOpen(v=>!v)}><History className="h-4 w-4"/>{historyOpen?'Ocultar asistencias pasadas':'Ver asistencias pasadas'}</button>
     </div>
    </div>
    <AttendanceTable participants={participants} date={date} openCandidate360={openCandidate360} disabled={saving||!canMark} onMark={onMark}/>
   </div>
   <aside className="space-y-3">
    <div className={'rounded-xl border p-4 '+(canMark?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-slate-50')}>
     <div className="flex items-center gap-2">{canMark?<TimerReset className="h-5 w-5 text-emerald-600"/>:<Lock className="h-5 w-5 text-slate-500"/>}<h3 className="text-xs font-bold text-[#0B2847]">{loading?'Validando horario…':!windowInfo?'Horario no disponible':state==='OPEN'?'Ventana abierta':state==='UNLOCKED'?'Desbloqueo aprobado':state==='UPCOMING'?'Aún no inicia':'Asistencia bloqueada'}</h3></div>
     {now!==null&&<p className="mt-3 text-xs text-slate-700">Hora actual de Lima: <strong>{limaTime(now)}</strong><br/>{attendanceDateLabel(limaDate(now))}</p>}
     {windowInfo&&<p className="mt-2 text-xs text-slate-600">Marcación: {limaTime(windowInfo.startAt).slice(0,5)}–{limaTime(windowInfo.closesAt).slice(0,5)} (Lima)<br/>Para el {attendanceDateLabel(date)}</p>}
     {!loading&&matchesDate&&windowInfo?.unlock?.status==='PENDIENTE'?<><p className="mt-3 text-xs text-amber-800">Solicitud pendiente de aprobación.</p>{canDecide&&<div className="mt-2 flex gap-2"><button className={button} disabled={saving} onClick={()=>onDecision('RECHAZADA')}>Rechazar</button><button className={button} disabled={saving} onClick={()=>onDecision('APROBADA')}>Aprobar</button></div>}</>:!loading&&matchesDate&&state==='LOCKED'&&!canDecide?<button className={button+' mt-3 w-full'} onClick={onUnlock}>Solicitar desbloqueo</button>:null}
    </div>
    <p className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs leading-relaxed text-blue-800">La marcación está disponible de <strong>09:00 a 10:00, hora de Lima</strong>. La hora se sincroniza con el servidor. El horario de clases es independiente.</p>
   </aside>
  </div>
  {historyOpen&&<section id="past-attendance" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
   <h2 className="text-sm font-bold text-[#0B2847]">Asistencias pasadas</h2>
   <p className="mt-1 text-xs text-slate-500">Consulta de registros guardados, incluidos fines de semana. Esta sección es de solo lectura.</p>
   {dates.length===0?<p className="mt-4 text-sm text-slate-600">No hay asistencias registradas en fechas anteriores.</p>:<>
    <label className="mt-4 block text-xs text-slate-600">Fecha del historial<select value={historicalDate} onChange={e=>setHistoryDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 sm:w-auto">{dates.map(d=><option key={d} value={d}>{attendanceDateLabel(d)}</option>)}</select></label>
    <AttendanceTable participants={participants} date={historicalDate} openCandidate360={openCandidate360}/>
   </>}
  </section>}
 </div>;
}

export function AttendanceTable({participants,date,openCandidate360,onMark,disabled=true}:{
 participants:CandidateRecord[];date:string;openCandidate360:(id:string)=>void;
 onMark?:(id:string,status:AttendanceStatus)=>void;disabled?:boolean;
}) {
 return <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
  <table className="w-full min-w-[640px] text-left text-xs">
   <caption className="sr-only">Asistencias del {attendanceDateLabel(date)}</caption>
   <thead className="bg-slate-50 text-slate-500"><tr>{['Participante','DNI','Asistencia','Observación',...(onMark?['Acción']:[])].map(t=><th key={t} scope="col" className="px-4 py-3">{t}</th>)}</tr></thead>
   <tbody className="divide-y divide-slate-100">{participants.map(candidate=>{
    const beforeInjection=Boolean(candidate.training?.injection&&date<candidate.training.injection.date);
    const record=candidate.training?.attendance?.find(a=>a.date===date);const status=record?.status||'';
    return <tr key={candidate.id}>
     <td className="px-4 py-3"><button className="font-semibold text-[#0B2847]" onClick={()=>openCandidate360(candidate.id)}>{candidate.fullName||'Candidato'}</button><InjectionBadge candidate={candidate}/></td>
     <td className="px-4 py-3 text-slate-500">{candidate.dni||'—'}</td>
     <td className="px-4 py-3">{beforeInjection?'Aún no incorporado':labels[status]||status||'Sin marcar'}</td>
     <td className="whitespace-pre-wrap break-words px-4 py-3 text-slate-500">{record?.notes||'—'}</td>
     {onMark&&<td className="px-4 py-3"><select aria-label={'Asistencia de '+candidate.fullName} disabled={disabled||beforeInjection} value={status} onChange={e=>onMark(candidate.id,e.target.value as AttendanceStatus)} className="rounded-lg border border-slate-200 p-2 disabled:bg-slate-50"><option value="" disabled>Seleccionar</option>{['PRESENTE','TARDANZA','FALTA','JUSTIFICADO'].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></td>}
    </tr>;
   })}</tbody>
  </table>
  {!participants.length&&<p className="p-6 text-sm text-slate-500">No hay participantes en este grupo.</p>}
 </div>;
}
