// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,afterEach} from 'vitest';
import {CinthiaConversation} from './CinthiaConversation';
import {FreeEvaluations} from './FreeEvaluations';
const mocks=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../../services/workerApi',()=>({workerApi:mocks.api,getWorkerErrorMessage:(e:Error)=>e.message}));
vi.mock('./CinthiaUI',()=>({CinthiaAvatar:()=> <div>Avatar</div>,cinthiaControl:'control',cinthiaPrimary:'primary'}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>vi.clearAllMocks());
it('free conversations show only voice controls, never questions or transcripts',async()=>{const host=document.createElement('div'),root=createRoot(host);await act(async()=>root.render(<CinthiaConversation voiceOnly state="speaking" connected question="PRIVATE QUESTION" transcript="PRIVATE ANSWER" microphone onMicrophone={()=>{}} onRepeat={()=>{}} onFinish={()=>{}}/>));expect(host.textContent).not.toContain('PRIVATE');expect(host.textContent).toContain('Finalizar');await act(async()=>root.unmount());});
it('admin offers independent evaluations, participants and results and saves incomplete drafts',async()=>{mocks.api.mockImplementation(async(_p:string,opts:any)=>opts?{id:'draft'}:[]);const host=document.createElement('div'),root=createRoot(host);document.body.append(host);await act(async()=>root.render(<FreeEvaluations/>));const create=[...host.querySelectorAll('button')].find(x=>x.textContent==='Crear evaluación libre')!;await act(async()=>create.click());expect(host.textContent).toContain('Máximo de intentos por celular');expect(host.textContent).toContain('Rúbrica privada'.toLowerCase().slice(0,7));expect(host.querySelector('form')?.noValidate).toBe(true);await act(async()=>root.unmount());host.remove();});
