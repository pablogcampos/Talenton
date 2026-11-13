import {useState} from 'react';
import {workerApi,getWorkerErrorMessage} from '../../services/workerApi';
import {cinthiaAction,cinthiaWhatsapp,invitationLink,type CinthiaRow,type CinthiaDetail} from '../../services/cinthia';
import {contactPhone} from '../selection/voicebotWorkspace';
import {cinthiaControl as control} from './CinthiaUI';
export function CinthiaRowActions({row,preview,available=false,onDetail,onMessage,onChanged}:{row:CinthiaRow;preview:boolean;available?:boolean;onDetail:()=>void;onMessage:(message:string,error?:boolean)=>void;onChanged:()=>void}){
 const [busy,setBusy]=useState(false);
 const action=async(type:string)=>{
  if(busy)return;setBusy(true);
  const popup=type==='PREPARE'||type==='WHATSAPP_OPENED'?window.open('about:blank','_blank'):null;if(popup)popup.opener=null;
  if(type==='WHATSAPP_OPENED'&&!popup){onMessage('Permite ventanas emergentes o copia el enlace. No se registró una apertura de WhatsApp.');setBusy(false);return;}
  try{
   if(type==='COPY'){
    const d=await workerApi<CinthiaDetail>('/api/cinthia/leads/'+row.id);const inv=d.invitations.find(i=>i.id===row.invitation_id);
    if(!inv||!['PREPARED','PENDING'].includes(inv.status))throw Error('CINTHIA_INVALID_STATE');
    await navigator.clipboard.writeText(invitationLink(inv.token));onMessage('Enlace copiado.');
   }else{
    const inv=await cinthiaAction(row.id,type,row.invitation_id||undefined);
    if(type==='PREPARE'||type==='WHATSAPP_OPENED'){
     if(popup){popup.location.replace(cinthiaWhatsapp(row.phone,row.full_name,invitationLink(inv.token),inv.test_mode));if(type==='PREPARE')await cinthiaAction(row.id,'WHATSAPP_OPENED',inv.id);onMessage('WhatsApp abierto. Confirma manualmente el envío después de enviar el mensaje.');}
     else onMessage('La invitación se conservó. Permite ventanas emergentes o copia el enlace desde el detalle.');
    }else onMessage('Envío confirmado manualmente.');
   }
  }catch(e){popup?.close();onMessage(getWorkerErrorMessage(e),true);}finally{setBusy(false);onChanged();}
 };
 const enabled=(preview||available)&&row.can_manage&&!busy,phone=!!contactPhone(row.phone);
 return <div className="flex max-w-72 flex-wrap gap-2">
 {['NOT_SENT','EXPIRED'].includes(row.state)&&row.can_manage&&<button className={control} title={!preview&&!available?'Disponible al conectar Gemini':undefined} disabled={!enabled||!phone} onClick={()=>void action('PREPARE')}>{row.state==='EXPIRED'?'Nueva invitación':'Enviar evaluación'}</button>}
 {['PREPARED','PENDING'].includes(row.state)&&<>
 <button className={control} disabled={!enabled||!phone} onClick={()=>void action('WHATSAPP_OPENED')}>Abrir WhatsApp</button>
 <button className={control} disabled={busy||(!preview&&!!row.test_mode)} onClick={()=>void action('COPY')}>Copiar enlace</button>
 {row.state==='PREPARED'&&row.can_manage&&<button className={control} disabled={!enabled} onClick={()=>void action('SENT')}>Marcar como enviada</button>}
 </>}
 <button className={control} disabled={busy} onClick={onDetail}>{row.state==='COMPLETED'?'Ver resultado':'Ver detalle'}</button>
 </div>;
}
