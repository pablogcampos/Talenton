// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,afterEach} from 'vitest';
import {cinthiaWhatsapp} from '../../services/cinthia';
import {cinthiaVoice} from '../../services/cinthiaVoice';
import {PublicCinthiaView} from '../../views/PublicCinthiaView';
import {CinthiaView} from '../../views/CinthiaView';
import {CinthiaRowActions} from './CinthiaRowActions';
const mock=vi.hoisted(()=>({api:vi.fn(),pub:vi.fn(),navigate:vi.fn()}));
vi.mock('../../services/workerApi',()=>({workerApi:mock.api,getWorkerErrorMessage:(e:Error)=>e.message,WorkerApiError:class extends Error{constructor(_status:number,message:string){super(message);}}}));
vi.mock('../../context/TalentContext',()=>({useTalent:()=>({setActiveModule:mock.navigate})}));
vi.mock('../../services/cinthia',async original=>({...await original<typeof import('../../services/cinthia')>(),publicCinthia:mock.pub}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{vi.clearAllMocks();vi.restoreAllMocks();});
it('individual WhatsApp link uses normalized phone and complete encoded message; rejects missing phone',()=>{
 const u=new URL(cinthiaWhatsapp('999 111 222','María','https://example.test/cinthia/'+'a'.repeat(64)));
 expect(u.hostname).toBe('wa.me');expect(u.pathname).toBe('/51999111222');expect(u.searchParams.get('text')).toContain('Hola, María.');expect(u.searchParams.get('text')).toContain('*Ingresa aquí para comenzar:*');expect(()=>cinthiaWhatsapp('','x','link')).toThrow('CINTHIA_PHONE_REQUIRED');
});
it('portal never starts unavailable voice, asks for no microphone, and never displays false completion',async()=>{
 mock.pub.mockResolvedValue({status:'PENDING',expires_at:'2026-12-01',completed_at:null,serviceAvailable:false,test_mode:false});
 const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
 try{await act(async()=>root.render(<PublicCinthiaView token={'a'.repeat(64)}/>));const start=[...host.querySelectorAll('button')].find(b=>b.textContent==='Comenzar entrevista')!;expect(start.disabled).toBe(true);expect(host.textContent).not.toContain('¡Entrevista completada!');await expect(cinthiaVoice.start('token','v1',()=>{})).rejects.toThrow('CINTHIA_CONSENT_REQUIRED');}
 finally{await act(async()=>root.unmount());host.remove();}
});
it('expired token shows expiry, not start or microphone controls',async()=>{
 mock.pub.mockResolvedValue({status:'EXPIRED',expires_at:'2026-12-01',completed_at:null});
 const host=document.createElement('div'),root=createRoot(host);try{await act(async()=>root.render(<PublicCinthiaView token={'a'.repeat(64)}/>));expect(host.textContent).toContain('Tu enlace ha expirado');expect(host.textContent).not.toContain('Comenzar entrevista');}finally{await act(async()=>root.unmount());}
});
it('completion only appears with a server completion timestamp',async()=>{
 const host=document.createElement('div'),root=createRoot(host);mock.pub.mockResolvedValue({status:'COMPLETED',completed_at:'2026-11-13T12:00:00Z'});
 try{await act(async()=>root.render(<PublicCinthiaView token={'a'.repeat(64)}/>));expect(host.textContent).toContain('¡Entrevista completada!');}finally{await act(async()=>root.unmount());}
});
it('inbox starts with all leads, no campaign filters, receipt timestamps, and guarded invitation detail',async()=>{
 mock.api.mockResolvedValue({items:[{id:'1',full_name:'Prueba CI',phone:'999111222',received_at:'2026-11-13T16:00:00Z',state:'NOT_SENT',can_manage:true}],total:1,counts:{NOT_SENT:1},metrics:{available:1,pending:0,active:0,completed:0},canFilterOwner:false,recruiters:[],serverTime:'2026-11-13T16:00:00Z',preview:false});
 const host=document.createElement('div'),root=createRoot(host);try{await act(async()=>root.render(<CinthiaView/>));expect(mock.api.mock.calls[0][0]).toContain('state=&page=0');expect(host.textContent).toContain('Más recientes primero');expect(host.querySelector('time')?.dateTime).toBe('2026-11-13T16:00:00Z');expect(host.textContent).not.toContain('Campaña');expect(host.textContent).toContain('están deshabilitados');}finally{await act(async()=>root.unmount());}
});
it('blocked WhatsApp popup never records opening or confirms sending',async()=>{
 const open=vi.spyOn(window,'open').mockReturnValue(null),message=vi.fn();
 const host=document.createElement('div'),root=createRoot(host);
 const row={id:'lead',state:'PREPARED',can_manage:true,invitation_id:'invitation',phone:'999111222'} as any;
 try{await act(async()=>root.render(<CinthiaRowActions row={row} preview onDetail={()=>{}} onMessage={message} onChanged={()=>{}}/>));await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Abrir WhatsApp')!.click());expect(open).toHaveBeenCalled();expect(mock.api).not.toHaveBeenCalled();expect(message).toHaveBeenCalledWith(expect.stringContaining('No se registró'));}finally{await act(async()=>root.unmount());}
});
it('preparing opens individual WhatsApp and records opening, never confirms sending automatically',async()=>{
 const replace=vi.fn();vi.spyOn(window,'open').mockReturnValue({opener:null,location:{replace},close:vi.fn()} as any);
 mock.api.mockResolvedValue({id:'invitation',token:'a'.repeat(64),test_mode:true,status:'PREPARED'});
 const host=document.createElement('div'),root=createRoot(host),row={id:'lead',state:'NOT_SENT',can_manage:true,phone:'999111222',full_name:'Prueba'} as any;
 try{await act(async()=>root.render(<CinthiaRowActions row={row} preview onDetail={()=>{}} onMessage={()=>{}} onChanged={()=>{}}/>));await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Enviar evaluación')!.click());expect(replace).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/51999111222?text='));expect(mock.api.mock.calls.map(c=>JSON.parse(c[1].body).action)).toEqual(['PREPARE','WHATSAPP_OPENED']);}finally{await act(async()=>root.unmount());}
});
