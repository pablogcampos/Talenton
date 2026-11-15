import {useEffect,useState} from 'react';
import {workerApi,getWorkerErrorMessage} from '../../services/workerApi';
import {cinthiaControl as control,cinthiaPrimary as primary} from './CinthiaUI';
export function EvaluationRuntime(){
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{void workerApi('/api/cinthia/runtime').then(setData).catch(e=>setMessage(getWorkerErrorMessage(e)));},[]);
 if(!data)return <p>{message||'Cargando configuración…'}</p>;
 const update=(key:string,value:unknown)=>setData({...data,config:{...data.config,[key]:value}});
 return <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const r=await workerApi('/api/cinthia/runtime',{method:'PUT',body:JSON.stringify({config:data.config,revision:data.revision})});setData({...r as object,liveModel:data.liveModel});setMessage('Configuración guardada. Se aplica a nuevas entrevistas.');}catch(e){setMessage(getWorkerErrorMessage(e));}finally{setBusy(false);}}}>
 <p>Modelo de voz activo: <strong>{data.liveModel}</strong>. Su cambio requiere validación de compatibilidad en el servidor.</p>
 <fieldset disabled={!data.canEdit||busy} className="grid gap-4 md:grid-cols-2"><label>Voz<select className={control+' ml-2'} value={data.config.voice} onChange={e=>update('voice',e.target.value)}>{['Kore','Aoede','Puck','Charon','Fenrir'].map(v=><option key={v}>{v}</option>)}</select></label>{[['maxMinutes','Límite global de minutos',3,20],['maxFollowups','Límite global de seguimientos',0,2],['retentionDays','Periodo de retención propuesto (días)',30,3650]].map(([key,label,min,max])=><label key={key}>{label}<input className={control+' ml-2 w-24'} type="number" min={min} max={max} value={data.config[key]} onChange={e=>update(String(key),Number(e.target.value))}/></label>)}<label className="md:col-span-2">Guía de comportamiento<textarea className={control+' mt-1 w-full'} maxLength={4000} value={data.config.instructions} onChange={e=>update('instructions',e.target.value)}/></label></fieldset>
 <p className="text-sm text-amber-800">La retención es una política registrada; la eliminación automática está desactivada para conservar los historiales. No se almacenan grabaciones de audio.</p>
 {data.canEdit&&<button className={primary} disabled={busy}>Guardar configuración</button>}{message&&<p role="status">{message}</p>}
 </form>;
}
