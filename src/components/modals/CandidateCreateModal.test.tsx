// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
import {CandidateCreateModal} from './CandidateCreateModal';
const m=vi.hoisted(()=>({add:vi.fn(),duplicate:vi.fn(()=>({isDuplicate:false})),open:vi.fn()}));
vi.mock('../../context/TalentContext',()=>({useTalent:()=>({addCandidate:m.add,checkDuplicateCandidate:m.duplicate,campaigns:[{id:'camp',companyId:'techcenter',title:'Campaña'}],scopedCampaigns:[{id:'camp'}],availableUsers:[{id:'u',name:'Reclutador'}],currentUser:{id:'u',name:'Reclutador',role:'RECLUTADOR'},openCandidate360:m.open})}));
vi.mock('../../services/supabase',()=>({supabaseAccessToken:vi.fn()}));
it('un error no bloquea reintentos ni borra datos y se ve junto al botón',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const close=vi.fn();m.add.mockResolvedValueOnce({success:false,message:'WORKER_REQUEST_TIMEOUT'}).mockResolvedValueOnce({success:true,candidate:{id:'new'}});
 try{await act(async()=>root.render(<CandidateCreateModal isOpen onClose={close}/>));
 for(const [placeholder,value] of [['Ej: Daniel Alejandro','Persona'],['Ej: Ramos Salazar','Prueba'],['Ej: 74829103','12345678'],['Ej: 25','25'],['Ej: 984 712 390','933984694']])await act(async()=>{const input=host.querySelector<HTMLInputElement>('[placeholder="'+placeholder+'"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.add).toHaveBeenCalledTimes(1);expect(host.querySelector('footer')!.textContent).toContain('No se pudo confirmar');expect(host.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);expect(host.querySelector<HTMLInputElement>('[placeholder="Ej: Daniel Alejandro"]')!.value).toBe('Persona');
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.add).toHaveBeenCalledTimes(2);expect(close).toHaveBeenCalled();expect(m.open).toHaveBeenCalledWith('new');
 }finally{await act(async()=>root.unmount());host.remove();}
});
