import React,{useEffect,useRef,useState} from 'react';
import {EditorContent,useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {TableKit} from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import {CompanyLogo} from '../common/CompanyLogo';
import {encodeOfferHtml,initialOfferHtml,offerHtml} from './offerFormat';
import {OfferContent,OfferDownloadButton,type OfferDocument} from './OfferDocument';
import './offerDocument.css';
import {offerWorkdays,type OfferWorkday} from '../../../shared/offerWorkdays';

type Props={companyId:string;companyName:string;campaigns:{id:string;name:string}[];initial?:{campaignId:string;title:string;content:string;workday?:OfferWorkday};onClose:()=>void;onSave:(value:{campaignId:string;title:string;content:string;workday?:OfferWorkday})=>Promise<void>};
export default function OfferEditor({companyId,companyName,campaigns,initial,onClose,onSave}:Props){
 const [campaignId,setCampaignId]=useState(initial?.campaignId||campaigns[0]?.id||''),[title,setTitle]=useState(initial?.title||'Propuesta laboral'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<OfferDocument|null>(null);
 const [workday,setWorkday]=useState<OfferWorkday|''>(initial?.workday||'');
 const dirty=useRef(false),dialog=useRef<HTMLDivElement>(null);
 const editor=useEditor({extensions:[StarterKit.configure({link:false,code:false,codeBlock:false}),TableKit.configure({table:{resizable:false}}),TextAlign.configure({types:['heading','paragraph']})],content:initial?offerHtml(initial.content):initialOfferHtml(),onUpdate:()=>{dirty.current=true;},shouldRerenderOnTransaction:true,editorProps:{attributes:{'aria-label':'Contenido editable de la propuesta','role':'textbox','aria-multiline':'true'}}});
 const close=()=>{if(!busy&&(!dirty.current||window.confirm('Hay cambios sin guardar. ¿Deseas salir del editor?')))onClose();};
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.focus();
  const before=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',before);
  return()=>{document.body.style.overflow=overflow;window.removeEventListener('beforeunload',before);previous?.focus();};
 },[]);
 useEffect(()=>{editor?.setEditable(!busy);},[editor,busy]);
 const capture=()=>{
  if(!editor||!campaignId||!title.trim()||!workday)throw Error('Selecciona campaña y jornada, y escribe el título.');
  if(editor.getText().trim().length<20)throw Error('Completa el contenido de la propuesta (mínimo 20 caracteres).');
  return {campaignId,workday,title:title.trim(),content:encodeOfferHtml(editor.getHTML())};
 };
 const documentPreview=():OfferDocument=>{const v=capture();return {id:'VISTA PREVIA',snapshot:{name:'NOMBRE DEL POSTULANTE',company:companyName,campaign:campaigns.find(c=>c.id===campaignId)?.name||'',group:'Capacitación asignada',days:0,startDate:'',endDate:'',title:v.title,content:v.content,workday:v.workday}};};
 const save=async()=>{if(busy)return;setError('');try{const v=capture();if(/\[Completar[^\]]*\]/i.test(editor!.getText()))throw Error('Reemplaza los campos [Completar…] con las condiciones de la propuesta antes de guardar.');setBusy(true);await onSave(v);dirty.current=false;onClose();}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la propuesta.');}finally{setBusy(false);}};
 const tool=(label:string,action:()=>void,active=false)=><button type="button" aria-pressed={active} disabled={busy} onClick={action}>{label}</button>;
 return <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Editor de propuesta laboral" className="fixed inset-0 z-[110] flex flex-col bg-slate-100 text-[#143c55]" onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();preview?setPreview(null):close();}
  if(e.key==='Tab'){const nodes=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[contenteditable=true]');if(nodes?.length){const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
 }}>
 <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3 sm:px-8"><div><h2 className="text-lg font-bold">{initial?'Editar como nueva versión':'Nueva propuesta laboral'}</h2><p className="text-xs text-slate-500">Los documentos emitidos y firmados conservan su versión original.</p></div><div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={close}>Cerrar</button><button disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={()=>{try{setPreview(preview?null:documentPreview());setError('');}catch(e){setError((e as Error).message);}}}>{preview?'Volver a editar':'Vista previa'}</button><button disabled={busy||!editor} className="rounded-lg bg-[#143c55] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>void save()}>{busy?'Guardando…':'Guardar nueva versión'}</button></div></header>
 {error&&<p role="alert" className="bg-red-50 px-6 py-3 text-sm text-red-700">{error}</p>}
 {!preview&&<><div className="grid gap-3 border-b bg-white px-4 py-3 sm:grid-cols-3 sm:px-8"><label className="text-xs font-semibold">Campaña<select disabled={busy} className="mt-1 w-full rounded-lg border p-2 text-sm" value={campaignId} onChange={e=>{dirty.current=true;setCampaignId(e.target.value);}}><option value="">Selecciona una campaña</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-xs font-semibold">Jornada<select disabled={busy} className="mt-1 w-full rounded-lg border p-2 text-sm" value={workday} onChange={e=>{dirty.current=true;setWorkday(e.target.value as OfferWorkday);}}><option value="">Selecciona una jornada</option>{Object.entries(offerWorkdays).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold">Título del documento<input disabled={busy} maxLength={160} className="mt-1 w-full rounded-lg border p-2 text-sm" value={title} onChange={e=>{dirty.current=true;setTitle(e.target.value);}}/></label></div>
 {editor&&<div role="toolbar" aria-label="Formato de texto" className="offer-toolbar flex flex-wrap gap-1 border-b bg-white px-4 py-2 sm:px-8">
 <select disabled={busy} aria-label="Estilo de párrafo" value={editor.isActive('heading',{level:1})?'1':editor.isActive('heading',{level:2})?'2':editor.isActive('heading',{level:3})?'3':'0'} onChange={e=>{const level=Number(e.target.value);if(level)editor.chain().focus().toggleHeading({level:level as 1|2|3}).run();else editor.chain().focus().setParagraph().run();}}><option value="0">Texto normal</option><option value="1">Título 1</option><option value="2">Título 2</option><option value="3">Título 3</option></select>
 {tool('Negrita',()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}
 {tool('Cursiva',()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic'))}
 {tool('Subrayado',()=>editor.chain().focus().toggleUnderline().run(),editor.isActive('underline'))}
 {tool('Viñetas',()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList'))}
 {tool('Numeración',()=>editor.chain().focus().toggleOrderedList().run(),editor.isActive('orderedList'))}
 <select aria-label="Alineación" onChange={e=>editor.chain().focus().setTextAlign(e.target.value).run()} value={['left','center','right','justify'].find(a=>editor.isActive({textAlign:a}))||'left'}><option value="left">Izquierda</option><option value="center">Centrar</option><option value="right">Derecha</option><option value="justify">Justificar</option></select>
 {tool('Tabla',()=>editor.chain().focus().insertTable({rows:3,cols:2,withHeaderRow:true}).run())}
 {editor.isActive('table')&&<>{tool('+ Fila',()=>editor.chain().focus().addRowAfter().run())}{tool('+ Columna',()=>editor.chain().focus().addColumnAfter().run())}{tool('Quitar fila',()=>editor.chain().focus().deleteRow().run())}{tool('Quitar columna',()=>editor.chain().focus().deleteColumn().run())}{tool('Quitar tabla',()=>editor.chain().focus().deleteTable().run())}</>}
 {tool('Deshacer',()=>editor.chain().focus().undo().run())}{tool('Rehacer',()=>editor.chain().focus().redo().run())}
 <select aria-label="Insertar dato automático" value="" onChange={e=>{editor.chain().focus().insertContent('{{'+e.target.value+'}}').run();}}><option value="" disabled>Dato automático…</option>{['nombre','empresa','campaña','dias','inicio','fin','jornada'].map(v=><option key={v} value={v}>{v}</option>)}</select>
 </div>}</>}
 <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-8"><div className="mx-auto max-w-[840px]">
 {preview?<><div className="mb-3 flex justify-end"><OfferDownloadButton document={preview}/></div><OfferContent document={preview}/></>:<article className="offer-page min-h-[1000px] rounded-sm border bg-white p-6 shadow-lg sm:p-14"><header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b pb-6"><CompanyLogo companyId={companyId} companyName={companyName}/><div className="text-right"><p className="text-xs uppercase tracking-widest text-slate-500">{companyName}</p><p className="font-semibold">{campaigns.find(c=>c.id===campaignId)?.name||'Selecciona una campaña'}</p><p className="text-sm">{workday?offerWorkdays[workday]:'Selecciona una jornada'}</p></div></header><h1 className="mb-3 text-2xl font-bold">{title}</h1><p className="mb-8 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Dirigida a: <strong>NOMBRE DEL POSTULANTE</strong><br/>Se personalizará al asignarla a la capacitación.</p><div className="offer-rich"><EditorContent editor={editor}/></div></article>}
 </div></div>
 </div>;
}
