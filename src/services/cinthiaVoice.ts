import {createCinthiaPlayback} from './cinthiaPlayback';
export function formatVoiceDiagnostic(d:{source?:string;code?:string;status?:number;reference?:string;at?:string}){return ['Origen: '+(d.source||'No informado'),'Código: '+(d.code||'CAUSE_NOT_REPORTED'),d.status!==undefined?'Estado: '+d.status:'',d.code==='CAUSE_NOT_REPORTED'||d.code==='SOCKET_CLOSED'?'La causa exacta no fue informada; este evento no demuestra una pérdida de internet.':'',d.reference?'Referencia: '+d.reference:'',d.at?'Hora: '+d.at:''].filter(Boolean).join(' · ');}
export type VoiceState='available'|'speaking'|'listening'|'processing'|'finished'|'error'|'paused';
export type VoiceSegment={id:string;speaker:'candidate'|'cinthia';text:string;complete:boolean;at:string;source:'gemini_live'};
export type VoiceEvent={type:'state';state:VoiceState}|{type:'question';text:string}|{type:'transcript';segments:VoiceSegment[]}|{type:'saved';receiptId:string}|{type:'error';message:string};
export interface CinthiaVoiceSession{sessionId:string;readMouth():number;setMicrophone(enabled:boolean):Promise<void>;repeatQuestion():Promise<void>;reconnect():Promise<void>;finish():Promise<{receiptId:string}>;close():void;}
const keyName=(token:string)=>'cinthia-session:'+token;
export const pcm16=(samples:Float32Array)=>{const bytes=new Uint8Array(samples.length*2),v=new DataView(bytes.buffer);samples.forEach((s,i)=>v.setInt16(i*2,Math.round(Math.max(-1,Math.min(1,s))*(s<0?32768:32767)),true));return bytes;};
const encode=(b:Uint8Array)=>{let s='';for(const n of b)s+=String.fromCharCode(n);return btoa(s);};
const worklet=`class Capture extends AudioWorkletProcessor{constructor(){super();this.samples=[];this.position=0;this.pending=[];}process(inputs){const a=inputs[0]?.[0];if(a){this.samples.push(...a);const ratio=sampleRate/16000;const out=[];while(this.position+ratio<this.samples.length){const i=Math.floor(this.position);out.push(this.samples[i]);this.position+=ratio;}const used=Math.floor(this.position);this.samples.splice(0,used);this.position-=used;this.pending.push(...out);while(this.pending.length>=1600)this.port.postMessage(new Float32Array(this.pending.splice(0,1600)));}return true;}}registerProcessor('cinthia-capture',Capture);`;
export const cinthiaVoice={
 available:true,
 async start(token:string,consentVersion:string,onEvent:(event:VoiceEvent)=>void):Promise<CinthiaVoiceSession>{
  if(consentVersion!=='cinthia-voice-v1')throw Error('CINTHIA_CONSENT_REQUIRED');
  const base=(import.meta.env.VITE_ADMIN_API_URL||import.meta.env.VITE_WORKER_API_URL)?.replace(/\/$/,'');if(!base)throw Error('SUPABASE_API_NOT_CONFIGURED');
  if(!navigator.mediaDevices?.getUserMedia)throw Error('El micrófono requiere un navegador compatible y una conexión HTTPS.');
  let stream:MediaStream|undefined,ctx:AudioContext|undefined,node:AudioWorkletNode|undefined,source:MediaStreamAudioSourceNode|undefined,ws:WebSocket|undefined;
  let closed=false,muted=false,ready=false,reconnecting=false,retries=0,nextAudio=0,turnEnded=false,manualClosing=false,sessionId='',deadline=0,paused=false,autoFinish=false,lastSpeech=0;
  let reconnectTimer:ReturnType<typeof setTimeout>|undefined,deadlineTimer:ReturnType<typeof setTimeout>|undefined;
  let finishResolve:((r:{receiptId:string})=>void)|undefined,finishReject:((e:Error)=>void)|undefined,finishTimer:ReturnType<typeof setTimeout>|undefined;
  const playing=new Set<AudioBufferSourceNode>();
  let playback:ReturnType<typeof createCinthiaPlayback>|undefined;
  const maybeAutoFinish=()=>{if(autoFinish&&ready&&!playing.size&&turnEnded&&!finishResolve){autoFinish=false;void finishSession().catch(e=>onEvent({type:'error',message:e instanceof Error?e.message:'No se confirmó el guardado.'}));}};
  let key=sessionStorage.getItem(keyName(token));if(!key){key=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');sessionStorage.setItem(keyName(token),key);}
  const post=async(path:string,body:unknown)=>{const r=await fetch(base+'/api/public/cinthia/'+token+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),referrerPolicy:'no-referrer',cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.message||'CINTHIA_FAILED');return d;};
  const state=(s:VoiceState)=>onEvent({type:'state',state:s});
  const stopAudio=()=>{playback?.setActive(false);for(const s of playing){try{s.stop();}catch{}s.disconnect();}playing.clear();nextAudio=0;};
  const close=()=>{if(closed)return;closed=true;clearTimeout(reconnectTimer);clearTimeout(deadlineTimer);clearTimeout(finishTimer);finishReject?.(Error('La sesión se cerró antes de confirmar el guardado.'));finishReject=undefined;stopAudio();stream?.getTracks().forEach(t=>t.stop());node?.disconnect();source?.disconnect();playback?.dispose();void ctx?.close();try{if(ws?.readyState===1)ws.send(JSON.stringify({type:'close'}));ws?.close();}catch{}};
  const send=(data:unknown)=>{if(ws?.readyState!==1||!ready)throw Error('La conexión se está recuperando.');ws.send(JSON.stringify(data));};
  const connect=()=>new Promise<void>((resolve,reject)=>{
   clearTimeout(reconnectTimer);if(ws){ws.onclose=null;ws.onmessage=null;try{ws.close();}catch{}}
   ready=false;manualClosing=false;turnEnded=false;
   const url=new URL(base+'/api/public/cinthia/live');url.protocol=url.protocol==='https:'?'wss:':'ws:';
   const socket=new WebSocket(url);ws=socket;let settled=false,reported='',reference='';
   const report=(d:Parameters<typeof formatVoiceDiagnostic>[0])=>{reported=formatVoiceDiagnostic({...d,at:d.at||new Date().toISOString()});onEvent({type:'error',message:reported});return reported;};
   const timeout=setTimeout(()=>{reject(Error(report({source:'Navegador',code:'CONNECTION_TIMEOUT_80000MS'})));socket.close();},80000);
   socket.onopen=()=>socket.send(JSON.stringify({type:'auth',token,key}));
   socket.onmessage=e=>{
    if(closed||ws!==socket)return;
    let m:any;try{m=JSON.parse(e.data);}catch{return;}
    if(m.type==='diagnosticReference')reference=m.reference;
    if(m.type==='recovering'){onEvent({type:'error',message:'Recuperando la conexión anterior. Espera unos segundos; tus respuestas guardadas se conservan.'});}
    if(m.type==='ready'){onEvent({type:'error',message:''});clearTimeout(timeout);settled=true;ready=true;sessionId=m.sessionId;deadline=Date.parse(m.deadline);onEvent({type:'transcript',segments:m.transcript||[]});const previous=[...(m.transcript||[])].reverse().find((s:VoiceSegment)=>s.speaker==='cinthia');if(previous)onEvent({type:'question',text:previous.text});state(muted?'available':'listening');resolve();}
    if(m.type==='audio'&&ctx){try{const raw=atob(m.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),rate=Number(/rate=(\d+)/.exec(m.mimeType)?.[1]||24000);if(bytes.length%2||rate<8000||rate>48000)return;const b=ctx.createBuffer(1,bytes.length/2,rate),v=new DataView(bytes.buffer),samples=b.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=v.getInt16(i*2,true)/32768;const s=ctx.createBufferSource();s.buffer=b;s.connect(playback!.input);playing.add(s);playback?.setActive(true);turnEnded=false;state('speaking');s.onended=()=>{playing.delete(s);s.disconnect();if(!playing.size)playback?.setActive(false);if(!playing.size&&turnEnded){state(muted?'available':'listening');maybeAutoFinish();}};const when=Math.max(ctx.currentTime,nextAudio);s.start(when);nextAudio=when+b.duration;}catch{onEvent({type:'error',message:'No se pudo reproducir el audio.'});}}
    if(m.type==='interrupted'){stopAudio();state(muted?'available':'listening');}
    if(m.type==='transcript'){if(!playing.size&&m.segments.at(-1)?.speaker==='candidate')state('processing');onEvent({type:'transcript',segments:m.segments});const last=[...m.segments].reverse().find((s:VoiceSegment)=>s.speaker==='cinthia');if(last)onEvent({type:'question',text:last.text});}
    if(m.type==='turnComplete'){turnEnded=true;autoFinish=!!m.autoFinish;if(!playing.size)state(muted?'available':'listening');maybeAutoFinish();}
    if(m.type==='saved'){clearTimeout(finishTimer);sessionStorage.removeItem(keyName(token));state('finished');onEvent({type:'saved',receiptId:m.receiptId});finishResolve?.({receiptId:m.receiptId});finishResolve=undefined;finishReject=undefined;close();}
    if(m.type==='finishRejected'){clearTimeout(finishTimer);finishReject?.(Error(m.diagnostic?report(m.diagnostic):m.message));finishResolve=undefined;finishReject=undefined;state(muted?'available':'listening');}
    if(m.type==='paused'){paused=true;manualClosing=true;ready=false;clearTimeout(reconnectTimer);clearTimeout(deadlineTimer);stopAudio();stream?.getTracks().forEach(t=>t.enabled=false);state('paused');onEvent({type:'error',message:'Entrevista pausada por 30 segundos de silencio. Pulsa Retomar entrevista para continuar.'});}
    if(m.type==='error'&&m.message!=='COMPLETED'&&m.message!=='SILENCE_TIMEOUT'){
     report(m.diagnostic||{source:'Servidor',code:m.message});
     if(['SESSION_TIME_LIMIT','CINTHIA_SESSION_EXPIRED','INVALID_AUTH','CINTHIA_INVALID_STATE'].includes(m.message)){manualClosing=true;state('error');stream?.getTracks().forEach(t=>t.stop());}
     if(!settled){clearTimeout(timeout);reject(Error(reported));}
    }
   };
   socket.onerror=()=>{if(!reported)report({source:'WebSocket del navegador',code:'CAUSE_NOT_REPORTED'});if(!settled){clearTimeout(timeout);reject(Error(reported));}};
   socket.onclose=e=>{clearTimeout(timeout);ready=false;stopAudio();if(!closed&&!paused&&!reported)report({source:'WebSocket del navegador',code:'SOCKET_CLOSED',status:e.code,reference:reference||sessionId||undefined});if(!settled)reject(Error(reported));if(!closed&&!manualClosing){state('error');if(retries<3&&Date.now()<deadline){reconnectTimer=setTimeout(()=>void reconnect().catch(()=>{}),3000);}}};
  });
  const reconnect=async()=>{if(reconnecting||closed)return;if(!paused&&Date.now()>=deadline)throw Error('CINTHIA_SESSION_EXPIRED');reconnecting=true;retries++;try{if(paused){const started=await post('/start',{key,consent:true,consentVersion});deadline=Date.parse(started.deadline);stream?.getTracks().forEach(t=>t.enabled=!muted);paused=false;}await connect();}catch(e){onEvent({type:'error',message:e instanceof Error?e.message:'Causa no informada al reconectar.'});throw e;}finally{reconnecting=false;}};
  const finishSession=async()=>{if(finishResolve)throw Error('El guardado está en curso.');if(playing.size||!turnEnded)throw Error('Espera a que CinthIA termine de responder.');state('processing');return new Promise<{receiptId:string}>((resolve,reject)=>{finishResolve=resolve;finishReject=reject;try{send({type:'audioEnd'});send({type:'finish'});}catch(e){finishResolve=undefined;finishReject=undefined;reject(e);return;}finishTimer=setTimeout(()=>{void post('/receipt',{key}).then(r=>{if(!r.receiptId)throw Error();onEvent({type:'saved',receiptId:r.receiptId});finishReject=undefined;resolve(r);close();}).catch(()=>{finishResolve=undefined;finishReject=undefined;reject(Error('No se confirmó el guardado. Puedes reintentar sin perder lo ya registrado.'));});},20000);});};
  try{
   ctx=new AudioContext();await ctx.resume();playback=createCinthiaPlayback(ctx);stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   const started=await post('/start',{key,consent:true,consentVersion});sessionId=started.sessionId;deadline=Date.parse(started.deadline);
   const blob=URL.createObjectURL(new Blob([worklet],{type:'application/javascript'}));try{await ctx.audioWorklet.addModule(blob);}finally{URL.revokeObjectURL(blob);}
   source=ctx.createMediaStreamSource(stream);node=new AudioWorkletNode(ctx,'cinthia-capture');source.connect(node);const silent=ctx.createGain();silent.gain.value=0;node.connect(silent);silent.connect(ctx.destination);
   node.port.onmessage=e=>{if(ready&&!muted&&!closed&&Date.now()-lastSpeech>1000){const samples=e.data as Float32Array;const rms=Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length);if(rms>0.02){lastSpeech=Date.now();send({type:'speechActivity'});}}if(ready&&!muted&&!closed&&ws?.readyState===1&&ws.bufferedAmount<128000)ws.send(JSON.stringify({type:'audio',data:encode(pcm16(e.data))}));};
   await connect();deadlineTimer=setTimeout(()=>{manualClosing=true;stream?.getTracks().forEach(t=>t.stop());onEvent({type:'error',message:'Se alcanzó el límite de la sesión. La entrevista no se marcará como completada sin confirmación del servidor.'});state('error');},Math.max(0,deadline-Date.now()));
   return {get sessionId(){return sessionId;},readMouth:()=>playback?.read()||0,async setMicrophone(enabled){muted=!enabled;stream?.getTracks().forEach(t=>t.enabled=enabled);if(!enabled&&ready)send({type:'audioEnd'});if(!playing.size)state(enabled?'listening':'available');},async repeatQuestion(){send({type:'repeat'});state('processing');},reconnect,
    finish:finishSession,close};
  }catch(e){close();if(e instanceof DOMException&&['NotAllowedError','PermissionDeniedError'].includes(e.name))throw Error('Permite el micrófono para comenzar. No se inició la entrevista.');throw e;}
 }
};
