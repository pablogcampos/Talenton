import {useState} from 'react';
import {cinthiaMessageUrl} from '../../services/cinthia';
import {cinthiaControl as control,cinthiaPrimary as primary} from './CinthiaUI';
export function CinthiaShare({phone,message,onClose,onOpen}:{phone:string;message:string;onClose:()=>void;onOpen:()=>void}){
 const [notice,setNotice]=useState('');
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Enviar invitación por WhatsApp"><section className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 text-left shadow-xl">
 <h2 className="text-xl font-semibold">Enviar invitación por WhatsApp</h2><p className="my-3 text-sm">Abre WhatsApp para ir al chat del número registrado con este mensaje preparado. Revisa y envía. Si WhatsApp altera el formato, utiliza Copiar mensaje y pégalo.</p>
 <textarea autoFocus readOnly aria-label="Mensaje completo para WhatsApp" rows={14} value={message} className={control+' w-full whitespace-pre-wrap'} onFocus={e=>e.target.select()}/>
 {notice&&<p role="status" className="my-3 text-sm">{notice}</p>}<div className="mt-4 flex flex-wrap gap-3"><button className={primary} onClick={()=>void Promise.resolve().then(()=>navigator.clipboard.writeText(message)).then(()=>setNotice('Mensaje copiado. Abre el chat y pégalo.')).catch(()=>setNotice('Selecciona el texto de arriba y cópialo con Ctrl+C o la opción Copiar de tu dispositivo.'))}>Copiar mensaje</button><a className={control} onClick={onOpen} href={cinthiaMessageUrl(phone,message)} target="_blank" rel="noopener noreferrer">Abrir WhatsApp directamente</a><button className={control} onClick={onClose}>Cerrar</button></div></section></div>;
}

