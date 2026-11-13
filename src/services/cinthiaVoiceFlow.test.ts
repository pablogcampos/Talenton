// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {cinthiaVoice} from './cinthiaVoice';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();sessionStorage.clear();});
async function fixture(){
 vi.stubEnv('VITE_ADMIN_API_URL','https://voice.test');const sent:any[]=[];let socket:any;const track={enabled:true,stop:vi.fn()};
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track]})}});
 class Audio{currentTime=0;destination={};audioWorklet={addModule:async()=>{}};resume=async()=>{};close=async()=>{};createMediaStreamSource(){return {connect(){},disconnect(){}};}createGain(){return {gain:{value:0},connect(){}};}}
 class Worklet{port={onmessage:null};connect(){}disconnect(){}}
 class Socket{readyState=1;bufferedAmount=0;onopen:any;onmessage:any;onclose:any;onerror:any;constructor(){socket=this;queueMicrotask(()=>this.onopen?.());}send(text:string){const d=JSON.parse(text);sent.push(d);if(d.type==='auth')queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({type:'ready',sessionId:'s',deadline:new Date(Date.now()+360000).toISOString()})}));}close(){this.readyState=3;this.onclose?.({code:1000});}}
 vi.stubGlobal('AudioContext',Audio);vi.stubGlobal('AudioWorkletNode',Worklet);vi.stubGlobal('WebSocket',Socket);vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:test';}static revokeObjectURL(){}});
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({sessionId:'s',deadline:new Date(Date.now()+360000).toISOString()})});vi.stubGlobal('fetch',fetcher);
 const events:any[]=[];const session=await cinthiaVoice.start('a'.repeat(64),'cinthia-voice-v1',e=>events.push(e));
 return {session,sent,events,fetcher,track,emit:(message:any)=>socket.onmessage({data:JSON.stringify(message)}),close:()=>socket.onclose({code:1000})};
}
it('silence pause disables microphone and never reconnects until requested',async()=>{
 vi.useFakeTimers();const f=await fixture();f.emit({type:'paused',reason:'SILENCE_TIMEOUT'});f.close();await vi.advanceTimersByTimeAsync(45000);
 expect(f.sent.filter(m=>m.type==='auth')).toHaveLength(1);expect(f.track.enabled).toBe(false);expect(f.events).toContainEqual({type:'state',state:'paused'});
 await f.session.reconnect();expect(f.fetcher).toHaveBeenCalledTimes(2);expect(f.track.enabled).toBe(true);expect(f.sent.filter(m=>m.type==='auth')).toHaveLength(2);f.session.close();
});
it('final answer auto-saves but completion requires the server receipt',async()=>{
 const f=await fixture();f.emit({type:'turnComplete',autoFinish:true});expect(f.sent).toContainEqual({type:'finish'});expect(f.events.some(e=>e.type==='saved')).toBe(false);
 f.emit({type:'saved',receiptId:'receipt-1'});expect(f.events).toContainEqual({type:'saved',receiptId:'receipt-1'});
});
