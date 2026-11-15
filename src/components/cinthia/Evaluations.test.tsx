// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,afterEach} from 'vitest';
import {EvaluationWorkspace} from './EvaluationWorkspace';
import {EvaluationEditor} from './EvaluationEditor';
import {SubjectEvaluations} from './SubjectEvaluations';
import {newEvaluation} from '../../../shared/cinthiaEvaluation';
const api=vi.hoisted(()=>vi.fn());
vi.mock('../../services/workerApi',()=>({workerApi:api,getWorkerErrorMessage:(e:Error)=>e.message,WorkerApiError:class extends Error{}}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const config={...newEvaluation(),name:'Formador',companyId:'company',positions:['Formador'],objective:'Evaluación pedagógica'};
const catalog={companies:[{id:'company',name:'Empresa QA',canWrite:true}],campaigns:[],bank:[],items:[{id:'evaluation',campaign_id:null,company_id:'company',name:'Formador',status:'PUBLISHED',updated_at:'2026-11-15',versions:[{id:'version',number:1,revision:1,published_at:'2026-11-15',config}]}]};
afterEach(()=>{vi.resetAllMocks();});
it('central view manages evaluations, not another lead inbox, and exposes four sections',async()=>{
 api.mockImplementation(async p=>p.includes('/catalog')?catalog:p.includes('/analytics')?{distribution:[],audit:[]}:[]);
 const host=document.createElement('div'),root=createRoot(host);try{await act(async()=>root.render(<EvaluationWorkspace/>));expect(host.textContent).toContain('Mis evaluaciones');expect(host.textContent).toContain('Banco de competencias y preguntas');expect(host.textContent).not.toContain('Leads disponibles');expect(api.mock.calls.some(([p])=>p.startsWith('/api/cinthia?'))).toBe(false);await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Crear evaluación')!.click());expect(host.textContent).toContain('Guardar borrador');expect(host.textContent).toContain('6. Revisión');}finally{await act(async()=>root.unmount());}
});
it('wizard preserves incomplete drafts and reports weights and rubric requirements before publication',async()=>{
 const save=vi.fn(),host=document.createElement('div'),root=createRoot(host);try{await act(async()=>root.render(<EvaluationEditor initial={config} catalog={catalog} onSave={save} onClose={()=>{}} busy={false}/>));await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='6. Revisión')!.click());expect(host.textContent).toContain('Los pesos deben sumar 100%');await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Guardar borrador')!.click());expect(save).toHaveBeenCalledWith(config);}finally{await act(async()=>root.unmount());}
});
it('candidate assignment uses original person identifier and opens personalized native WhatsApp invitation',async()=>{
 api.mockImplementation(async(p,o)=>p.endsWith('/catalog')?catalog:p.includes('/subject')?[]:o?.method==='POST'?{id:'inv',token:'a'.repeat(64),status:'PREPARED',evaluation_version_id:'version'}:null);
 const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
 try{await act(async()=>root.render(<SubjectEvaluations personId="staff" companyId="company" name="María" phone="999111222"/>));const select=host.querySelector('select')!;await act(async()=>{select.value='version';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Asignar evaluación')!.click());const call=api.mock.calls.find(([p])=>p==='/api/cinthia/assign');expect(JSON.parse(call![1].body)).toMatchObject({person:'staff',version:'version'});expect(host.querySelector('textarea')?.value).toContain('María');const url=new URL(host.querySelector('a')!.href);expect(url.protocol).toBe('whatsapp:');expect(url.searchParams.get('phone')).toBe('51999111222');}finally{await act(async()=>root.unmount());host.remove();}
});
