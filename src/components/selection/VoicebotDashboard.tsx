import {Users,Headset,CheckCheck,Clock3,ArrowUpRight,RefreshCw,ChartNoAxesCombined} from 'lucide-react';
import {useEffect,useState} from 'react';
import {workerApi,getWorkerErrorMessage} from '../../services/workerApi';
type Summary=Record<string,number|null>;
type Report={summary:Summary;recruiters:{owner_auth_id:string;name:string;total:number;accepted:number;not_suitable:number;measured:number;within_sla:number;avg_assignment_seconds:number|null}[];generatedAt:string;slaMinutes:number};
export const duration=(seconds:number|null|undefined)=>{if(seconds==null)return 'Sin datos';const n=Math.max(0,Math.round(seconds));return [n>=86400?Math.floor(n/86400)+' d':'',n>=3600?Math.floor(n/3600)%24+' h':'',n>=60?Math.floor(n/60)%60+' min':'',n%60+' s'].filter(Boolean).join(' ');};
const percent=(good:number,total:number)=>total?`${(100*good/total).toFixed(1)}%`:'Sin datos';
const control='min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50';
const panel='min-w-0 rounded-xl border border-slate-200 bg-white';
export function VoicebotDashboard({onOpenInbox}:{onOpenInbox?:(status:string)=>void}={}){
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[range,setRange]=useState({from:'',to:''}),[data,setData]=useState<Report|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let active=true,running=false;const load=async()=>{if(running)return;running=true;setLoading(true);try{const result=await workerApi<Report>(`/api/voicebot/dashboard?from=${range.from}&to=${range.to}`);if(active){setData(result);setError('');}}catch(e){if(active)setError(getWorkerErrorMessage(e));}finally{running=false;if(active)setLoading(false);}};void load();const update=()=>void load(),timer=setInterval(()=>{if(document.visibilityState==='visible')update();},30000);window.addEventListener('talent:voicebot-changed',update);return()=>{active=false;clearInterval(timer);window.removeEventListener('talent:voicebot-changed',update);};},[range,refresh]);
 const s=data?.summary;

 const count=(key:string)=>s?.[key]??0;
 const states=[['unassigned','Pendientes de asignación','bg-amber-400'],['in_progress','En gestión','bg-sky-600'],['accepted','Aceptan propuesta','bg-emerald-500'],['declined','No aceptan propuesta','bg-slate-400'],['not_suitable','No aptos','bg-slate-500'],['not_contacted','No contactados','bg-sky-300'],['rescheduled','Reprogramados','bg-indigo-400']];
 return <section className="space-y-4 text-slate-800" aria-label="Dashboard Voicebot">
  <header className="flex flex-wrap items-end justify-between gap-4">
   <div><h2 className="text-lg font-semibold text-slate-900">Dashboard de leads</h2><p className="mt-1 text-xs text-slate-500">Recepción en hora de Perú · Sin fechas se incluye todo el historial.</p></div>
   <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();if(from&&to&&from>to){setError('La fecha inicial no puede superar la final.');return;}setRange({from,to});}}>
    <label className="grid gap-1 text-xs font-medium text-slate-500">Desde<input aria-label="Desde" type="date" value={from} onChange={e=>setFrom(e.target.value)} className={control+' w-36'}/></label>
    <label className="grid gap-1 text-xs font-medium text-slate-500">Hasta<input aria-label="Hasta" type="date" value={to} onChange={e=>setTo(e.target.value)} className={control+' w-36'}/></label>
    <button className="min-h-10 rounded-lg bg-sky-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Aplicar</button>
    <button type="button" className={control+' inline-flex items-center gap-2'} disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw aria-hidden="true" size={15}/>Actualizar dashboard</button>
   </form>
  </header>
  {error&&<p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error} {data?'Se muestran los últimos indicadores cargados.':''}</p>}
  {!data&&<p role="status" className={panel+' p-8 text-center text-sm text-slate-500'}>{loading?'Calculando indicadores…':'No se pudo cargar el dashboard.'}</p>}
  {s&&data&&<>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {([{key:'total',label:'Leads recibidos',Icon:Users,tone:'bg-sky-50 text-sky-700'},{key:'unassigned',label:'Pendientes de asignación',Icon:Clock3,tone:'bg-amber-50 text-amber-700'},{key:'in_progress',label:'En gestión',Icon:Headset,tone:'bg-sky-50 text-sky-700'},{key:'accepted',label:'Aceptan propuesta',Icon:CheckCheck,tone:'bg-emerald-50 text-emerald-700'}]).map(({key,label,Icon,tone})=>
     <div key={key} className={panel+' flex min-h-28 items-center justify-between gap-3 p-4'}><div><p className="text-sm font-medium text-slate-500">{label}</p><strong className="mt-2 block text-3xl font-semibold tabular-nums tracking-tight text-sky-950">{count(key).toLocaleString('es-PE')}</strong></div><span className={'rounded-lg p-2.5 '+tone}><Icon aria-hidden="true" size={21} strokeWidth={1.6}/></span></div>)}
   </div>
   <dl className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
    {[['not_suitable','No aptos'],['declined','No aceptan propuesta'],['not_contacted','No contactados'],['rescheduled','Reprogramados'],['callbacks_overdue','Devoluciones vencidas'],['converted','Convertidos a candidato']].map(([key,label])=>
     <div key={key} className={panel+' px-3 py-3'}><dt className="text-xs leading-5 text-slate-500">{label}</dt><dd className={'mt-1 text-xl font-semibold tabular-nums '+(key==='callbacks_overdue'&&count(key)>0?'text-amber-700':'text-sky-950')}>{count(key).toLocaleString('es-PE')}</dd></div>)}
   </dl>
   <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
    <div className="flex items-center gap-3"><Clock3 size={19} aria-hidden="true"/><p className="text-sm"><strong className="tabular-nums">{count('pending_over_sla')}</strong> pendientes fuera del SLA <span className="text-amber-700">· {data.slaMinutes} minutos</span></p></div>
    <p className="text-sm">Cumplimiento del SLA <strong className="ml-2 text-lg tabular-nums">{percent(Number(s.within_sla),Number(s.assigned_measured))}</strong></p>
   </div>
   <div className="grid items-start gap-4 xl:grid-cols-3">
    <section className={panel+' p-4'} aria-label="Distribución por estado">
     <h3 className="flex items-center gap-2 text-sm font-semibold text-sky-950"><ChartNoAxesCombined size={17} aria-hidden="true"/>Distribución por estado</h3>
     <p className="mt-1 text-xs leading-5 text-slate-500">Proporción sobre {count('total').toLocaleString('es-PE')} leads recibidos.</p>
     <ul className="mt-5 space-y-5">{states.map(([key,label,color])=>{
      const value=count(key),total=count('total'),width=total?Math.min(100,100*value/total):0;
      return <li key={key}><div className="mb-2 flex items-baseline justify-between gap-2 text-xs"><span>{label}</span><span className="shrink-0 tabular-nums"><strong className="text-sm text-sky-950">{value}</strong><span className="ml-2 text-slate-400">{percent(value,total)}</span></span></div><div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={'h-full rounded-full '+color} style={{width:width+'%'}}/></div></li>;
     })}</ul>
     <p className="mt-5 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Acepta propuesta no equivale a aptitud para capacitación o contratación. Las conversiones se muestran por separado, sin sumarlas a los estados.</p>
    </section>
    <section className={panel+' p-4'}>
     <h3 className="flex items-center gap-2 text-sm font-semibold text-sky-950"><Clock3 size={17} aria-hidden="true"/>SLA y tiempos</h3>
     <p className="mt-1 text-xs leading-5 text-slate-500">Desde recepción hasta la primera toma o asignación.</p>
     <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm font-medium text-sky-950">SLA de asignación: {data.slaMinutes} minutos</div>
     <dl className="mt-3 grid grid-cols-2 gap-2">
      {[['Asignados dentro del SLA',String(count('within_sla'))],['Asignados fuera del SLA',String(count('late_assigned'))]].map(([label,value])=><div key={label} className="rounded-lg border border-slate-100 p-3"><dt className="text-xs leading-5 text-slate-500">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-sky-950">{value}</dd></div>)}
     </dl>
     <dl className="mt-1 divide-y divide-slate-100">{[['Espera promedio hasta asignación',duration(s.avg_assignment_seconds)],['Recepción → primera gestión',duration(s.avg_management_seconds)],['Espera promedio de pendientes',duration(s.avg_pending_seconds)],['Mayor espera pendiente',duration(s.longest_pending_seconds)]].map(([label,value])=><div key={label} className="py-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-sky-950">{value}</dd></div>)}</dl>
     <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Cumplimiento calculado sobre asignaciones con ambas fechas válidas. Los pendientes vencidos se muestran aparte.</p>
    </section>
    <div className="min-w-0 space-y-4">
     <section className={panel+' p-4'}>
      <h3 className="text-sm font-semibold text-sky-950">Acciones prioritarias</h3>
      <ul className="mt-3 divide-y divide-slate-100">{[['pending_over_sla','Pendientes vencidos','NUEVO','Ver pendientes'],['not_contacted','No contactados','NO_CONTACTADO','Ver no contactados'],['callbacks_overdue','Devoluciones vencidas','REPROGRAMADO','Ver reprogramados']].map(([key,label,status,action])=><li key={key} className="flex items-center justify-between gap-2 py-3"><div><p className="text-xs text-slate-500">{label}</p><strong className="text-lg tabular-nums text-sky-950">{count(key)}</strong></div>{onOpenInbox&&<button onClick={()=>onOpenInbox(status)} className="inline-flex items-center gap-1 rounded px-1 py-2 text-xs font-medium text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-sky-600">{action}<ArrowUpRight size={13} aria-hidden="true"/></button>}</li>)}</ul>
      {onOpenInbox&&<p className="text-xs leading-5 text-slate-500">Abre la bandeja por estado, sin filtro de fechas ni de vencimiento.</p>}
     </section>
     <section className={panel+' p-4'}>
      <h3 className="text-sm font-semibold text-sky-950">Desempeño por reclutador</h3>
      <div className="mt-3 divide-y divide-slate-100">{data.recruiters.map(r=><article key={r.owner_auth_id} className="py-3 first:pt-0"><h4 className="break-words text-sm font-medium text-slate-800">{r.name}</h4><dl className="mt-2 grid grid-cols-3 gap-2">{[['Asignados',r.total],['Aceptan',r.accepted],['No aptos',r.not_suitable]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="text-sm font-semibold tabular-nums">{value}</dd></div>)}</dl><dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2"><div><dt className="text-xs text-slate-500">Espera promedio</dt><dd className="mt-1 text-xs font-semibold tabular-nums">{duration(r.avg_assignment_seconds)}</dd></div><div><dt className="text-xs text-slate-500">SLA cumplido</dt><dd className="mt-1 text-xs font-semibold tabular-nums">{percent(r.within_sla,r.measured)}</dd></div></dl></article>)}</div>
      {!data.recruiters.length&&<p className="mt-3 text-xs text-slate-500">Sin asignaciones en este período.</p>}
     </section>
    </div>
   </div>
   <p className="text-xs leading-5 text-slate-400">Actualizado: {new Date(data.generatedAt).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Perú) · Actualización automática cada 30 segundos.</p>
  </>}
 </section>;
}
