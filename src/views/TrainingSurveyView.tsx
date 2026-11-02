import React, { useEffect, useState } from 'react';
import { useTalent } from '../context/TalentContext';
import { workerApi } from '../services/workerApi';
import { trainingSurveyQuestions, surveyRating, surveyMessages } from '../../shared/trainingSurvey';

const field = 'w-full rounded-xl border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-teal-500';
const button = 'rounded-xl bg-[#143c55] px-5 py-3 text-white disabled:opacity-50';
const explain = (e: unknown) => e instanceof Error ? surveyMessages[e.message] || 'No se pudo completar la solicitud. Intenta nuevamente.' : 'No se pudo completar la solicitud.';
type Survey = {id: string; token: string; enabled: boolean; participants: {id:string; name:string; completed:boolean}[]; responses:{answers:number[]; positive:string; improvement:string; score:number}[]};

export function TrainingSurveysView() {
 const { scopedCohorts, currentUser } = useTalent();
 const [selected, setSelected] = useState('');
 const cohort = scopedCohorts.find(c => JSON.stringify([c.companyId,c.id]) === selected);
 const [data,setData] = useState<Survey|null>(null);
 const [error,setError] = useState('');
 const [notice,setNotice] = useState('');
 const [revision,setRevision] = useState(0);
 useEffect(() => {
  let active=true;
  setData(null);setError('');setNotice('');
  if (!cohort) return;
  let loading=false;
  const refresh = () => {
   if(document.visibilityState==='hidden'||loading) return;
   loading=true;
   workerApi<Survey>(`/api/trainings/${encodeURIComponent(cohort.id)}/survey`,{},cohort.companyId)
    .then(value=>{if(!value)throw new Error('SURVEY_NOT_FOUND');if(active){setData(value);setError('');}})
    .catch(e=>{if(active)setError(explain(e));}).finally(()=>{loading=false;});
  };
  refresh();
  const interval=window.setInterval(refresh,30000);
  window.addEventListener('focus',refresh); window.addEventListener('talent:data-changed',refresh);document.addEventListener('visibilitychange',refresh);
  return ()=>{active=false;clearInterval(interval);window.removeEventListener('focus',refresh);window.removeEventListener('talent:data-changed',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[cohort?.id,cohort?.companyId,revision]);
 const average=data?.responses.length ? data.responses.reduce((sum,r)=>sum+r.score,0)/data.responses.length : null;
 const url=data ? `${window.location.origin}/encuestas/capacitacion/${data.token}` : '';
 const exportResults=async()=>{
  if(!cohort)return;
  try{
   const result=await workerApi<Survey>(`/api/trainings/${encodeURIComponent(cohort.id)}/survey?export=1`,{},cohort.companyId);
   const rows:unknown[][]=[['Capacitación',...trainingSurveyQuestions,'Aspectos positivos','Por mejorar','Puntaje / 20','Clasificación','Porcentaje']];
   for(const r of result.responses)rows.push([cohort.name,...r.answers,r.positive,r.improvement,r.score,surveyRating(r.score),r.score/20*100]);
   const csv=rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');
   const blob=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=blob;a.download='encuesta-capacitacion.csv';a.click();window.setTimeout(()=>URL.revokeObjectURL(blob),1000);
   setNotice('Resultados exportados.');
  }catch(e){setError(explain(e));}
 };
 return <main className="space-y-6 p-6 text-slate-800">
  <header><h1 className="text-2xl font-bold">Encuestas de capacitación</h1><p className="text-slate-500">Se habilitan automáticamente al finalizar la capacitación.</p></header>
  <label className="block">Capacitación<select className={field} value={selected} onChange={e=>{setData(null);setSelected(e.target.value);}}><option value="">Selecciona una capacitación</option>{scopedCohorts.map(c=><option key={JSON.stringify([c.companyId,c.id])} value={JSON.stringify([c.companyId,c.id])}>{c.code} · {c.name}</option>)}</select></label>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error} <button onClick={()=>setRevision(x=>x+1)}>Reintentar</button></p>}
  {cohort&&!data&&!error&&<p role="status">Cargando encuesta…</p>}
  {notice&&<p role="status">{notice}</p>}
  {data&&<>
   <section className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-bold">{data.enabled?'Encuesta habilitada':'Pendiente de finalizar capacitación'}</h2>
    <label className="block">Enlace para participantes<input className={field} readOnly value={url} onFocus={e=>e.target.select()}/></label>
    <button className={button} onClick={async()=>{try{await navigator.clipboard.writeText(url);setNotice('Enlace copiado.');}catch{setNotice('Selecciona el enlace y cópialo manualmente.');}}}>Copiar enlace</button>
    <a className="ml-4 underline" href={url} target="_blank" rel="noreferrer">Abrir encuesta</a>
    <p>{data.responses.length} respuestas / {data.participants.length} participantes</p>
    <p>{average===null?'Sin resultados todavía':`Promedio: ${average.toFixed(1)} / 20 · ${surveyRating(average)} · ${(average/20*100).toFixed(1)}%`}</p>
   </section>
   <section className="rounded-2xl border bg-white p-5"><h2 className="mb-3 font-bold">Cumplimiento por participante</h2><p className="mb-3 text-sm text-slate-500">El cumplimiento se muestra separado del contenido de las respuestas.</p>
    {data.participants.length===0&&<p>Sin participantes registrados.</p>}
    <ul>{data.participants.map(p=><li className="flex justify-between gap-4 border-b py-2" key={p.id}><span>{p.name}</span><span>{p.completed?'Respondió':'Pendiente'}</span></li>)}</ul>
   </section>
   <section className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-bold">Resultados y comentarios</h2>
    {['ADMIN','JEFE_FORMACION','COORDINADOR_FORMACION'].includes(currentUser.role)&&<button className={button} onClick={exportResults}>Exportar resultados CSV</button>}
    {trainingSurveyQuestions.map((q,i)=><p key={q}>{q} <strong>{data.responses.length?(data.responses.reduce((sum,r)=>sum+r.answers[i],0)/data.responses.length).toFixed(1):'—'} / 5</strong></p>)}
    {data.responses.map((r,i)=><article key={i} className="space-y-2 border-t pt-3"><p>{r.score}/20 · {surveyRating(r.score)}</p><p className="whitespace-pre-wrap break-words"><strong>Aspectos positivos: </strong>{r.positive}</p><p className="whitespace-pre-wrap break-words"><strong>Por mejorar: </strong>{r.improvement}</p></article>)}
   </section>
  </>}
 </main>;
}

export function PublicTrainingSurveyView({token}:{token:string}) {
 const [config,setConfig]=useState<{name:string;enabled:boolean}|null>(null);
 const [error,setError]=useState('');
 const [done,setDone]=useState(false);
 const [busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0);
 const endpoint=`${(import.meta.env.VITE_ADMIN_API_URL||import.meta.env.VITE_WORKER_API_URL||'').replace(/\/$/,'')}/api/public/surveys/${token}`;
 useEffect(()=>{
  const controller=new AbortController();
  setConfig(null);setError('');
  fetch(endpoint,{signal:controller.signal,cache:'no-store'}).then(async r=>{const value=await r.json();if(!r.ok)throw new Error(value.message);return value;}).then(setConfig).catch(e=>{if(!controller.signal.aborted)setError(explain(e));});
  return ()=>controller.abort();
 },[endpoint,revision]);
 const submit=async(e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(busy)return;
  const form=new FormData(e.currentTarget);
  setBusy(true);setError('');
  try {
   const result=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentType:form.get('documentType'),document:form.get('document'),answers:trainingSurveyQuestions.map((_,i)=>Number(form.get(`q${i}`))),positive:form.get('positive'),improvement:form.get('improvement')})});
   const value=await result.json();if(!result.ok)throw new Error(value.message);
   setDone(true);
  }catch(e){if(e instanceof Error&&e.message==='SURVEY_ALREADY_COMPLETED')setDone(true);else setError(explain(e));}
  finally{setBusy(false);}
 };
 return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800"><div className="mx-auto max-w-3xl space-y-6 rounded-2xl border bg-white p-6 shadow-sm">
  <header><p className="text-teal-700">Talent-On · Formación</p><h1 className="text-2xl font-bold">Encuesta de satisfacción</h1><p>{config?.name}</p><p className="mt-2 text-sm text-slate-500">Tiempo estimado: 3 minutos. Todos los campos son obligatorios. Tu documento verifica tu participación y evita respuestas repetidas.</p></header>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error} {!config&&<button onClick={()=>setRevision(x=>x+1)}>Reintentar</button>}</p>}
  {done?<p role="status" className="rounded-xl bg-teal-50 p-5">Tu respuesta ya fue registrada. ¡Gracias por ayudarnos a mejorar!</p>:!config?(!error&&<p role="status">Cargando…</p>):!config.enabled?<p>{surveyMessages.SURVEY_DISABLED}</p>:
  <form className="space-y-6" onSubmit={submit}>
   <div className="grid gap-4 sm:grid-cols-2"><label>Tipo de documento<select required name="documentType" className={field}><option value="DNI">DNI</option><option value="CE">CE</option></select></label><label>Número de documento<input required name="document" className={field} minLength={6} maxLength={24} pattern="[A-Za-z0-9]{6,24}" autoComplete="off"/></label></div>
   <p className="text-sm text-slate-500">1 = Totalmente en desacuerdo · 5 = Totalmente de acuerdo</p>
   {trainingSurveyQuestions.map((q,i)=><fieldset key={q} className="rounded-xl border p-4"><legend className="px-1 font-medium">{i+1}. {q}</legend><div className="flex flex-wrap gap-5">{[1,2,3,4,5].map(n=><label className="flex cursor-pointer items-center gap-2 py-2" key={n}><input required type="radio" name={`q${i}`} value={n}/>{n}</label>)}</div></fieldset>)}
   <label className="block">¿Qué aspectos valoras positivamente?<textarea required name="positive" className={field} maxLength={2000} rows={3}/></label>
   <label className="block">¿Qué deberíamos mejorar?<textarea required name="improvement" className={field} maxLength={2000} rows={3}/></label>
   <button type="submit" className={button} disabled={busy}>{busy?'Enviando…':'Enviar encuesta'}</button>
  </form>}
 </div></main>;
}
