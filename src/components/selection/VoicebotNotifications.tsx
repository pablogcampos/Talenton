import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../services/supabase';
import {workerApi} from '../../services/workerApi';
import {useTalent} from '../../context/TalentContext';

export function VoicebotNotifications(){
 const {currentUser,setActiveModule}=useTalent();
 const allowed=['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'].includes(currentUser.role);
 const [count,setCount]=useState(0),[connected,setConnected]=useState(false);
 const audio=useRef<AudioContext|null>(null),pending=useRef(false);
 const play=()=>{const ctx=audio.current;if(!pending.current||ctx?.state!=='running')return;pending.current=false;
  // Three distinct pulses; bounded volume and duration, no mute preference.
  for(let i=0;i<3;i++){const oscillator=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime+i*.45;oscillator.connect(gain);gain.connect(ctx.destination);oscillator.frequency.value=i%2?1040:740;gain.gain.setValueAtTime(.2,at);gain.gain.exponentialRampToValueAtTime(.001,at+.35);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(at);oscillator.stop(at+.35);}
 };
 useEffect(()=>{if(!allowed)return;const unlock=()=>{try{audio.current??=new AudioContext();void audio.current.resume().then(play).catch(()=>{});}catch{/* Browser requires a user gesture. */}};
  unlock();window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
  return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);void audio.current?.close();audio.current=null;pending.current=false;};
 },[allowed,currentUser.id]);
 useEffect(()=>{if(!allowed)return;let alive=true,busy=false,initialized=false,watermark='',seen=new Set<string>();
  const signal=(rows:{id:string;received_at:string}[],realtime=false)=>{
   const fresh=rows.filter(r=>!seen.has(r.id)&&(realtime||!watermark||r.received_at>=watermark));
   if(initialized&&fresh.length){setCount(n=>n+fresh.length);pending.current=true;play();}
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
