import {useEffect,useRef} from 'react';
import original from '../../assets/cinthia/cinthia-avatar-512.webp';
import expressions from '../../assets/cinthia/cinthia-facial-expressions.webp';
import {smoothMouth} from '../../services/cinthiaPlayback';
import './cinthiaFace.css';

export function CinthiaFace({motion=true,readMouth}:{motion?:boolean;readMouth?:()=>number}){
 const host=useRef<HTMLDivElement>(null),reader=useRef(readMouth);reader.current=readMouth;
 useEffect(()=>{
  const element=host.current!;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let timer:ReturnType<typeof setTimeout>,frame=0,animation:Animation|undefined,dead=false,level=0,last=0;
  const eyes=element.querySelector<HTMLElement>('.cinthia-eyes')!;
  const reset=()=>{clearTimeout(timer);cancelAnimationFrame(frame);animation?.cancel();level=0;element.style.setProperty('--mouth','0');};
  const allowed=()=>motion&&!reduced?.matches&&!document.hidden&&!dead;
  const schedule=()=>{timer=setTimeout(()=>{
   if(!allowed())return;
   const duration=120+Math.random()*80;
   const blink=()=>eyes.animate([{opacity:0,offset:0},{opacity:1,offset:.42},{opacity:1,offset:.58},{opacity:0,offset:1}],{duration,easing:'ease-in-out'});
   animation=blink();
   animation.onfinish=()=>{if(!allowed())return;if(Math.random()<.12){timer=setTimeout(()=>{if(!allowed())return;animation=blink();animation.onfinish=schedule;},90);}else schedule();};
  },3000+Math.random()*4000);};
  const tick=(now:number)=>{if(!allowed())return;if(now-last>=32){level=smoothMouth(level,reader.current?.()||0,now-last);element.style.setProperty('--mouth',level.toFixed(3));last=now;}frame=requestAnimationFrame(tick);};
  const restart=()=>{reset();if(allowed()){last=performance.now();schedule();frame=requestAnimationFrame(tick);}};
  reduced?.addEventListener('change',restart);document.addEventListener('visibilitychange',restart);restart();
  return()=>{dead=true;reset();reduced?.removeEventListener('change',restart);document.removeEventListener('visibilitychange',restart);};
 },[motion]);
 return <div ref={host} className="cinthia-face mx-auto w-full max-w-72" role="img" aria-label="CinthIA, asistente virtual">
  <img src={original} width={512} height={512} alt="" className="cinthia-base"/>
  <div className="cinthia-eyes" aria-hidden="true">
   <span className="cinthia-patch cinthia-eye-left"><img src={expressions} alt=""/></span>
   <span className="cinthia-patch cinthia-eye-right"><img src={expressions} alt=""/></span>
  </div>
  <span className="cinthia-patch cinthia-mouth" aria-hidden="true"><img src={expressions} alt=""/></span>
 </div>;
}
