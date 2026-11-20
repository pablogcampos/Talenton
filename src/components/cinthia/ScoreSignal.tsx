import {freeScore} from '../../../shared/cinthiaFree';
export function scoreSignal(score:number|null|undefined,coverage=100){
 const value=freeScore(score);
 if(value===null||!Number.isFinite(value)||value<0||value>100||coverage<100)return {label:'Sin evidencia suficiente / pendiente',color:'bg-slate-100 text-slate-700'};
 return value>=80?{label:`Verde · ${value}/100`,color:'bg-emerald-100 text-emerald-800'}:value>=60?{label:`Ámbar · ${value}/100`,color:'bg-amber-100 text-amber-800'}:{label:`Rojo · ${value}/100`,color:'bg-red-100 text-red-800'};
}
export function ScoreSignal({score,coverage}:{score:number|null|undefined;coverage?:number}){
 const signal=scoreSignal(score,coverage);
 return <span className={`inline-block rounded-full px-2 py-1 text-sm ${signal.color}`}>{signal.label}</span>;
}
