import React from 'react';
export type Signature=number[][][];
export type OfferDocument={id:string;snapshot:{name:string;dni?:string;company:string;campaign:string;group:string;days:number;startDate:string;endDate:string;title:string;content:string};signed_at?:string;signedAt?:string;signature?:Signature;acceptance?:string;content_hash?:string;contentHash?:string;evidence_hash?:string};
export const offerDate=(v?:string)=>v?new Intl.DateTimeFormat('es-PE',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(v)):'Pendiente';
export function SignatureImage({signature}:{signature:Signature}){
 return <svg viewBox="0 0 600 200" role="img" aria-label="Firma del participante" className="max-h-40 w-full rounded-lg border bg-white">{signature.map((stroke,i)=><polyline key={i} points={stroke.map(p=>p.join(',')).join(' ')} fill="none" stroke="#143c55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>)}</svg>;
}
export function OfferContent({document:d}:{document:OfferDocument}){
 const s=d.snapshot;
 return <article className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
  <header className="border-b border-slate-200 pb-5"><p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Propuesta laboral · {s.company}</p><h2 className="mt-2 text-2xl font-bold text-[#0b2847]">{s.title}</h2><p className="mt-3 text-lg font-semibold">{s.name}</p><p className="text-sm text-slate-500">{s.campaign} · {s.group}</p></header>
  <div className="rounded-xl bg-slate-50 p-4 text-sm"><p>Días de capacitación: <strong>{s.days}</strong></p><p>Inicio: {s.startDate || 'Por definir'} · Fin de teoría: {s.endDate || 'Por definir'}</p></div>
  <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{s.content}</div>
  {(d.signedAt||d.signed_at)&&<section className="space-y-3 border-t pt-5"><h3 className="font-semibold text-teal-800">Propuesta firmada</h3><p className="text-sm">{d.acceptance}</p>{d.signature&&<SignatureImage signature={d.signature}/>}<p className="text-sm">Firmada el {offerDate(d.signedAt||d.signed_at)} (hora de Lima).</p></section>}
  <p className="break-all text-xs text-slate-400">Código del documento: {d.id}<br/>Integridad del contenido: {d.contentHash||d.content_hash}</p>
 </article>;
}
export function downloadOffer(d:OfferDocument){
 const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const s=d.snapshot;
 const svg=d.signature?'<svg viewBox="0 0 600 200" width="600" style="max-width:100%">'+d.signature.map(stroke=>'<polyline fill="none" stroke="#143c55" stroke-width="2.5" points="'+stroke.map(p=>p.map(Number).join(',')).join(' ')+'"/>').join('')+'</svg>':'';
 const html='<!doctype html><html lang="es"><meta charset="utf-8"><title>'+esc(s.title)+'</title><style>body{max-width:800px;margin:40px auto;padding:24px;font:16px/1.6 system-ui;color:#143c55}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}small{overflow-wrap:anywhere}</style><h1>'+esc(s.title)+'</h1><h2>'+esc(s.name)+'</h2><p>Documento: '+esc(s.dni)+'</p><p>'+esc(s.company)+' · '+esc(s.campaign)+' · '+esc(s.group)+'</p><p>Días: '+esc(s.days)+' · Inicio: '+esc(s.startDate)+' · Fin de teoría: '+esc(s.endDate)+'</p><hr/><pre>'+esc(s.content)+'</pre><hr/><p>'+esc(d.acceptance)+'</p>'+svg+'<p>Firma: '+esc(offerDate(d.signed_at||d.signedAt))+' (Lima)</p><small>Documento: '+esc(d.id)+'<br/>SHA-256: '+esc(d.content_hash||d.contentHash)+'<br/>Evidencia: '+esc(d.evidence_hash)+'</small></html>';
 const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Propuesta-'+s.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ -]/g,'').slice(0,80)+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
