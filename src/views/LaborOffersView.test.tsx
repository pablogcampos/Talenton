// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
import {OffersPanel} from './LaborOffersView';
const mocks=vi.hoisted(()=>({api:vi.fn()}));vi.mock('../services/workerApi',()=>({workerApi:mocks.api,getWorkerErrorMessage:(e:Error)=>e.message}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
it('separates official, draft and hidden history and publishes the selected revision',async()=>{
 const catalog={canCreate:true,canAssign:false,campaigns:[{id:'campaign',name:'Campaign'}],groups:[],documents:[],templates:['PUBLISHED','DRAFT','REPLACED'].map((status,i)=>({id:String(i),title:status+' title',campaign_id:'campaign',content:'Content',status,revision:3,workday:'FULL_TIME',created_at:'2026-11-20T00:00:00Z'}))};
 mocks.api.mockImplementation(async(_url:string,opts:any)=>opts?.method==='POST'?{}:catalog);const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(<OffersPanel companyId="company"/>));expect(host.textContent).toContain('OFICIAL');expect(host.textContent).toContain('BORRADOR');expect(host.textContent).not.toContain('REPLACED title');
 expect([...host.querySelectorAll('button')].filter(b=>b.textContent==='Descargar oficial')).toHaveLength(1);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Publicar actualización')!.click());
 expect(mocks.api).toHaveBeenCalledWith('/api/offers/publish',expect.objectContaining({body:JSON.stringify({id:'1',revision:3})}),'company');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Ver historial de versiones reemplazadas')!.click());expect(host.textContent).toContain('REPLACED title');
 await act(async()=>root.unmount());confirm.mockRestore();
});
