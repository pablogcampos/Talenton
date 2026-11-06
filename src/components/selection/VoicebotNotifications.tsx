import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../services/supabase';
import {workerApi} from '../../services/workerApi';
import {useTalent} from '../../context/TalentContext';

export function VoicebotNotifications(){
 const {currentUser,setActiveModule}=useTalent();
 const allowed=['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'].includes(currentUser.role);
 const [count,setCount]=useState(0),[sound,setSound]=useState(false),[connected,setConnected]=useState(false);
 const audio=useRef<AudioContext|null>(null),enabled=useRef(false);
 useEffect(()=>{if(!allowed)return;let alive=true,busy=false,initialized=false,watermark='',seen=new Set<string>();
  const signal=(rows:{id:string;received_at:string}[])=>{
   const fresh=rows.filter(r=>!seen.has(r.id)&&(!watermark||r.received_at>=watermark));
   if(initialized&&fresh.length){setCount(n=>n+fresh.length);if(enabled.current&&audio.current?.state==='running'){
    const oscillator=audio.current.createOscillator(),gain=audio.current.createGain();oscillator.connect(gain);gain.connect(audio.current.destination);oscillator.frequency.value=740;gain.gain.setValueAtTime(.08,audio.current.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.current.currentTime+.25);oscillator.start();oscillator.stop(audio.current.currentTime+.25);
   }}
   for(const row of rows){seen.add(row.id);if(row.received_at>watermark)watermark=row.received_at;}
   if(seen.size>2000)seen=new Set(rows.map(r=>r.id));initialized=true;
  };
  const poll=async()=>{if(busy)return;busy=true;try{const result=await workerApi<{items:{id:string;received_at:string}[]}>('/api/voicebot/feed');if(alive)signal(result.items);}catch{/* Inbox exposes read errors; subscription retries independently. */}finally{busy=false;}};
  void poll();const timer=setInterval(()=>void poll(),30000);
  const channel=supabase?.channel('voicebot-inbox-'+currentUser.id).on('postgres_changes',{event:'*',schema:'public',table:'voicebot_leads'},payload=>{
   if(!alive)return;window.dispatchEvent(new Event('talent:voicebot-changed'));
   if(payload.eventType==='INSERT'){if(initialized)signal([payload.new as {id:string;received_at:string}]);else void poll();}
  }).subscribe(status=>{if(alive){setConnected(status==='SUBSCRIBED');if(status==='SUBSCRIBED')void poll();}});
  const focus=()=>void poll();window.addEventListener('focus',focus);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',focus);if(channel)void supabase?.removeChannel(channel);};
 },[allowed,currentUser.id]);
 useEffect(()=>()=>{void audio.current?.close();},[]);
 if(!allowed)return null;
 const toggle=async()=>{if(enabled.current){enabled.current=false;setSound(false);return;}try{audio.current??=new AudioContext();await audio.current.resume();enabled.current=audio.current.state==='running';setSound(enabled.current);}catch{setSound(false);}};
 return <aside className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm" aria-label="Alertas Voicebot">
  <button className="font-semibold text-sky-800" onClick={()=>{setCount(0);setActiveModule('SELECCION_VOICEBOT');}}>Leads Voicebot{count>0?` · ${count} nuevos`:''}</button>
  <span className="text-xs text-slate-500">{connected?'En tiempo real':'Actualización automática cada 30 s'}</span>
  <button className="ml-auto underline" aria-pressed={sound} onClick={()=>void toggle()}>{sound?'Silenciar alertas':'Activar sonido'}</button>
  <span role="status" className="sr-only">{count>0?`${count} leads nuevos recibidos`:''}</span>
 </aside>;
}
