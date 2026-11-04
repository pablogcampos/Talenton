import React,{useEffect,useState,useRef,lazy,Suspense} from 'react';
import {useTalent} from '../context/TalentContext';
import {workerApi,getWorkerErrorMessage} from '../services/workerApi';
import {OfferContent,OfferDownloadButton,downloadOffer,offerDate,type OfferDocument} from '../components/selection/OfferDocument';
import {offerWorkdays,type OfferWorkday} from '../../shared/offerWorkdays';
import {OfferWorkdayAssignment} from '../components/selection/OfferWorkdayAssignment';
type Catalog={canCreate:boolean;canAssign:boolean;campaigns:{id:string;name:string}[];groups:{id:string;name:string;code:string;campaignId:string;campaignKey:string;status:string;publicToken:string;templateId:string|null}[];templates:{workday?:OfferWorkday;id:string;campaign_id:string;campaignKey:string;title:string;content:string;created_at:string}[];documents:{id:string;groupId:string;name:string;title:string;signedAt:string|null;revokedAt:string|null;token:string|null}[]};
const OfferEditor=lazy(()=>import('../components/selection/OfferEditor'));
const field='mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const button='rounded-xl bg-[#143c55] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50';
export function LaborOffersView(){
 const {currentUser}=useTalent();
 const [companies,setCompanies]=useState<{id:string;name:string;role:string}[]>([]),[company,setCompany]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;const controller=new AbortController();setLoading(true);setError('');setCompany('');setCompanies([]);
  const timeout=setTimeout(()=>{if(active){active=false;controller.abort();setLoading(false);setError('No se pudieron cargar tus empresas autorizadas. Intenta nuevamente.');}},20000);
  workerApi<{companies:{id:string;name:string;role:string}[]}>('/api/offers/companies',{signal:controller.signal},currentUser.companyId)
   .then(d=>{if(active){setCompanies(d.companies);setCompany(d.companies[0]?.id||'');}}).catch(e=>{if(active)setError(getWorkerErrorMessage(e));})
   .finally(()=>{clearTimeout(timeout);if(active)setLoading(false);});
  return()=>{active=false;clearTimeout(timeout);controller.abort();};
 },[currentUser.id,currentUser.companyId,revision]);
 return <main className="space-y-6 p-4 sm:p-6"><header><h1 className="text-2xl font-bold text-[#0b2847]">Propuesta Laboral</h1><p className="mt-2 text-sm text-slate-500">Configura condiciones por campaña, asigna propuestas y consulta los documentos firmados.</p></header>
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error} <button className="underline" onClick={()=>setRevision(v=>v+1)}>Reintentar</button></p>}
 {loading&&<p role="status">Consultando tus permisos por empresa…</p>}
 {!loading&&!error&&companies.length===0&&<p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-800">No tienes un perfil de Selección habilitado en tus empresas. Revisa tus asignaciones con el administrador.</p>}
 {companies.length>0&&<label className="block max-w-md text-sm font-medium">Empresa<select className={field} value={company} onChange={e=>setCompany(e.target.value)}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><span className="mt-2 block text-xs font-normal text-slate-500">Solo se muestran empresas donde tienes acceso a Selección.</span></label>}
 {company&&<OffersPanel key={company} companyId={company} companyName={companies.find(c=>c.id===company)?.name}/>}</main>;
}
export const OffersPanel: React.FC<{companyId:string;companyName?:string;groupId?:string}> = ({companyId,companyName=companyId,groupId}) => {
 const [data,setData]=useState<Catalog|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [editing,setEditing]=useState<{campaignId:string;title:string;content:string;workday?:OfferWorkday}|null|undefined>(undefined);
 const [filter,setFilter]=useState('ALL'),[detail,setDetail]=useState<OfferDocument|null>(null);
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
 useEffect(()=>{const refresh=()=>{if(editing===undefined&&!loadingRef.current)setRevision(v=>v+1);};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[editing]);
 const run=async(path:string,body:object)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await workerApi(path,{method:'POST',body:JSON.stringify(body)},companyId);setNotice('Guardado correctamente.');setRevision(v=>v+1);}catch(e){setError(getWorkerErrorMessage(e));}finally{setBusy(false);}};

 const show=async(id:string,download=false)=>{setError('');try{const d=await workerApi<OfferDocument>('/api/offers/documents/'+id,{},companyId);if(download)await downloadOffer(d);else setDetail(d);}catch(e){setError(getWorkerErrorMessage(e));}};
 const copy=async(token:string)=>{try{await navigator.clipboard.writeText(window.location.origin+'/propuesta/capacitacion/'+token);setNotice('Enlace copiado.');}catch{setError('No se pudo copiar. Abre el enlace y cópialo desde el navegador.');}};
 return <section className="space-y-5 text-[#143c55]">
 <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{groupId?'Propuestas de los participantes':'Plantillas y propuestas firmadas'}</h2><p className="mt-1 text-sm text-slate-500">Firma antes de iniciar, o como máximo antes de finalizar la teoría. Todos deben firmar para cerrar la etapa.</p></div><button disabled={loading} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50" onClick={()=>setRevision(v=>v+1)}>{loading?'Cargando…':'Actualizar'}</button></div>
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-teal-50 p-3 text-teal-800">{notice}</p>}
 {loading&&!data&&<p role="status">Cargando propuestas…</p>}
 {data&&<>
 {!groupId&&data.canCreate&&<section className="space-y-4 rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Plantillas por campaña</h3><p className="text-sm text-slate-500">Edita el documento con el formato y logo de la empresa.</p></div><button disabled={loading||!data.campaigns.length} className={button} onClick={()=>setEditing(null)}>Crear propuesta</button></div>
 {!data.campaigns.length&&<p role="status">No hay campañas activas disponibles dentro de tus permisos.</p>}
 <div className="space-y-2">{data.templates.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>{t.title} · {t.workday?offerWorkdays[t.workday]:'Sin jornada: editar nueva versión'} · {data.campaigns.find(c=>c.id===(t.campaignKey||t.campaign_id))?.name} · {offerDate(t.created_at)}</span><button disabled={loading} className="rounded-lg border bg-white px-3 py-2" onClick={()=>setEditing({campaignId:t.campaignKey||t.campaign_id,title:t.title,content:t.content,workday:t.workday})}>Editar nueva versión</button></div>)}</div></section>}
 {editing!==undefined&&<Suspense fallback={<p role="status">Abriendo editor…</p>}><OfferEditor companyId={companyId} companyName={companyName} campaigns={data.campaigns} initial={editing||undefined} onClose={()=>setEditing(undefined)} onSave={async value=>{await workerApi('/api/offers/templates',{method:'POST',body:JSON.stringify(value)},companyId);setNotice('Nueva versión guardada. Los documentos anteriores se conservan.');setRevision(v=>v+1);}}/></Suspense>}
 {data.canAssign&&<OfferWorkdayAssignment companyId={companyId} groupId={groupId} groups={data.groups} onAssigned={()=>setRevision(v=>v+1)}/>}
 <section className="space-y-3 rounded-2xl border bg-white p-5"><h3 className="font-semibold">Enlace único por capacitación</h3><p className="text-sm text-slate-500">Comparte el mismo enlace con todos los participantes. Cada uno ingresa su DNI y accede únicamente a su propuesta asignada.</p>{data.groups.length===0&&<p className="text-sm">Aún no hay capacitaciones disponibles.</p>}{data.groups.map(g=><div key={g.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><p className="text-sm font-semibold">{g.code} · {g.name}</p><a href={'/propuesta/capacitacion/'+g.publicToken} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-xs underline">{window.location.origin+'/propuesta/capacitacion/'+g.publicToken}</a></div><button className="rounded-lg border bg-white px-3 py-2 text-sm" onClick={()=>void copy(g.publicToken)}>Copiar enlace de capacitación</button></div>)}</section>
 <div className="overflow-hidden rounded-2xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><h3 className="font-semibold">Documentos individuales ({data.documents.length})</h3><select aria-label="Filtrar propuestas" className="rounded-lg border p-2 text-sm" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">Todas</option><option value="SIGNED">Firmadas</option><option value="PENDING">Pendientes</option></select></div>
 {data.documents.length===0&&<p className="p-5 text-sm text-slate-500">Aún no hay propuestas asignadas. El reclutador debe asignar una desde Selección → Propuesta Laboral.</p>}
 <ul className="divide-y">{data.documents.filter(d=>filter==='ALL'||filter==='SIGNED'&&d.signedAt||filter==='PENDING'&&!d.signedAt&&!d.revokedAt).map(d=><li key={d.id} className="flex flex-col justify-between gap-4 p-4 lg:flex-row lg:items-center"><div><p className="font-semibold">{d.name}</p><p className="mt-1 text-xs text-slate-500">{d.title} · {data.groups.find(g=>g.id===d.groupId)?.code}</p><span className={'mt-2 inline-block rounded-full px-3 py-1 text-xs '+(d.signedAt?'bg-teal-50 text-teal-800':'bg-amber-50 text-amber-800')}>{d.signedAt?'Firmada · '+offerDate(d.signedAt):d.revokedAt?'Reemplazada':'Pendiente de firma'}</span></div><div className="flex flex-wrap gap-2 text-sm">
 <button className="rounded-lg border px-3 py-2" onClick={()=>void show(d.id)}>Ver documento</button>
 {d.signedAt&&<button className="rounded-lg bg-[#143c55] px-3 py-2 text-white" onClick={()=>void show(d.id,true)}>Descargar firmado</button>}</div></li>)}</ul></div>
 </>}
 {detail&&<div role="dialog" aria-modal="true" aria-label="Documento de propuesta laboral" className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 p-4"><div className="mx-auto max-w-3xl space-y-3"><div className="sticky top-0 flex justify-end gap-3 rounded-xl bg-white p-3"><button className="rounded-lg border px-4 py-2" onClick={()=>setDetail(null)}>Cerrar documento</button>{detail.signed_at&&<OfferDownloadButton document={detail}/>}</div><OfferContent document={detail}/></div></div>}
 </section>;
}
