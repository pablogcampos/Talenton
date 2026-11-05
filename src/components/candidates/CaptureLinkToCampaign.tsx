import React, { useEffect, useState } from 'react';
import { useTalent } from '../../context/TalentContext';
import { selectionAdvancedApi, ProcessTemplate } from '../../services/selectionAdvancedApi';
import { captureApi, CaptureEvent } from '../../services/captureApi';
import { getWorkerErrorMessage } from '../../services/workerApi';

export function CaptureLinkToCampaign({ eventId, candidateId, companyId, ownerUid }: { eventId?: string; candidateId?: string; companyId?: string; ownerUid?: string }) {
  const { scopedCampaigns, myAssignedCampaigns, currentUser } = useTalent();
  const [open,setOpen]=useState(false), [campaignId,setCampaignId]=useState(''), [templateId,setTemplateId]=useState('');
  const [templates,setTemplates]=useState<ProcessTemplate[]>([]), [busy,setBusy]=useState(false), [loading,setLoading]=useState(false), [message,setMessage]=useState(''), [done,setDone]=useState(false);
  const [source,setSource]=useState<{id:string;companyId?:string;ownerUid?:string}|null>(null);
  const campaigns=(currentUser.role==='RECLUTADOR'?myAssignedCampaigns:scopedCampaigns).filter(c=>
    c.companyId===(source?.companyId||companyId) && !['CERRADO','ANULADO','EN_PAUSA'].includes(c.status) &&
    (currentUser.role==='ADMIN'||c.responsibles?.some(r=>r.userId===source?.ownerUid)));
  useEffect(()=>{let active=true;setTemplates([]);setTemplateId('');if(!campaignId)return;
    selectionAdvancedApi.configuration(campaignId).then(result=>{if(active)setTemplates(result.templates.filter(t=>t.responsibleIds.includes(source?.ownerUid||'')));}).catch(error=>{if(active)setMessage(getWorkerErrorMessage(error));});
    return()=>{active=false;};
  },[campaignId,source?.ownerUid]);
  const start=async()=>{
    setOpen(true);setLoading(true);setMessage('');setDone(false);setCampaignId('');setTemplateId('');setTemplates([]);setSource(null);
    try {
      if(eventId) setSource({id:eventId,companyId,ownerUid});
      else if(candidateId){
        const dossier=await captureApi.dossier(candidateId);
        const events=dossier.events.filter(e=>!e.conflict && (currentUser.role==='ADMIN'||e.ownerUid===currentUser.id||(currentUser.role==='ANALISTA_SELECCION'&&currentUser.subordinateUserIds?.includes(e.ownerUid))));
        const event=events.sort((a:CaptureEvent,b:CaptureEvent)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
        if(!event)throw new Error('No hay una captación sin conflictos dentro de tu alcance para vincular.');
        setSource({id:event.id,companyId:event.companyId||companyId,ownerUid:event.ownerUid});
      }
    }catch(error){setMessage(getWorkerErrorMessage(error));}finally{setLoading(false);}
  };
  const control='w-full rounded-lg border border-slate-200 bg-white p-2 text-sm';
  return <><button type="button" className="rounded-lg border border-sky-200 px-3 py-2 text-sm text-sky-800" onClick={()=>void start()}>Vincular convocatoria</button>{open&&<div role="dialog" aria-modal="true" aria-label="Vincular convocatoria" className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 text-left"><form className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5" onSubmit={async e=>{
    e.preventDefault();if(!source||busy||done||loading)return;setBusy(true);setMessage('');
    try{await selectionAdvancedApi.link(source.id,campaignId,templateId,source.companyId);setDone(true);setMessage('Vinculado correctamente. Ya aparece en la convocatoria.');}
    catch(error){setMessage(getWorkerErrorMessage(error));}finally{setBusy(false);}
  }}>
    <h2 className="text-lg font-bold">Vinculación manual a convocatoria</h2>
    <p className="text-sm text-slate-500">La captación todavía no tiene convocatoria. Se conserva el formulario, su origen y el reclutador responsable.</p>
    {loading?<p>Cargando convocatorias autorizadas…</p>:!done&&source&&<>
      <label className="block text-sm">Convocatoria<select required disabled={busy} className={control} value={campaignId} onChange={e=>{setCampaignId(e.target.value);setTemplateId('');setTemplates([]);}}><option value="">Selecciona una convocatoria</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></label>
      <label className="block text-sm">Versión del proceso<select disabled={busy} className={control} value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Flujo existente sin plantilla</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name} · v{t.version}</option>)}</select></label>
      {!campaigns.length&&<p className="text-sm text-amber-700">No hay convocatorias activas autorizadas para el reclutador responsable en esta empresa. Revisa su asignación a la convocatoria.</p>}
    </>}
    {message&&<p role="status" className="text-sm">{message}</p>}
    <div className="flex justify-end gap-2"><button type="button" disabled={busy||loading} className="rounded-lg border p-2" onClick={()=>setOpen(false)}>Cerrar</button>{!done&&<button disabled={busy||loading||!campaignId||!source} className="rounded-lg bg-sky-700 px-4 py-2 text-white disabled:opacity-50">{busy?'Vinculando…':'Confirmar vinculación'}</button>}</div>
  </form></div>}</>;
}
