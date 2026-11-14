/** Output-only meter: never connected to the candidate's microphone. No audio buffering. */
export function createCinthiaPlayback(context: AudioContext) {
 const analyser=context.createAnalyser();analyser.fftSize=512;analyser.smoothingTimeConstant=0;
 analyser.connect(context.destination);
 const samples=new Float32Array(analyser.fftSize);
 let active=false,disposed=false;
 return {
  input:analyser,
  setActive(value:boolean){active=value;},
  read(){
   if(!active||disposed||context.state!=='running')return 0;
   analyser.getFloatTimeDomainData(samples);
   return rmsToMouth(Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length));
  },
  dispose(){active=false;disposed=true;analyser.disconnect();}
 };
}
export function rmsToMouth(rms:number){return !Number.isFinite(rms)||rms<=0.008?0:Math.min(1,(rms-0.008)/0.12);}
export function smoothMouth(previous:number,target:number,elapsed:number){
 // Silence and interruptions close immediately; attack/release smooth nonzero speech.
 if(target===0)return 0;
 return previous+(target-previous)*(1-Math.exp(-Math.min(elapsed,100)/(target>previous?40:65)));
}
