import {it,expect} from 'vitest';import {CinthiaAudioRecorder} from '../src/cinthiaAudio';
const pcm=(n:number,value:number)=>{const b=new Uint8Array(n*2),v=new DataView(b.buffer);for(let i=0;i<n;i++)v.setInt16(i*2,value,true);return btoa(String.fromCharCode(...b));};
it('records distinct stereo voices, resamples output and discards unplayed output after interruption',async()=>{
 let time=1000;const parts:Uint8Array[]=[];const r=new CinthiaAudioRecorder(async b=>{parts.push(b);},()=>time);
 time=1100;r.add(pcm(1600,500),16000,0);r.add(pcm(4800,900),24000,1);
 time=1150;r.interrupt();time=1200;await r.flush();
 const v=new DataView(parts[0].buffer);expect(v.getUint16(22,true)).toBe(2);expect(v.getUint32(24,true)).toBe(16000);
 expect(v.getInt16(44+100*4,true)).toBe(500);expect(v.getInt16(44+1700*4+2,true)).toBe(900);expect(v.getInt16(44+2600*4+2,true)).toBe(0);
 time=1300;await r.flush();expect(parts).toHaveLength(2);
});
it('retains pending audio when persistence fails',async()=>{let time=1000,fail=true;const r=new CinthiaAudioRecorder(async()=>{if(fail)throw Error('storage');},()=>time);time=1100;r.add(pcm(1600,500),16000,0);await expect(r.flush()).rejects.toThrow('storage');fail=false;await expect(r.flush()).resolves.toBeUndefined();});
