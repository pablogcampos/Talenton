// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi,afterEach} from 'vitest';
import {VoicebotView} from '../../views/VoicebotView';
import {contactPhone,contactSla,operationalState,type VoicebotLead} from './voicebotWorkspace';
import {workerApi} from '../../services/workerApi';
vi.mock('../../context/TalentContext',()=>({useTalent:()=>({currentUser:{role:'RECLUTADOR',companyId:'tenant'}})}));
vi.mock('../../services/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'recruiter'}}}})}}}));
vi.mock('../../services/workerApi',()=>({workerApi:vi.fn(),getWorkerErrorMessage:(e:Error)=>e.message}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const lead={id:'lead',full_name:'Test lead',phone:'999111222',received_at:'2026-11-13T15:00:00Z',occurred_at:null,status:'EN_GESTION',owner_auth_id:'recruiter',owner_name:'Recruiter',history:[],payload:{},outcome:null,callback_at:null,management_locked_at:'2026-11-13T15:00:00Z',version:3} as unknown as VoicebotLead;
const config={contact_minutes:10,warning_minutes:8,version:1};
afterEach(()=>vi.clearAllMocks());
it('uses configured SLA thresholds and stops elapsed time at the first actual attempt',()=>{
 expect(contactSla(lead,config,Date.parse(lead.received_at)+479000).tone).toContain('emerald');
 expect(contactSla(lead,config,Date.parse(lead.received_at)+480000).tone).toContain('amber');
 expect(contactSla(lead,config,Date.parse(lead.received_at)+601000).tone).toContain('red');
 expect(contactSla({...lead,first_contact_at:'2026-11-13T15:03:00Z'},config,Date.parse(lead.received_at)+999000).seconds).toBe(180);
 expect(operationalState({...lead,candidate_id:'c'})).toBe('CONVERTIDO');
 expect(operationalState({...lead,outcome:'NO_APTO',status:'CONTACTADO'})).toBe('DESCARTADO');
});
it('normalizes phone actions without sending messages',()=>{
 expect(contactPhone('999 111 222')).toBe('51999111222');expect(contactPhone('+51 999-111-222')).toBe('51999111222');expect(contactPhone('sin teléfono')).toBeNull();
});
it('keeps inbox position, opens a drawer, allows a new attempt after saved history and reuses workspace tabs',async()=>{
 vi.mocked(workerApi).mockImplementation(async(path:string)=>path.includes('assignees')?{canAssign:false,items:[]}:{items:[lead],total:1,counts:{mine:1,unassigned:0,followups:0,all:1},metrics:{total:1,minePending:1,overSla:0,convertedToday:0},config,canAssign:false,canConfigure:false,campaigns:[],recruiters:[],serverTime:new Date().toISOString()} as any);
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};HTMLElement.prototype.scrollIntoView=vi.fn();
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(<VoicebotView/>));
 expect(vi.mocked(workerApi).mock.calls[0][0]).toContain('tab=mine');
 const open=Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Gestionar')!;
 open.focus();await act(async()=>open.click());const dialog=document.querySelector('dialog')!;
 expect(dialog.open).toBe(true);expect(dialog.className).toContain('right-0');expect(host.querySelector('table')).not.toBeNull();
 expect(dialog.querySelector('fieldset')?.disabled).toBe(false);
 expect(dialog.querySelector('a[href="tel:+51999111222"]')).not.toBeNull();
 expect(dialog.querySelector('a[href="https://wa.me/51999111222"]')).not.toBeNull();
 const schedule=Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Agendar')!;
 await act(async()=>schedule.click());expect(dialog.textContent).toContain('sin registrar contacto');
 expect(vi.mocked(workerApi).mock.calls.some(([,options])=>options?.method==='POST')).toBe(false);
 await act(async()=>Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Cerrar')!.click());
 expect(document.querySelector('dialog')).toBeNull();expect(document.activeElement).toBe(open);
 await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.startsWith('Seguimientos'))!.click());
 expect(vi.mocked(workerApi).mock.calls.at(-1)?.[0]).toContain('tab=followups');
 }finally{await act(async()=>root.unmount());host.remove();}
});
