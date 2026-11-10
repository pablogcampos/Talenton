import type {FormAnswers} from '../../shared/captureFormSchema';
export type CaptureDraft={answers:FormAnswers;step:number;requestId:string;revision:number|null;attachments:string[]};
const ttl=4*60*60*1000;
const key=(token:string)=>'talent:capture:draft:v1:'+token;
export function clearCaptureDraft(token:string){try{sessionStorage.removeItem(key(token));}catch{/* Storage may be disabled. */}}
export function readCaptureDraft(token:string):CaptureDraft|null{
 try{
  const raw=sessionStorage.getItem(key(token));if(!raw)return null;
  const d=JSON.parse(raw);
  if(!Number.isFinite(d.savedAt)||Date.now()-d.savedAt>ttl||d.savedAt>Date.now()||!Number.isInteger(d.step)||d.step<0||d.step>4||typeof d.requestId!=='string'||!d.answers||typeof d.answers!=='object'||Array.isArray(d.answers)||!Object.values(d.answers).every(v=>typeof v==='string'||Array.isArray(v)&&v.every(x=>typeof x==='string'))||!Array.isArray(d.attachments)||!d.attachments.every((v:unknown)=>typeof v==='string')){clearCaptureDraft(token);return null;}
  return d;
 }catch{clearCaptureDraft(token);return null;}
}
export function writeCaptureDraft(token:string,draft:CaptureDraft):boolean{
 try{sessionStorage.setItem(key(token),JSON.stringify({...draft,savedAt:Date.now()}));return true;}catch{return false;}
}
export function captureSecurityMessage(code?:string){
 const suffix=code&&/^\d+$/.test(code)?' Código: '+code+'.':'';
 if(code==='110200')return 'Este dominio no está autorizado para la verificación. Contacta al responsable del enlace.'+suffix;
 if(['110100','110110','400020','400070'].includes(code||''))return 'La verificación necesita una revisión de configuración. Contacta al responsable del enlace.'+suffix;
 return 'No se pudo completar la verificación de seguridad. Reinténtala sin recargar el formulario.'+suffix;
}
