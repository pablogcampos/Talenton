// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {VoicebotNotifications} from './VoicebotNotifications';
const mocks=vi.hoisted(()=>({listener:null as any,start:vi.fn(),navigate:vi.fn(),remove:vi.fn()}));
vi.mock('../../context/TalentContext',()=>({useTalent:()=>({currentUser:{id:'user',role:'RECLUTADOR'},setActiveModule:mocks.navigate})}));
vi.mock('../../services/workerApi',()=>({workerApi:async()=>({items:[{id:'old',received_at:'2026-11-06T10:00:00Z'}]})}));
vi.mock('../../services/supabase',()=>({supabase:{channel:()=>{const channel={on:(_event:any,_filter:any,listener:any)=>{mocks.listener=listener;return channel;},subscribe:(fn:any)=>{fn('SUBSCRIBED');return channel;}};return channel;},removeChannel:mocks.remove}}));
it('no alerta por registros históricos y suena una sola vez por cada nuevo ID después de activar audio',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal('AudioContext',class {state='running';currentTime=0;destination={};resume=async()=>{};close=async()=>{};createOscillator(){return {connect:()=>{},frequency:{value:0},start:mocks.start,stop:()=>{}};}createGain(){return {connect:()=>{},gain:{setValueAtTime:()=>{},exponentialRampToValueAtTime:()=>{}}};}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<VoicebotNotifications/>));expect(host.textContent).not.toContain('nuevos');expect(mocks.start).not.toHaveBeenCalled();
  await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Activar sonido')!.click());
  const event={eventType:'INSERT',new:{id:'new',received_at:'2026-11-06T11:00:00Z'}};
  await act(async()=>{mocks.listener(event);mocks.listener(event);});expect(host.textContent).toContain('1 nuevos');expect(mocks.start).toHaveBeenCalledTimes(1);
  await act(async()=>host.querySelector('button')!.click());expect(mocks.navigate).toHaveBeenCalledWith('SELECCION_VOICEBOT');expect(host.textContent).not.toContain('nuevos');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
 expect(mocks.remove).toHaveBeenCalled();
});
