// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {PublicAttendanceView} from './PublicAttendanceView';
vi.mock('../services/workerApi',()=>({getWorkerErrorMessage:(e:Error)=>e.message}));
it('conserva DNI tras un error y confirma la asistencia sin repetir el formulario',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({group:'Grupo prueba',date:'2026-11-26',expiresAt:'2026-11-26T18:00:00Z'})).mockRejectedValueOnce(new Error('Conexión interrumpida')).mockResolvedValueOnce(Response.json({alreadyRecorded:true,status:'PRESENTE',markedAt:'2026-11-26T17:00:00Z'}));
 vi.stubGlobal('fetch',fetcher);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(<PublicAttendanceView token={'a'.repeat(64)}/>));
 const input=host.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'01888111');input.dispatchEvent(new Event('input',{bubbles:true}));});
 const submit=()=>act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 await submit();expect(host.textContent).toContain('Conexión interrumpida');expect(input.value).toBe('01888111');
 await submit();expect(host.textContent).toContain('Tu asistencia ya estaba registrada');expect(host.querySelector('form')).toBeNull();
 expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({dni:'01888111'});expect(fetcher.mock.calls[2][0]).not.toContain('01888111');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
