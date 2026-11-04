import React,{useEffect,useRef,useState} from 'react';
import {OfferContent,OfferDownloadButton,type OfferDocument,type Signature,SignatureImage} from '../components/selection/OfferDocument';
import {getWorkerErrorMessage} from '../services/workerApi';
const base=(import.meta.env.VITE_ADMIN_API_URL||import.meta.env.VITE_WORKER_API_URL)?.replace(/\/$/,'');
export function PublicOfferView({token}:{token:string}){
 const [doc,setDoc]=useState<OfferDocument|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false),[dni,setDni]=useState(''),[strokes,setStrokes]=useState<Signature>([]);
 const drawing=useRef(false),svg=useRef<SVGSVGElement>(null);
 const request=async(init?:RequestInit)=>{const r=await fetch(base+'/api/public/offers/'+token,{...init,headers:{'Content-Type':'application/json'},referrerPolicy:'no-referrer'});const d=await r.json();if(!r.ok)throw Error(d.message);return d;};
 const refresh=async()=>{setError('');try{setDoc(await request());}catch(e){setError(getWorkerErrorMessage(e));}};
 useEffect(()=>{let active=true;request().then(d=>{if(active)setDoc(d);}).catch(e=>{if(active)setError(getWorkerErrorMessage(e));});return()=>{active=false;};},[token]);
 const point=(e:React.PointerEvent)=>{const r=svg.current!.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(600,(e.clientX-r.left)/r.width*600))),Math.round(Math.max(0,Math.min(200,(e.clientY-r.top)/r.height*200)))];};
 const count=strokes.reduce((n,s)=>n+s.length,0);
 const sign=async(e:React.FormEvent)=>{e.preventDefault();if(busy||!accepted||count<10||!doc)return;setBusy(true);setError('');try{await request({method:'POST',body:JSON.stringify({dni,accepted,signature:strokes,contentHash:doc.contentHash})});await refresh();}catch(e){setError(getWorkerErrorMessage(e));}finally{setBusy(false);}};
 return <main className="min-h-screen bg-slate-50 px-4 py-8 text-[#143c55]"><div className="mx-auto max-w-3xl space-y-5"><header><h1 className="text-2xl font-bold">Revisa tu propuesta laboral</h1><p className="mt-2 text-sm text-slate-500">Lee las condiciones antes de aceptar y firmar.</p></header>
 {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}<button className="ml-3 underline" onClick={()=>void refresh()}>Reintentar</button></div>}
 {!doc&&!error&&<p role="status">Cargando propuesta…</p>}
 {doc&&<><OfferContent document={doc}/><div className="flex justify-end"><OfferDownloadButton document={doc}/></div>{!doc.signedAt?<form onSubmit={sign} className="space-y-5 rounded-2xl border bg-white p-5 sm:p-8"><h2 className="text-lg font-bold">Aceptación y firma</h2>
 <label className="block text-sm font-medium">Confirma tu DNI / documento<input required autoComplete="off" maxLength={30} value={dni} disabled={busy} onChange={e=>setDni(e.target.value.trim())} className="mt-2 block w-full rounded-xl border p-3 focus:ring-2 focus:ring-teal-500"/></label>
 <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" required checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)} className="mt-1 h-5 w-5 shrink-0"/>He leído y acepto íntegramente esta propuesta laboral y sus condiciones.</label>
 <div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Dibuja tu firma</span><button type="button" disabled={busy} className="text-sm underline" onClick={()=>setStrokes([])}>Borrar firma</button></div>
 <svg ref={svg} viewBox="0 0 600 200" role="img" aria-label="Área para dibujar la firma con el mouse o el dedo" className="w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-slate-50"
 onPointerDown={e=>{if(busy||count>=5000||strokes.length>=100)return;e.currentTarget.setPointerCapture(e.pointerId);drawing.current=true;const p=point(e);setStrokes(s=>[...s,[p]]);}}
 onPointerMove={e=>{if(!drawing.current||busy)return;const p=point(e);setStrokes(s=>s.reduce((n,x)=>n+x.length,0)>=5000?s:[...s.slice(0,-1),[...s[s.length-1],p]]);}}
 onPointerUp={()=>{drawing.current=false;}} onPointerCancel={()=>{drawing.current=false;}}>
 {strokes.map((s,i)=><polyline key={i} points={s.map(p=>p.join(',')).join(' ')} fill="none" stroke="#143c55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>)}
 </svg><p className="mt-2 text-xs text-slate-500">Firma con el dedo o el mouse. La fecha de aceptación se registra automáticamente.</p></div>
 <button disabled={busy||!accepted||count<10||!dni} className="w-full rounded-xl bg-[#143c55] px-5 py-3 font-semibold text-white disabled:opacity-50">{busy?'Guardando firma…':'Aceptar y firmar propuesta'}</button>
 </form>:<p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 font-semibold text-teal-800">Tu propuesta firmada ha quedado registrada.</p>}</>}
 </div></main>;
}
