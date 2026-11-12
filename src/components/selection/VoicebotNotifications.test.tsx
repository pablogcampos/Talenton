// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {VoicebotNotifications} from './VoicebotNotifications';
const mocks=vi.hoisted(()=>({listener:null as any,start:vi.fn(),navigate:vi.fn(),remove:vi.fn()}));
vi.mock('../../context/TalentContext',()=>({useTalent:()=>({currentUser:{id:'user',role:'RECLUTADOR'},setActiveModule:mocks.navigate})}));
vi.mock('../../services/workerApi',()=>({workerApi:async()=>({items:[{id:'old',received_at:'2026-11-06T10:00:00Z'}]})}));
vi.mock('../../services/supabase',()=>({supabase:{channel:()=>{const channel={on:(_event:any,_filter:any,listener:any)=>{mocks.listener=listener;return channel;},subscribe:(fn:any)=>{fn('SUBSCRIBED');return channel;}};return channel;},removeChannel:mocks.remove}}));
it('no alerta por registros históricos y suena una sola vez por cada nuevo ID sin interruptor de audio',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal('AudioContext',class {state='running';currentTime=0;sampleRate=44100;destination={};createBuffer(_channels:number,size:number){return {getChannelData:()=>new Float32Array(size)};}createBufferSource(){return {buffer:null,connect:()=>{},disconnect:()=>{},start:mocks.start};}resume=async()=>{};close=async()=>{};createOscillator(){return {connect:()=>{},frequency:{value:0},start:mocks.start,stop:()=>{}};}createGain(){return {connect:()=>{},gain:{setValueAtTime:()=>{},exponentialRampToValueAtTime:()=>{}}};}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<VoicebotNotifications/>));expect(host.textContent).not.toContain('nuevos');expect(mocks.start).not.toHaveBeenCalled();
  expect(host.textContent).not.toMatch(/Silenciar|Activar sonido/);
  const event={eventType:'INSERT',new:{id:'new',received_at:'2026-11-06T11:00:00Z'}};
  await act(async()=>{mocks.listener(event);mocks.listener(event);});expect(host.textContent).toContain('1 nuevos');expect(mocks.start).toHaveBeenCalledTimes(1);
  await act(async()=>host.querySelector('button')!.click());expect(mocks.navigate).toHaveBeenCalledWith('SELECCION_VOICEBOT');expect(host.textContent).not.toContain('nuevos');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
 expect(mocks.remove).toHaveBeenCalled();
});
it('conserva la alerta pendiente hasta la primera interacción permitida por el navegador',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;mocks.start.mockClear();let unlocked=false;
 vi.stubGlobal('AudioContext',class {state='suspended';currentTime=0;sampleRate=44100;destination={};createBuffer(_channels:number,size:number){return {getChannelData:()=>new Float32Array(size)};}createBufferSource(){return {buffer:null,connect:()=>{},disconnect:()=>{},start:mocks.start};}resume=async()=>{if(unlocked)this.state='running';};close=async()=>{};createOscillator(){return {connect:()=>{},frequency:{value:0},start:mocks.start,stop:()=>{}};}createGain(){return {connect:()=>{},gain:{setValueAtTime:()=>{},exponentialRampToValueAtTime:()=>{}}};}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<VoicebotNotifications/>));
  await act(async()=>mocks.listener({eventType:'INSERT',new:{id:'late',received_at:'2026-11-06T09:59:59Z'}}));
  expect(host.textContent).toContain('1 nuevos');expect(mocks.start).not.toHaveBeenCalled();unlocked=true;
  await act(async()=>window.dispatchEvent(new Event('pointerdown')));expect(mocks.start).toHaveBeenCalledTimes(1);
  await act(async()=>window.dispatchEvent(new Event('pointerdown')));expect(mocks.start).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
