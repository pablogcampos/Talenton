// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach} from 'vitest';
import {PublicCaptureView} from './PublicCaptureView';
import {COMPANY_CAPTURE_FORM} from '../../shared/techCenterForm';
beforeEach(()=>{sessionStorage.clear();mock.api.mockReset();});
const mock=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../services/captureApi',()=>({publicCaptureApi:mock.api}));
vi.mock('../components/capture/CaptureFormFields',()=>({CaptureFormFields:()=>null}));
it('conserva el error tras renovar captcha y reutiliza requestId al reintentar',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 let options:any;
 (window as any).turnstile={render:(_el:any,o:any)=>{options=o;return 'widget';},reset:vi.fn(),remove:vi.fn()};
 const script=document.createElement('script');script.dataset.captureTurnstile='true';document.head.append(script);
 mock.api.mockResolvedValueOnce({formId:COMPANY_CAPTURE_FORM,companyName:'Techcenter',turnstileSiteKey:'test',securityReady:true,campaigns:[{id:'campaign',name:'Campaña',configuration:{minAge:18,maxAge:60,workdays:['Full time'],schedules:['Turno mañana'],modality:'Presencial'}}]}).mockRejectedValueOnce(new Error('Error de guardado')).mockResolvedValueOnce({ok:true});
 sessionStorage.setItem('talent:capture:draft:v1:'+'a'.repeat(48),JSON.stringify({answers:{preferredCampaign:'campaign',fullName:'Persona Prueba',documentType:'DNI',documentNumber:'12345678',phone:'933984694',email:'test@example.com',district:'Lima'},step:0,requestId:'same-request',revision:null,attachments:[],savedAt:Date.now()}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<PublicCaptureView token={'a'.repeat(48)}/>));
  expect(host.querySelector('select')!.value).toBe('campaign');
  for(let i=0;i<4;i++)await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('Continuar'))!.click());
  await act(async()=>options['error-callback']('110200'));
  expect(host.textContent).toContain('dominio no está autorizado');
  await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Reintentar verificación')!.click());
  expect(host.textContent).not.toContain('dominio no está autorizado');
  await act(async()=>options.callback('captcha'));
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(host.textContent).toContain('Error de guardado');expect(host.textContent).not.toContain('fue registrada correctamente');
  await act(async()=>options.callback('renewed'));
  expect(host.textContent).toContain('Error de guardado');
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(mock.api.mock.calls[1][1].requestId).toBe(mock.api.mock.calls[2][1].requestId);
  expect(host.textContent).toContain('fue registrada correctamente');
  expect(sessionStorage.getItem('talent:capture:draft:v1:'+'a'.repeat(48))).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();script.remove();delete (window as any).turnstile;}
});

it('recupera respuestas y paso tras recargar sin reutilizar captcha ni autorizaciones',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const token='b'.repeat(48),key='talent:capture:draft:v1:'+token;
 sessionStorage.setItem(key,JSON.stringify({answers:{preferredCampaign:'campaign',fullName:'Nombre conservado',availability:'Turno tarde'},step:4,requestId:'persisted-request',revision:null,attachments:['cv.pdf'],savedAt:Date.now()}));
 const config={formId:COMPANY_CAPTURE_FORM,companyName:'Techcenter',turnstileSiteKey:'test',securityReady:true,campaigns:[{id:'campaign',name:'Campaña',configuration:{minAge:18,maxAge:60,workdays:['Full time'],schedules:['Turno tarde'],modality:'Presencial'}}]};
 mock.api.mockResolvedValue(config);
 const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
 try{
  await act(async()=>root.render(<PublicCaptureView token={token}/>));
  expect(host.textContent).toContain('Recuperamos tus respuestas');expect(host.textContent).toContain('cv.pdf');expect(host.textContent).toContain('Paso 5 de 5');
  expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false);
  expect(host.querySelector<HTMLButtonElement>('button:not([type])')!.disabled).toBe(true);
  await act(async()=>root.unmount());root=createRoot(host);
  await act(async()=>root.render(<PublicCaptureView token={token}/>));
  const saved=JSON.parse(sessionStorage.getItem(key)!);
  expect(saved.answers.fullName).toBe('Nombre conservado');expect(saved.answers.availability).toBe('Turno tarde');expect(saved.requestId).toBe('persisted-request');
 }finally{await act(async()=>root.unmount());host.remove();document.querySelector('script[data-capture-turnstile]')?.remove();}
});
