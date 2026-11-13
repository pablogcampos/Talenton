import smallAvatar from '../../assets/cinthia/cinthia-avatar-128.webp';
import largeAvatar from '../../assets/cinthia/cinthia-avatar-512.webp';
import {cinthiaLabels,type CinthiaStatus} from '../../services/cinthia';
export const cinthiaControl='min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50';
export const cinthiaPrimary='min-h-11 rounded-xl bg-[#0C2948] px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50';
export function CinthiaAvatar({large=false}:{large?:boolean}){return <img src={large?largeAvatar:smallAvatar} width={large?512:128} height={large?512:128} alt="CinthIA, asistente virtual" className={large?'mx-auto h-auto w-full max-w-72 object-contain':'h-16 w-16 shrink-0 object-contain'}/>;}
export function CinthiaBadge({status}:{status:CinthiaStatus}){return <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${status==='COMPLETED'?'bg-emerald-50 text-emerald-800':status==='EXPIRED'||status==='CANCELLED'?'bg-slate-100 text-slate-600':'bg-teal-50 text-teal-800'}`}>{cinthiaLabels[status]}</span>;}
