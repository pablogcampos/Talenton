// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {OfferWorkdayAssignment} from './OfferWorkdayAssignment';
import {workerApi} from '../../services/workerApi';
vi.mock('../../services/workerApi',()=>({workerApi:vi.fn(),getWorkerErrorMessage:(e:Error)=>e.message}));
const plan={hash:'reviewed',participants:[
 {participantId:'1',name:'Full prueba',workday:'FULL_TIME',source:'Formulario',title:'Full',status:'READY'},
 {participantId:'2',name:'Sin jornada',workday:null,source:'Perfil del candidato',title:null,status:'MISSING_WORKDAY'},
 {participantId:'3',name:'Firma existente',workday:'SEMI_FULL',source:'Formulario',title:'Semi',status:'SIGNED'},
]};
afterEach(()=>vi.clearAllMocks());
describe('revisión y confirmación masiva',()=>{
 it('muestra coincidencias y pendientes y envía el hash revisado sin seleccionar candidatos',async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const saved=vi.fn();
  vi.mocked(workerApi).mockResolvedValueOnce(plan).mockResolvedValueOnce({...plan,assigned:1});
  await act(async()=>root.render(<OfferWorkdayAssignment companyId="techcenter" groupId="g" groups={[{id:'g',name:'Grupo',code:'CAP'}]} onAssigned={saved}/>));
  const buttons=()=>Array.from(host.querySelectorAll('button'));
  await act(async()=>buttons().find(b=>b.textContent==='Validar jornadas')!.click());
  expect(host.textContent).toContain('Fulltime');expect(host.textContent).toContain('Jornada ausente o no reconocida');expect(host.textContent).toContain('Firmada: se conserva');
  await act(async()=>buttons().find(b=>b.textContent?.startsWith('Asignar masivamente'))!.click());
  expect(workerApi).toHaveBeenLastCalledWith('/api/offers/assign-workdays',{method:'POST',body:JSON.stringify({groupId:'g',hash:'reviewed'})},'techcenter');
  expect(host.textContent).toContain('Propuestas generadas: 1');expect(saved).toHaveBeenCalledOnce();
  await act(async()=>root.unmount());host.remove();
 });
});
