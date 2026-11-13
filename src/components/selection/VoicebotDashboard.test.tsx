// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {VoicebotLeadDialog} from './VoicebotLeadDialog';
import {VoicebotDashboard} from './VoicebotDashboard';
import {workerApi} from '../../services/workerApi';
vi.mock('../../services/workerApi',()=>({workerApi:vi.fn(),getWorkerErrorMessage:()=> 'Error de conexión'}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
it('opens details as a modal, protects pending saves and restores focus',async()=>{
 const opener=document.createElement('button');document.body.append(opener);opener.focus();
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 HTMLDialogElement.prototype.close=function(){this.open=false;};
 const host=document.createElement('div'),root=createRoot(host),onClose=vi.fn();
 try{
  await act(async()=>root.render(<VoicebotLeadDialog onClose={onClose} busy={true}><p>Información completa</p></VoicebotLeadDialog>));
  const dialog=document.querySelector('dialog')!;
  expect(dialog.open).toBe(true);expect(host.textContent).toBe('');expect(dialog.textContent).toContain('Información completa');
  expect(document.body.style.overflow).toBe('hidden');
  await act(async()=>dialog.dispatchEvent(new Event('cancel',{cancelable:true})));expect(onClose).not.toHaveBeenCalled();
  await act(async()=>root.render(<VoicebotLeadDialog onClose={onClose} busy={false}><p>Información completa</p></VoicebotLeadDialog>));
  await act(async()=>dialog.dispatchEvent(new Event('cancel',{cancelable:true})));expect(onClose).toHaveBeenCalledOnce();
 }finally{await act(async()=>root.unmount());expect(document.body.style.overflow).toBe('');expect(document.activeElement).toBe(opener);opener.remove();}
});
it('dashboard shows server totals, SLA, null averages and retains metrics on refresh failure',async()=>{
 vi.mocked(workerApi).mockResolvedValue({summary:{total:152,assigned_measured:4,within_sla:3,avg_assignment_seconds:null},recruiters:[],generatedAt:'2026-11-12T17:00:00Z',slaMinutes:10});
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(<VoicebotDashboard/>));
  expect(host.textContent).toContain('152');expect(host.textContent).toContain('75.0%');expect(host.textContent).toContain('Sin datos');
  expect(host.textContent).toContain('SLA de asignación: 10 minutos');
  vi.mocked(workerApi).mockRejectedValueOnce(new Error('Network'));
  await act(async()=>window.dispatchEvent(new Event('talent:voicebot-changed')));
  expect(host.textContent).toContain('últimos indicadores');expect(host.textContent).toContain('152');
 }finally{await act(async()=>root.unmount());}
});
