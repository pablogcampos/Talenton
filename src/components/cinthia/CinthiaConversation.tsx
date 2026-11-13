import {Mic,RotateCcw,Square} from 'lucide-react';
import type {VoiceState} from '../../services/cinthiaVoice';
import {CinthiaAvatar,cinthiaControl as control,cinthiaPrimary as primary} from './CinthiaUI';
const states:Record<VoiceState,string>={available:'Disponible',speaking:'Hablando',listening:'Escuchando',processing:'Procesando',finished:'Finalizado',error:'Error de conexión',paused:'Pausada por silencio'};
// Only a real provider session can activate conversation controls or activity states.
export function CinthiaConversation({state,connected,question,transcript,microphone,onMicrophone,onRepeat,onFinish}:{state:VoiceState;connected:boolean;question:string;transcript:string;microphone:boolean;onMicrophone:()=>void;onRepeat:()=>void;onFinish:()=>void}){
 return <section className="space-y-5 text-center"><div data-voice-state={state} className={connected&&state==='speaking'?'motion-safe:animate-pulse':''}><CinthiaAvatar large/></div><p role="status" className="text-sm text-teal-800">{states[state]}</p><h2 className="text-xl font-semibold">{question||'Esperando conexión con CinthIA'}</h2>{transcript&&<p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-left">{transcript}</p>}
 <div className="flex flex-wrap justify-center gap-2"><button className={control+' inline-flex items-center gap-2'} disabled={!connected} aria-pressed={microphone} onClick={onMicrophone}><Mic size={18}/>{microphone?'Pausar micrófono':'Activar micrófono'}</button><button className={primary+' inline-flex items-center gap-2'} disabled={!connected} onClick={onFinish}><Square size={18}/>Finalizar</button></div></section>;
}
