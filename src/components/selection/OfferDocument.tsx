import React,{useState} from 'react';
import {CompanyLogo} from '../common/CompanyLogo';
import {offerHtml} from './offerFormat';
import './offerDocument.css';
export type Signature=number[][][];
export type OfferDocument={id:string;snapshot:{name:string;dni?:string;company:string;campaign:string;group:string;days:number;startDate:string;endDate:string;title:string;content:string};signed_at?:string;signedAt?:string;signature?:Signature;acceptance?:string;content_hash?:string;contentHash?:string;evidence_hash?:string};
export const offerDate=(v?:string)=>v?new Intl.DateTimeFormat('es-PE',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(v)):'Pendiente';
export function SignatureImage({signature}:{signature:Signature}){
 return <svg viewBox="0 0 600 200" role="img" aria-label="Firma del participante" className="max-h-40 w-full rounded-lg border bg-white">{signature.map((stroke,i)=><polyline key={i} points={stroke.map(p=>p.join(',')).join(' ')} fill="none" stroke="#143c55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>)}</svg>;
}
export function OfferContent({document:d}:{document:OfferDocument}){
 const s=d.snapshot;
 const html=offerHtml(s.content,offerValues(d));
 return <article className="offer-page space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
  <header className="border-b border-slate-200 pb-5"><CompanyLogo companyName={s.company} className="mb-4"/><p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Propuesta laboral · {s.company}</p><h2 className="mt-2 text-2xl font-bold text-[#0b2847]">{s.title}</h2><p className="mt-3 text-lg font-semibold">{s.name}</p>{s.dni&&<p className="text-sm">DNI / documento: {s.dni}</p>}<p className="text-sm text-slate-500">{s.campaign} · {s.group}</p></header>
  <div className="rounded-xl bg-slate-50 p-4 text-sm"><p>Días de capacitación: <strong>{s.days||'Por definir'}</strong></p><p>Inicio: {s.startDate || 'Por definir'} · Fin de teoría: {s.endDate || 'Por definir'}</p></div>
  <div className="offer-rich" dangerouslySetInnerHTML={{__html:html}}/>
  {(d.signedAt||d.signed_at)&&<section className="space-y-3 border-t pt-5"><h3 className="font-semibold text-teal-800">Propuesta firmada</h3><p className="text-sm">{d.acceptance}</p>{d.signature&&<SignatureImage signature={d.signature}/>}<p className="text-sm">Firmada el {offerDate(d.signedAt||d.signed_at)} (hora de Lima).</p></section>}
  <p className="break-all text-xs text-slate-400">Código del documento: {d.id}<br/>Integridad del contenido: {d.contentHash||d.content_hash}</p>
 </article>;
}

export function offerValues(d:OfferDocument){const s=d.snapshot;return {nombre:s.name,empresa:s.company,'campaña':s.campaign,dias:s.days||'Por definir',inicio:s.startDate||'Por definir',fin:s.endDate||'Por definir'};}
export async function downloadOffer(d:OfferDocument){const {createOfferPdf}=await import('./offerPdf');await createOfferPdf(d);}
export function OfferDownloadButton({document:d}:{document:OfferDocument}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div><button disabled={busy} className="rounded-lg bg-[#143c55] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={async()=>{setBusy(true);setError('');try{await downloadOffer(d);}catch{setError('No se pudo generar el PDF. Intenta nuevamente.');}finally{setBusy(false);}}}>{busy?'Preparando PDF…':'Descargar PDF'}</button>{error&&<p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}
