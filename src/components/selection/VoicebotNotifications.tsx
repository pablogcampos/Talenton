import notificationSound from '../../assets/audio/voicebot-whistle.mp3';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../services/supabase';
import {workerApi} from '../../services/workerApi';
import {useTalent} from '../../context/TalentContext';

export function VoicebotNotifications(){
 const {currentUser,setActiveModule}=useTalent();
 const allowed=['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'].includes(currentUser.role);
 const [count,setCount]=useState(0),[connected,setConnected]=useState(false);
 const audio=useRef<AudioContext|null>(null),buffer=useRef<AudioBuffer|null>(null),pending=useRef(0),loading=useRef(false);
 const play=()=>{const ctx=audio.current;if(!pending.current||ctx?.state!=='running'||!buffer.current)return;
  const count=pending.current;pending.current=0;
  for(let i=0;i<count;i++){const source=ctx.createBufferSource();source.buffer=buffer.current;source.connect(ctx.destination);source.onended=()=>source.disconnect();source.start(ctx.currentTime+i*buffer.current.duration);}
 };
 useEffect(()=>{if(!allowed)return;let active=true;const controller=new AbortController();
  const unlock=()=>{try{
   audio.current??=new AudioContext();const ctx=audio.current;
   void ctx.resume().then(()=>{if(active)play();}).catch(()=>{});
   if(!buffer.current&&!loading.current){loading.current=true;
    void fetch(notificationSound,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('AUDIO_LOAD_FAILED');return r.arrayBuffer();})
     .then(bytes=>ctx.decodeAudioData(bytes)).then(decoded=>{if(active){buffer.current=decoded;play();}})
     .catch(()=>{/* Retry loading on the next user interaction. */}).finally(()=>{if(active)loading.current=false;});
   }
  }catch{/* Browser requires a user gesture. */}};
  unlock();window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
  return()=>{active=false;controller.abort();window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);void audio.current?.close();audio.current=null;buffer.current=null;loading.current=false;pending.current=0;};
 },[allowed,currentUser.id]);
 useEffect(()=>{if(!allowed)return;let alive=true,busy=false,initialized=false,watermark='',seen=new Set<string>();
  const signal=(rows:{id:string;received_at:string}[],realtime=false)=>{
   const fresh=rows.filter(r=>!seen.has(r.id)&&(realtime||!watermark||r.received_at>=watermark));
   if(initialized&&fresh.length){setCount(n=>n+fresh.length);pending.current+=fresh.length;play();}
   for(const row of rows){seen.add(row.id);if(row.received_at>watermark)watermark=row.received_at;}
   if(seen.size>2000)seen=new Set(rows.map(r=>r.id));initialized=true;
  };
  const poll=async()=>{if(busy)return;busy=true;try{const result=await workerApi<{items:{id:string;received_at:string}[]}>('/api/voicebot/feed');if(alive)signal(result.items);}catch{/* Inbox exposes read errors; subscription retries independently. */}finally{busy=false;}};
  void poll();const timer=setInterval(()=>void poll(),30000);
  const channel=supabase?.channel('voicebot-inbox-'+currentUser.id).on('postgres_changes',{event:'*',schema:'public',table:'voicebot_leads'},payload=>{
   if(!alive)return;window.dispatchEvent(new Event('talent:voicebot-changed'));
   if(payload.eventType==='INSERT'){if(initialized)signal([payload.new as {id:string;received_at:string}],true);else void poll();}
  }).subscribe(status=>{if(alive){setConnected(status==='SUBSCRIBED');if(status==='SUBSCRIBED')void poll();}});
  const focus=()=>void poll();window.addEventListener('focus',focus);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',focus);if(channel)void supabase?.removeChannel(channel);};
 },[allowed,currentUser.id]);
 if(!allowed)return null;
 return <aside className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm" aria-label="Alertas Voicebot">
  <button className="font-semibold text-sky-800" onClick={()=>{setCount(0);setActiveModule('SELECCION_VOICEBOT');}}>Leads Voicebot{count>0?` · ${count} nuevos`:''}</button>
  <span className="text-xs text-slate-500">{connected?'En tiempo real':'Actualización automática cada 30 s'}</span>
  <span className="ml-auto text-xs text-slate-500">Alertas sonoras automáticas</span>
  <span role="status" className="sr-only">{count>0?`${count} leads nuevos recibidos`:''}</span>
 </aside>;
}
