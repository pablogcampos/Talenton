import React from 'react';
import type {CandidateRecord} from '../../types';
export function InjectionBadge({candidate}:{candidate:CandidateRecord}){
 const value=candidate.training?.injection;
 if(!value)return null;
 return <span className="mt-1 block text-xs font-normal text-teal-700">Inyección · {value.date} · {value.userName}</span>;
}
