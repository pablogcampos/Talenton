// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {PublicCaptureView} from './PublicCaptureView';
import {COMPANY_CAPTURE_FORM} from '../../shared/techCenterForm';
const mock=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../services/captureApi',()=>({publicCaptureApi:mock.api}));
vi.mock('../components/capture/CaptureFormFields',()=>({CaptureFormFields:()=>null}));
it('conserva el error tras renovar captcha y reutiliza requestId al reintentar',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 let options:any;
 (window as any).turnstile={render:(_el:any,o:any)=>{options=o;return 'widget';},reset:vi.fn(),remove:vi.fn()};
 const script=document.createElement('script');script.dataset.captureTurnstile='true';document.head.append(script);
 mock.api.mockResolvedValueOnce({formId:COMPANY_CAPTURE_FORM,companyName:'Techcenter',turnstileSiteKey:'test',securityReady:true,campaigns:[{id:'campaign',name:'Campaña',configuration:{minAge:18,maxAge:60,workdays:['Full time'],schedules:['Turno mañana'],modality:'Presencial'}}]}).mockRejectedValueOnce(new Error('Error de guardado')).mockResolvedValueOnce({ok:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<PublicCaptureView token={'a'.repeat(48)}/>));
  await act(async()=>{const select=host.querySelector('select')!;select.value='campaign';select.dispatchEvent(new Event('change',{bubbles:true}));});
  for(let i=0;i<4;i++)await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('Continuar'))!.click());
  await act(async()=>options.callback('captcha'));
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(host.textContent).toContain('Error de guardado');expect(host.textContent).not.toContain('fue registrada correctamente');
  await act(async()=>options.callback('renewed'));
  expect(host.textContent).toContain('Error de guardado');
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(mock.api.mock.calls[1][1].requestId).toBe(mock.api.mock.calls[2][1].requestId);
  expect(host.textContent).toContain('fue registrada correctamente');
 }finally{await act(async()=>root.unmount());host.remove();script.remove();delete (window as any).turnstile;}
});
