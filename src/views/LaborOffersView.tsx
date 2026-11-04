import React,{useEffect,useState,useRef} from 'react';
import {useTalent} from '../context/TalentContext';
import {workerApi,getWorkerErrorMessage} from '../services/workerApi';
import {OfferContent,downloadOffer,offerDate,type OfferDocument} from '../components/selection/OfferDocument';
type Catalog={canCreate:boolean;canAssign:boolean;campaigns:{id:string;name:string}[];groups:{id:string;name:string;code:string;campaignId:string;campaignKey:string;status:string;templateId:string|null}[];templates:{id:string;campaign_id:string;campaignKey:string;title:string;content:string;created_at:string}[];documents:{id:string;groupId:string;name:string;title:string;signedAt:string|null;revokedAt:string|null;token:string|null}[]};
const field='mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const button='rounded-xl bg-[#143c55] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50';
export function LaborOffersView(){
 const {currentUser}=useTalent();
 const companies=currentUser.companies?.length?currentUser.companies:[{id:currentUser.companyId!,name:'Mi empresa',managed:false}];
 const [company,setCompany]=useState(companies[0]?.id||'');
 return <main className="space-y-6 p-4 sm:p-6"><header><h1 className="text-2xl font-bold text-[#0b2847]">Propuesta Laboral</h1><p className="mt-2 text-sm text-slate-500">Configura condiciones por campaña, asigna propuestas y consulta los documentos firmados.</p></header><label className="block max-w-md text-sm font-medium">Empresa<select className={field} value={company} onChange={e=>setCompany(e.target.value)}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{company&&<OffersPanel key={company} companyId={company}/>}</main>;
}
export const OffersPanel: React.FC<{companyId:string;groupId?:string}> = ({companyId,groupId}) => {
 const [data,setData]=useState<Catalog|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [campaign,setCampaign]=useState(''),[title,setTitle]=useState(''),[content,setContent]=useState(''),[group,setGroup]=useState(groupId||''),[template,setTemplate]=useState(''),[filter,setFilter]=useState('ALL'),[detail,setDetail]=useState<OfferDocument|null>(null);
 const [loading,setLoading]=useState(true);const loadingRef=useRef(false);
 useEffect(()=>{
  let active=true;const controller=new AbortController();loadingRef.current=true;setLoading(true);setError('');
  const timer=window.setTimeout(()=>{if(active){active=false;controller.abort();loadingRef.current=false;setLoading(false);setData(null);setError('La carga tardó más de lo esperado. Pulsa Actualizar para reintentar.');}},20000);
  workerApi<Catalog>('/api/offers'+(groupId?'?group='+encodeURIComponent(groupId):''),{signal:controller.signal},companyId)
   .then(d=>{if(active)setData(d);})
   .catch(e=>{if(active){setData(null);setError(getWorkerErrorMessage(e));}})
   .finally(()=>{clearTimeout(timer);if(active){loadingRef.current=false;setLoading(false);}});
  return()=>{active=false;clearTimeout(timer);controller.abort();loadingRef.current=false;};
 },[companyId,groupId,revision]);
 useEffect(()=>{const refresh=()=>{if(!loadingRef.current)setRevision(v=>v+1);};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
 const run=async(path:string,body:object)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await workerApi(path,{method:'POST',body:JSON.stringify(body)},companyId);setNotice('Guardado correctamente.');setRevision(v=>v+1);}catch(e){setError(getWorkerErrorMessage(e));}finally{setBusy(false);}};
 const selectedGroup=data?.groups.find(g=>g.id===group);
 const show=async(id:string,download=false)=>{setError('');try{const d=await workerApi<OfferDocument>('/api/offers/documents/'+id,{},companyId);if(download)downloadOffer(d);else setDetail(d);}catch(e){setError(getWorkerErrorMessage(e));}};
 const copy=async(token:string)=>{try{await navigator.clipboard.writeText(window.location.origin+'/propuesta/'+token);setNotice('Enlace copiado.');}catch{setError('No se pudo copiar. Abre el enlace y cópialo desde el navegador.');}};
 return <section className="space-y-5 text-[#143c55]">
 <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{groupId?'Propuestas de los participantes':'Plantillas y propuestas firmadas'}</h2><p className="mt-1 text-sm text-slate-500">Firma antes de iniciar, o como máximo antes de finalizar la teoría. Todos deben firmar para cerrar la etapa.</p></div><button disabled={loading} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50" onClick={()=>setRevision(v=>v+1)}>{loading?'Cargando…':'Actualizar'}</button></div>
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-teal-50 p-3 text-teal-800">{notice}</p>}
 {loading&&!data&&<p role="status">Cargando propuestas…</p>}
 {data&&<>
 {!groupId&&data.canCreate&&<details className="rounded-2xl border bg-white p-5"><summary className="cursor-pointer font-semibold">Crear propuesta o nueva versión</summary><form className="mt-5 space-y-4" onSubmit={e=>{e.preventDefault();void run('/api/offers/templates',{campaignId:campaign,title,content});}}>
 {data.campaigns.length===0&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No hay campañas activas disponibles para esta empresa dentro de tus permisos. Revisa el catálogo de campañas y las asignaciones de acceso.</p>}
 <label className="block text-sm">Campaña<select required className={field} value={campaign} onChange={e=>setCampaign(e.target.value)}><option value="">Selecciona una campaña</option>{data.campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label className="block text-sm">Título<input required maxLength={160} className={field} value={title} onChange={e=>setTitle(e.target.value)}/></label>
 <label className="block text-sm">Condiciones de la propuesta<textarea required minLength={20} maxLength={40000} rows={12} className={field} value={content} onChange={e=>setContent(e.target.value)} placeholder="Describe días y condiciones de capacitación, sueldo, bonos, fechas de pago, políticas y demás acuerdos."/></label>
 <p className="text-xs text-slate-500">El nombre, empresa, campaña y fechas se incluyen automáticamente. Puedes usar {'{{nombre}}'}, {'{{empresa}}'} y {'{{campaña}}'} en el texto. Cada guardado crea una versión nueva y conserva las anteriores.</p>
 <button disabled={busy} className={button}>Guardar nueva propuesta</button></form>
 <div className="mt-5 space-y-2">{data.templates.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>{t.title} · {data.campaigns.find(c=>c.id===(t.campaignKey||t.campaign_id))?.name} · {offerDate(t.created_at)}</span><button type="button" className="underline" onClick={()=>{setCampaign(t.campaignKey||t.campaign_id);setTitle(t.title);setContent(t.content);}}>Usar como base</button></div>)}</div></details>}
 {data.canAssign&&<form className="space-y-4 rounded-2xl border bg-white p-5" onSubmit={e=>{e.preventDefault();void run('/api/offers/assign',{groupId:group,templateId:template});}}><h3 className="font-semibold">Asignar propuesta a la capacitación</h3>
 <div className="grid gap-4 md:grid-cols-2"><label className="text-sm">Capacitación<select required disabled={Boolean(groupId)||busy} className={field} value={group} onChange={e=>{setGroup(e.target.value);setTemplate('');}}><option value="">Selecciona una capacitación</option>{data.groups.map(g=><option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}</select></label>
 <label className="text-sm">Propuesta de la campaña<select required disabled={!selectedGroup||busy} className={field} value={template} onChange={e=>setTemplate(e.target.value)}><option value="">Selecciona una versión</option>{data.templates.filter(t=>t.campaign_id===selectedGroup?.campaignId || t.campaignKey===selectedGroup?.campaignKey).map(t=><option key={t.id} value={t.id}>{t.title} · {offerDate(t.created_at)}</option>)}</select></label></div>
 <p className="text-xs text-slate-500">Se genera una propuesta por participante. Al reemplazar una versión sin firmas, sus enlaces anteriores dejan de funcionar. Con firmas registradas no se permite reemplazarla.</p><button disabled={busy||!template||!group} className={button}>Asignar y generar enlaces</button></form>}
 <div className="overflow-hidden rounded-2xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><h3 className="font-semibold">Documentos individuales ({data.documents.length})</h3><select aria-label="Filtrar propuestas" className="rounded-lg border p-2 text-sm" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">Todas</option><option value="SIGNED">Firmadas</option><option value="PENDING">Pendientes</option></select></div>
 {data.documents.length===0&&<p className="p-5 text-sm text-slate-500">Aún no hay propuestas asignadas. El reclutador debe asignar una desde Selección → Propuesta Laboral.</p>}
 <ul className="divide-y">{data.documents.filter(d=>filter==='ALL'||filter==='SIGNED'&&d.signedAt||filter==='PENDING'&&!d.signedAt&&!d.revokedAt).map(d=><li key={d.id} className="flex flex-col justify-between gap-4 p-4 lg:flex-row lg:items-center"><div><p className="font-semibold">{d.name}</p><p className="mt-1 text-xs text-slate-500">{d.title} · {data.groups.find(g=>g.id===d.groupId)?.code}</p><span className={'mt-2 inline-block rounded-full px-3 py-1 text-xs '+(d.signedAt?'bg-teal-50 text-teal-800':'bg-amber-50 text-amber-800')}>{d.signedAt?'Firmada · '+offerDate(d.signedAt):d.revokedAt?'Reemplazada':'Pendiente de firma'}</span></div><div className="flex flex-wrap gap-2 text-sm">
 <button className="rounded-lg border px-3 py-2" onClick={()=>void show(d.id)}>Ver documento</button>
 {d.token&&!d.signedAt&&<><button className="rounded-lg border px-3 py-2" onClick={()=>void copy(d.token!)}>Copiar enlace</button><a className="rounded-lg border px-3 py-2" href={'/propuesta/'+d.token} target="_blank" rel="noopener noreferrer">Abrir enlace</a></>}
 {d.signedAt&&<button className="rounded-lg bg-[#143c55] px-3 py-2 text-white" onClick={()=>void show(d.id,true)}>Descargar firmado</button>}</div></li>)}</ul></div>
 </>}
 {detail&&<div role="dialog" aria-modal="true" aria-label="Documento de propuesta laboral" className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 p-4"><div className="mx-auto max-w-3xl space-y-3"><div className="sticky top-0 flex justify-end gap-3 rounded-xl bg-white p-3"><button className="rounded-lg border px-4 py-2" onClick={()=>setDetail(null)}>Cerrar documento</button>{detail.signed_at&&<button className={button} onClick={()=>downloadOffer(detail)}>Descargar firmado</button>}</div><OfferContent document={detail}/></div></div>}
 </section>;
}
