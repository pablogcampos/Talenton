import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
export function VoicebotLeadDialog({children,onClose,busy}:{children:ReactNode;onClose:()=>void;busy:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;dialog.showModal();document.body.style.overflow='hidden';return()=>{dialog.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
 return createPortal(<dialog ref={ref} aria-label="Detalle del lead" onCancel={e=>{e.preventDefault();if(!busy)onClose();}} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-3xl overflow-y-auto border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/15">{children}</dialog>,document.body);
}
