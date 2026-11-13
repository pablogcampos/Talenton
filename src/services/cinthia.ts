import {workerApi,WorkerApiError} from './workerApi';
import {contactPhone,type VoicebotLead} from '../components/selection/voicebotWorkspace';
export type CinthiaStatus='NOT_SENT'|'PREPARED'|'PENDING'|'IN_PROGRESS'|'COMPLETED'|'EXPIRED'|'CANCELLED';
export const cinthiaLabels:Record<CinthiaStatus,string>={NOT_SENT:'No enviada',PREPARED:'Invitación preparada',PENDING:'Pendiente',IN_PROGRESS:'En proceso',COMPLETED:'Completada',EXPIRED:'Expirada',CANCELLED:'Cancelada'};
export type Invitation={id:string;token:string;status:CinthiaStatus;test_mode:boolean;created_at:string;expires_at:string;updated_at:string;sent_at:string|null;started_at:string|null;completed_at:string|null;prepared_by:string;prepared_name?:string;sent_name?:string;sent_by:string|null;transcript_ref:string|null;result_ref:string|null};
export type CinthiaRow=Pick<VoicebotLead,'id'|'full_name'|'phone'|'received_at'|'owner_auth_id'|'owner_name'>&{state:CinthiaStatus;updated_at:string|null;can_manage:boolean;invitation_id:string|null;test_mode:boolean|null};
export type CinthiaWorkspace={items:CinthiaRow[];total:number;counts:Partial<Record<CinthiaStatus,number>>|null;metrics:Record<string,number>;canFilterOwner:boolean;recruiters:{id:string;name:string}[];serverTime:string;serviceAvailable:boolean;preview:boolean};
export type CinthiaDetail={sessions?:{id:string;state:string;startedAt:string|null;completedAt:string|null;durationSeconds:number|null;model:string;transcript:import('./cinthiaVoice').VoiceSegment[];errors:{at:string;code:string}[]}[];lead:VoicebotLead;invitations:Invitation[];events:{id:string;invitation_id:string;actor_id:string|null;actor_name?:string;action:string;created_at:string}[];can_manage:boolean};
export type PublicInterview={status:CinthiaStatus;expires_at:string;completed_at:string|null;test_mode:boolean;serviceAvailable:boolean;consentVersion?:string};
export const invitationLink=(token:string)=>`${window.location.origin}/cinthia/${token}`;
export function cinthiaWhatsapp(phone:string,name:string,link:string,test=false){
 const number=contactPhone(phone);if(!number)throw Error('CINTHIA_PHONE_REQUIRED');
 const message=`${test?'[PRUEBA CONTROLADA — no enviar a postulantes]\n\n':''}Hola${name.trim()?`, ${name.trim()}`:''}.\n\nTe contactamos del equipo de Selección.\n\nQueremos invitarte a realizar una breve entrevista virtual con *CinthIA*, nuestra asistente de inteligencia artificial.\n\nLa entrevista dura aproximadamente 5 minutos y puedes realizarla desde tu celular.\n\n*Ingresa aquí para comenzar:*\n${link}\n\nTe recomendamos estar en un ambiente tranquilo y contar con una conexión estable a internet.`;
 return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
export const cinthiaAction=(lead:string,action:string,invitationId?:string)=>workerApi<Invitation>(`/api/cinthia/leads/${lead}`,{method:'POST',body:JSON.stringify({action,invitationId})});
export async function publicCinthia(token:string,signal?:AbortSignal):Promise<PublicInterview>{
 const base=(import.meta.env.VITE_ADMIN_API_URL||import.meta.env.VITE_WORKER_API_URL)?.replace(/\/$/,'');
 if(!base)throw Error('SUPABASE_API_NOT_CONFIGURED');
 const response=await fetch(`${base}/api/public/cinthia/${token}`,{signal,cache:'no-store',referrerPolicy:'no-referrer'});
 const data=await response.json();if(!response.ok)throw new WorkerApiError(response.status,data.message);return data;
}
