
import {useState} from 'react';
import {workerApi,getWorkerErrorMessage} from '../../services/workerApi';
import {cinthiaAction,cinthiaMessage,cinthiaChatUrl,invitationLink,type CinthiaRow,type CinthiaDetail} from '../../services/cinthia';
import {contactPhone} from '../selection/voicebotWorkspace';
import {cinthiaControl as control} from './CinthiaUI';
export function CinthiaRowActions({row,preview,available=false,onDetail,onMessage,onChanged,onShare}:{row:CinthiaRow;preview:boolean;available?:boolean;onDetail:()=>void;onMessage:(message:string,error?:boolean)=>void;onChanged:()=>void;onShare:(share:{phone:string;message:string;id:string;leadId:string})=>void}){
 const [busy,setBusy]=useState(false);
 const action=async(type:string)=>{
  if(busy)return;setBusy(true);
  try{
   if(type==='COPY'||type==='COPY_MESSAGE'){
    const d=await workerApi<CinthiaDetail>('/api/cinthia/leads/'+row.id);const inv=d.invitations.find(i=>i.id===row.invitation_id);
    if(!inv||!['PREPARED','PENDING'].includes(inv.status))throw Error('CINTHIA_INVALID_STATE');
    await navigator.clipboard.writeText(type==='COPY_MESSAGE'?cinthiaMessage(row.full_name,invitationLink(inv.token),inv.test_mode):invitationLink(inv.token));onMessage(type==='COPY_MESSAGE'?'Mensaje copiado con emojis y párrafos. Pégalo en WhatsApp.':'Enlace copiado.');
   }else{
    const inv=type==='WHATSAPP_OPENED'?(await workerApi<CinthiaDetail>('/api/cinthia/leads/'+row.id)).invitations.find(i=>i.id===row.invitation_id):await cinthiaAction(row.id,type,row.invitation_id||undefined);
    if(!inv)throw Error('CINTHIA_INVALID_STATE');
    if(type==='PREPARE'||type==='WHATSAPP_OPENED'){
     onShare({phone:row.phone,leadId:row.id,message:cinthiaMessage(row.full_name,invitationLink(inv.token),inv.test_mode),id:inv.id});
    }else onMessage('Envío confirmado manualmente.');
   }
  }catch(e){onMessage(getWorkerErrorMessage(e),true);}finally{setBusy(false);onChanged();}
 };
 const enabled=(preview||available)&&row.can_manage&&!busy,phone=!!contactPhone(row.phone);
 return <><div className="flex max-w-72 flex-wrap gap-2">
 {['NOT_SENT','EXPIRED'].includes(row.state)&&row.can_manage&&<button className={control} title={!preview&&!available?'Disponible al conectar Gemini':undefined} disabled={!enabled||!phone} onClick={()=>void action('PREPARE')}>{row.state==='EXPIRED'?'Nueva invitación':'Enviar evaluación'}</button>}
 {['PREPARED','PENDING'].includes(row.state)&&<>
 <button className={control} disabled={!enabled||!phone} onClick={()=>void action('WHATSAPP_OPENED')}>Ver / copiar mensaje</button>
 {enabled&&phone&&<a className={control} href={cinthiaChatUrl(row.phone)} target="_blank" rel="noopener noreferrer" onClick={()=>{void cinthiaAction(row.id,'WHATSAPP_OPENED',row.invitation_id!).then(onChanged).catch(e=>onMessage(getWorkerErrorMessage(e),true));}}>Abrir WhatsApp</a>}
 <button className={control} disabled={busy||(!preview&&!!row.test_mode)} onClick={()=>void action('COPY')}>Copiar enlace</button>
 <button className={control} disabled={busy||(!preview&&!!row.test_mode)} onClick={()=>void action('COPY_MESSAGE')}>Copiar mensaje</button>
 {row.state==='PREPARED'&&row.can_manage&&<button className={control} disabled={!enabled} onClick={()=>void action('SENT')}>Marcar como enviada</button>}
 </>}
 <button className={control} disabled={busy} onClick={onDetail}>{row.state==='COMPLETED'?'Ver resultado':'Ver detalle'}</button>
 </div></>;
}
