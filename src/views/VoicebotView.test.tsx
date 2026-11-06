// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {VoicebotView} from './VoicebotView';
const api=vi.hoisted(()=>vi.fn());
vi.mock('../services/workerApi',()=>({workerApi:api,getWorkerErrorMessage:(e:Error)=>e.message}));
vi.mock('../services/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'recruiter'}}}})}}}));
let root:Root,host:HTMLDivElement;
const lead={id:'lead',external_id:'call-1',source:'bot',received_at:'2026-11-07T01:30:00Z',occurred_at:null,full_name:'Persona de prueba',phone:'999111222',workday:'Semifull',experience:'Dos años en ventas',interview_availability:'Turno tarde',interest:'Alto',transcript:'Quiero una entrevista',bot_notes:'Llamar mañana',payload:{extra:'Dato conservado'},status:'NUEVO',owner_auth_id:null,owner_name:null,management_notes:'',version:1};
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;api.mockReset();api.mockResolvedValue({items:[lead],total:1});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const click=async(text:string)=>{const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;await act(async()=>button.click());};
it('muestra datos originales y fecha peruana; tomar lead habilita la gestión personal',async()=>{
 await act(async()=>root.render(<VoicebotView/>));expect(host.textContent).toContain('6/11/26');
 await click('Ver detalle');for(const text of ['Dos años en ventas','Turno tarde','Quiero una entrevista','Dato conservado'])expect(host.textContent).toContain(text);
 api.mockImplementation(async(_path:string,init?:RequestInit)=>init?.method==='PATCH'?{...lead,owner_auth_id:'recruiter',owner_name:'Reclutador',status:'EN_GESTION',version:2}:{items:[lead],total:1});
 await click('Tomar lead');expect(host.textContent).toContain('Guardar gestión');expect(host.querySelector('textarea')).not.toBeNull();
});
it('muestra el conflicto de asignación y no habilita edición después de un fallo',async()=>{
 await act(async()=>root.render(<VoicebotView/>));api.mockRejectedValueOnce(new Error('El lead ya fue tomado'));
 await click('Tomar lead');expect(host.querySelector('[role="alert"]')?.textContent).toBe('El lead ya fue tomado');expect(host.querySelector('textarea')).toBeNull();
});
