// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {PublicOfferView} from './PublicOfferView';
vi.mock('../components/selection/OfferDocument',()=>({
 OfferContent:({document:d}:any)=><article>{d.snapshot.name} · {d.snapshot.workday}</article>,
 OfferDownloadButton:()=> <button>Descargar PDF</button>,
}));
afterEach(()=>{vi.unstubAllGlobals();});
it('pide DNI antes de mostrar datos y limpia la propuesta al consultar otra persona',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({company:'Techcenter',group:'Grupo piloto'}))
 .mockResolvedValueOnce(Response.json({id:'d',snapshot:{name:'Participante prueba',workday:'SEMI_FULL'},contentHash:'h'}))
 .mockResolvedValueOnce(Response.json({message:'OFFER_LOOKUP_NOT_FOUND'},{status:400}));
 vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<PublicOfferView token={'a'.repeat(64)} groupLink/>));
 expect(host.textContent).toContain('DNI del participante');
 expect(host.textContent).not.toContain('Participante prueba');
 const input=()=>host.querySelector('input')!;
 const enter=async(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}));});
 await enter('12345678');
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(host.textContent).toContain('Participante prueba · SEMI_FULL');
 expect(host.textContent).not.toContain('Confirma tu DNI');
 expect(fetcher.mock.calls[1][0]).toContain('/api/public/offers/group/');
 expect(fetcher.mock.calls[1][0]).not.toContain('12345678');
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({action:'lookup',dni:'12345678'});
 await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Consultar otro DNI')!.click());
 expect(host.textContent).not.toContain('Participante prueba');expect(input().value).toBe('');
 await enter('87654321');
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(host.textContent).toContain('No encontramos una propuesta asignada');
 expect(host.textContent).not.toContain('Participante prueba');
 await act(async()=>root.unmount());host.remove();
});
