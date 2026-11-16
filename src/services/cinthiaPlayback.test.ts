import {describe,it,expect,vi} from 'vitest';
import {createCinthiaPlayback,rmsToMouth,smoothMouth} from './cinthiaPlayback';
describe('output envelope',()=>{
 it('smooths speech fluctuations without delaying interruption',()=>{
  let level=0;
  for(let i=0;i<12;i++)level=smoothMouth(level,.6,16);
  expect(level).toBeGreaterThan(.55);
  const falling=smoothMouth(level,.2,16);
  expect(falling).toBeGreaterThan(.4);
  expect(falling).toBeLessThan(level);
  expect(smoothMouth(falling,0,16)).toBe(0);
 });
 it('closes on silence and caps subtle opening',()=>{expect(rmsToMouth(.007)).toBe(0);expect(rmsToMouth(.04)).toBeLessThan(rmsToMouth(.09));expect(rmsToMouth(1)).toBe(1);expect(smoothMouth(.9,0,32)).toBe(0);expect(smoothMouth(0,1,32)).toBeGreaterThan(0);expect(smoothMouth(0,1,32)).toBeLessThan(1);});
 it('reads only running scheduled output and resets on interruption/disposal',()=>{let amplitude=.08;const analyser={fftSize:512,smoothingTimeConstant:0,connect:vi.fn(),disconnect:vi.fn(),getFloatTimeDomainData:(a:Float32Array)=>a.fill(amplitude)};const context={state:'running',destination:{},createAnalyser:()=>analyser};const meter=createCinthiaPlayback(context as any);expect(meter.read()).toBe(0);meter.setActive(true);expect(meter.read()).toBeGreaterThan(0);amplitude=0;expect(meter.read()).toBe(0);amplitude=.08;context.state='suspended';expect(meter.read()).toBe(0);context.state='running';meter.setActive(false);expect(meter.read()).toBe(0);meter.dispose();expect(analyser.disconnect).toHaveBeenCalledOnce();});
});
