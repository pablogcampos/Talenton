import {CinthiaResult} from './CinthiaResult';
import {useEffect,useState} from 'react';
import {VoicebotLeadDialog} from '../selection/VoicebotLeadDialog';
import {peru,contactPhone} from '../selection/voicebotWorkspace';
import {workerApi,getWorkerErrorMessage} from '../../services/workerApi';
import {cinthiaAction,cinthiaWhatsapp,invitationLink,type CinthiaDetail as Detail,type Invitation} from '../../services/cinthia';
import {CinthiaBadge,CinthiaAvatar,cinthiaControl as control,cinthiaPrimary as primary} from './CinthiaUI';
const eventLabels:Record<string,string>={PREPARED:'Invitación creada',WHATSAPP_OPENED:'WhatsApp abierto (sin confirmación de entrega)',SENT:'Envío confirmado manualmente',STARTED:'Entrevista iniciada',COMPLETED:'Entrevista completada',EXPIRED:'Invitación expirada',CANCELLED:'Invitación cancelada'};
export function CinthiaDetail({leadId,preview,available=false,onClose,onChanged,onOriginal}:{leadId:string;preview:boolean;available?:boolean;onClose:()=>void;onChanged:()=>void;onOriginal:(externalId:string)=>void}){
 const [detail,setDetail]=useState<Detail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),[confirmCancel,setConfirmCancel]=useState(false);
 useEffect(()=>{const c=new AbortController();void workerApi<Detail>('/api/cinthia/leads/'+leadId,{signal:c.signal}).then(d=>{if(!c.signal.aborted)setDetail(d);}).catch(e=>{if(!c.signal.aborted)setError(getWorkerErrorMessage(e));});return()=>c.abort();},[leadId,revision]);
 const inv=detail?.invitations[0],state=inv?.status||'NOT_SENT';
 const send=async(action:string)=>{
  if(busy)return;setBusy(true);setError('');setNotice('');
  // Open in the click gesture; otherwise async persistence triggers popup blockers.
  const popup=['PREPARE','WHATSAPP_OPENED'].includes(action)?window.open('about:blank','_blank'):null;
  if(popup)popup.opener=null;
  if(action==='WHATSAPP_OPENED'&&!popup){setNotice('Permite ventanas emergentes o copia el enlace. No se registró una apertura de WhatsApp.');setBusy(false);return;}
  try{
   const saved=await cinthiaAction(leadId,action,inv?.id);
   if(action==='PREPARE'||action==='WHATSAPP_OPENED'){
    const url=cinthiaWhatsapp(detail!.lead.phone,detail!.lead.full_name,invitationLink(saved.token),saved.test_mode);
    if(popup){popup.location.replace(url);if(action==='PREPARE')await cinthiaAction(leadId,'WHATSAPP_OPENED',saved.id);setNotice('WhatsApp abierto. Confirma el envío sólo después de enviar el mensaje.');}
    else setNotice('El navegador bloqueó la ventana. La invitación se conservó; usa Abrir WhatsApp o Copiar enlace.');
   }else setNotice(action==='SENT'?'Confirmación manual guardada.':'Invitación cancelada.');
   setConfirmCancel(false);onChanged();
  }catch(e){popup?.close();setError(getWorkerErrorMessage(e));}
  finally{setBusy(false);setRevision(v=>v+1);}
 };
 const copy=async(i:Invitation)=>{try{await navigator.clipboard.writeText(invitationLink(i.token));setNotice('Enlace copiado.');}catch{setError('No se pudo copiar. Selecciona y copia el enlace mostrado.');}};
 return <VoicebotLeadDialog busy={busy} onClose={onClose}><article className="space-y-6 p-5 sm:p-7">
 <header className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><CinthiaAvatar/><div><p className="text-xs uppercase tracking-wider text-teal-700">CinthIA · Detalle</p><h2 className="mt-1 text-xl font-semibold">{detail?.lead.full_name||'Nombre no informado'}</h2><p className="text-sm text-slate-500">{detail?.lead.phone}</p></div></div><button className={control} disabled={busy} onClick={onClose}>Cerrar</button></header>
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}<button className="ml-3 underline" disabled={busy} onClick={()=>{setError('');setRevision(v=>v+1);}}>Reintentar</button></p>}
 {notice&&<p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
 {!detail&&!error&&<p role="status">Cargando información…</p>}
 {detail&&<><CinthiaBadge status={state}/><dl className="grid gap-4 text-sm sm:grid-cols-2">{[['Recibido (Perú)',peru(detail.lead.received_at)],['Responsable',detail.lead.owner_name||'Sin asignar'],['Disponibilidad',detail.lead.interview_availability||detail.lead.workday],['Experiencia',detail.lead.experience],['Distrito',detail.lead.district],['Interés declarado',detail.lead.interest]].map(([label,value])=><div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value||'No informado'}</dd></div>)}</dl>
 <button className={control} disabled={busy} onClick={()=>onOriginal(detail.lead.external_id)}>Ver registro original en Voicebot</button>
 <section className="space-y-3 rounded-2xl border border-slate-200 p-4"><h3 className="font-semibold">Invitación CinthIA</h3>
 {!preview&&!available&&<p className="text-sm text-slate-500">Envíos deshabilitados hasta conectar el servicio de entrevistas con Gemini.</p>}
 {preview&&<p className="text-sm text-amber-800">Prueba local: utilizar únicamente con participantes de prueba autorizados.</p>}
 {inv?<><dl className="grid gap-3 text-sm sm:grid-cols-2">{[['Creada',peru(inv.created_at)],['Vigencia',peru(inv.expires_at)],['Envío confirmado',peru(inv.sent_at)],['Inicio de entrevista',peru(inv.started_at)],['Preparada por',inv.prepared_name||'Sin registro'],['Envío confirmado por',inv.sent_name||'Sin registro']].map(([k,v])=><div key={k}><dt className="text-slate-500">{k}</dt><dd>{v}</dd></div>)}</dl>
 {['PREPARED','PENDING'].includes(state)&&(preview||!inv.test_mode)&&<><label className="block text-sm">Enlace individual<input readOnly className={control+' mt-1 w-full'} value={invitationLink(inv.token)} onFocus={e=>e.target.select()}/></label><button className={control} onClick={()=>void copy(inv)}>Copiar enlace</button></>}
 </>:<p className="text-sm text-slate-500">No hay una invitación para este lead.</p>}
 {detail.can_manage&&<div className="flex flex-wrap gap-2">
 {['NOT_SENT','EXPIRED'].includes(state)&&<button className={primary} disabled={busy||!(preview||available)||!contactPhone(detail.lead.phone)} onClick={()=>void send('PREPARE')}>{state==='EXPIRED'?'Generar nueva invitación':'Enviar evaluación'}</button>}
 {['PREPARED','PENDING'].includes(state)&&<button className={control} disabled={busy||!(preview||available)||!contactPhone(detail.lead.phone)} onClick={()=>void send('WHATSAPP_OPENED')}>Abrir WhatsApp</button>}
 {state==='PREPARED'&&<button className={primary} disabled={busy||!(preview||available)} onClick={()=>void send('SENT')}>Marcar como enviada</button>}
 {['PREPARED','PENDING','IN_PROGRESS'].includes(state)&&<button className={control} disabled={busy} onClick={()=>setConfirmCancel(true)}>Cancelar invitación</button>}
 </div>}
 {!contactPhone(detail.lead.phone)&&<p className="text-sm text-red-700">El lead necesita un teléfono válido para abrir WhatsApp.</p>}
 {confirmCancel&&<div className="rounded-xl bg-slate-50 p-3 text-sm"><p>¿Cancelar esta invitación? Su enlace dejará de estar disponible.</p><div className="mt-2 flex gap-2"><button className={control} disabled={busy} onClick={()=>setConfirmCancel(false)}>Conservar</button><button className={primary} disabled={busy} onClick={()=>void send('CANCELLED')}>Confirmar cancelación</button></div></div>}
 </section>
 <section><h3 className="mb-3 font-semibold">Historial de invitaciones</h3>{detail.events.length?<ol className="space-y-3 border-l border-slate-200 pl-4">{detail.events.map(e=><li key={e.id} className="text-sm"><p>{eventLabels[e.action]||e.action}</p><time className="text-xs text-slate-500" dateTime={e.created_at}>{peru(e.created_at)}</time><p className="text-xs text-slate-500">{e.actor_name||'Sistema'}</p></li>)}</ol>:<p className="text-sm text-slate-500">Sin eventos registrados.</p>}</section>
 {detail.invitations.length>1&&<details><summary className="cursor-pointer text-sm font-semibold">Invitaciones anteriores ({detail.invitations.length-1})</summary>{detail.invitations.slice(1).map(i=><p key={i.id} className="mt-3 text-sm">{peru(i.created_at)} · <CinthiaBadge status={i.status}/></p>)}</details>}
 <section className="space-y-4"><h3 className="font-semibold">Transcripción de entrevista</h3>{detail.sessions?.length?detail.sessions.map(s=><article key={s.id} className="rounded-xl border border-slate-200 p-4"><p className="text-sm">{s.state} · {peru(s.startedAt)} · {s.durationSeconds!=null?s.durationSeconds+' s':'Sin finalizar'} · {s.model}</p><ol className="mt-3 space-y-3">{s.transcript.map(t=><li key={t.id} className="text-sm"><strong>{t.speaker==='cinthia'?'CinthIA':'Postulante'}{!t.complete?' · Transcripción incompleta':''}</strong><p className="whitespace-pre-wrap">{t.text}</p><span className="text-xs text-slate-500">{peru(t.at)} · Gemini Live</span></li>)}</ol>{s.errors.length>0&&<details className="mt-3 text-xs"><summary>Interrupciones ({s.errors.length})</summary>{s.errors.map((e,i)=><p key={i}>{peru(e.at)} · {e.code}</p>)}</details>}</article>):<p className="text-sm text-slate-500">Sin transcripciones registradas.</p>}</section><CinthiaResult/>
 </>}
 </article></VoicebotLeadDialog>;
}
