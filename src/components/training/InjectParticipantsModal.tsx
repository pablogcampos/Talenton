import React,{useState} from 'react';
import {useTalent} from '../../context/TalentContext';
import type {CampaignCall} from '../../types';
import {isCandidateReadyForTraining} from '../../utils/trainingEligibility';
import {workerApi,getWorkerErrorMessage} from '../../services/workerApi';
export function InjectParticipantsModal({campaign,onClose}:{campaign:CampaignCall;onClose:()=>void}){
 const {cohorts,scopedCandidates}=useTalent();
 const groups=cohorts.filter(g=>g.campaignId===campaign.id&&['PENDIENTE_ASIGNACION','PROGRAMADA','EN_CAPACITACION'].includes(g.status));
 const people=scopedCandidates.filter(p=>isCandidateReadyForTraining(p,campaign.id));
 const [group,setGroup]=useState(''),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(busy||!group||!selected.length)return;setBusy(true);setError('');try{
  await workerApi('/api/trainings/'+encodeURIComponent(group)+'/inject',{method:'POST',body:JSON.stringify({candidateIds:selected})},campaign.companyId);
  setDone(true);
 }catch(e){setError(getWorkerErrorMessage(e));}finally{setBusy(false);}};
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" aria-label="Inyectar personal apto" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 text-[#143c55]">
 <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold">Inyectar personal apto</h2><button disabled={busy} onClick={onClose} className="rounded-lg border px-3 py-2">Cerrar</button></div>
 <p className="mt-2 text-sm">{campaign.title}</p>
 {done?<p role="status" className="mt-5 rounded-xl bg-teal-50 p-4">Participantes incorporados con marca Inyección. El reclutador debe validar jornadas y asignar sus propuestas en Propuesta Laboral.</p>:<form onSubmit={submit} className="mt-5 space-y-4">
 <label className="block text-sm">Capacitación existente<select required disabled={busy} value={group} onChange={e=>setGroup(e.target.value)} className="mt-2 w-full rounded-xl border p-3"><option value="">Selecciona una capacitación</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} · {g.name} · {g.status.replaceAll('_',' ')}</option>)}</select></label>
 {!groups.length&&<p>No hay capacitaciones disponibles antes de iniciar o en etapa teórica para esta convocatoria.</p>}
 <p className="text-sm text-slate-500">La incorporación queda registrada con fecha y responsable. Si el grupo está en curso, ingresan en capacitación; no se registran faltas anteriores. El cupo se amplía si es necesario para incluir a los seleccionados.</p>
 <div className="flex justify-between text-sm"><strong>Aptos disponibles ({people.length})</strong><button type="button" disabled={busy} onClick={()=>setSelected(selected.length===people.length?[]:people.map(p=>p.id))} className="underline">Seleccionar todos / ninguno</button></div>
 <div className="max-h-64 overflow-y-auto rounded-xl border">{people.map(p=><label key={p.id} className="flex items-center gap-3 border-b p-3 text-sm"><input type="checkbox" disabled={busy} checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/><span>{p.fullName}<span className="block text-xs text-slate-500">{p.dni}</span></span></label>)}{!people.length&&<p className="p-4 text-sm">No hay candidatos aptos sin capacitación asignada.</p>}</div>
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
 <button disabled={busy||!group||!selected.length} className="rounded-xl bg-[#143c55] px-5 py-3 font-semibold text-white disabled:opacity-50">{busy?'Incorporando…':'Inyectar seleccionados ('+selected.length+')'}</button>
 </form>}</section></div>;
}
