import { workerApi } from './workerApi';
export const captureSources = ['Facebook', 'TikTok', 'LinkedIn', 'WhatsApp', 'Pauta pagada', 'Referidos', 'Otros'];
export const captureStates = ['Nuevo', 'Contactado', 'No responde', 'Interesado', 'No interesado'];
export interface CaptureApplicant { fullName: string; phone: string; email: string; documentType: string; documentNumber: string; district: string; techCenterAnswers?: Record<string, string>; formSubmission?:{revision:number;title:string;questions:import('../../shared/captureFormSchema').FormQuestion[];answers:import('../../shared/captureFormSchema').FormAnswers;attachments:{id:string;name:string;size:number}[]} }
export interface CaptureLink { id: string; source: string; ownerUid: string; companyId: string; active: boolean; createdAt: string }
export interface CaptureEvent { companyId?:string; companyName?:string; id: string; candidateId: string; ownerUid: string; source: string; status: string; createdAt: string; conflict: boolean; applicant: CaptureApplicant; history: { at: string; actorUid: string; action: string; status: string; note: string }[]; possibleIds?: string[] }
export interface CaptureDossier { candidate: CaptureApplicant & { id: string }; events: CaptureEvent[] }
export interface CaptureManagement { owners: { uid: string; name: string; companyId: string; role: string; active: boolean }[]; links: CaptureLink[]; events: CaptureEvent[]; generatedAt: string }
export const captureApi = {
  management: () => workerApi<CaptureManagement>('/api/capture/management'),
  links: () => workerApi<{ items: CaptureLink[]; truncated: boolean }>('/api/capture/links'),
  inbox: () => workerApi<{ items: CaptureEvent[]; truncated: boolean }>('/api/capture/inbox'),
  create: (source: string,companyCampaignId?:string,companyId?:string) => workerApi('/api/capture/links', { method: 'POST', body: JSON.stringify({ source,companyCampaignId,companyId }) }),
  toggle: (id: string, active: boolean, companyId: string) => workerApi(`/api/capture/links/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ active }) }, companyId),
  remove: (id: string, companyId: string) => workerApi(`/api/capture/links/${encodeURIComponent(id)}`, { method: 'DELETE' }, companyId),
  manage: (id: string, status: string, note: string) => workerApi(`/api/capture/events/${id}`, { method: 'PATCH', body: JSON.stringify({ status, note }) }),
  dossier: (id: string) => workerApi<CaptureDossier>(`/api/capture/candidates/${encodeURIComponent(id)}`),
  exportAll: () => workerApi<{ items: CaptureEvent[]; total: number }>('/api/capture/export'),
};
export async function publicCaptureApi<T>(token: string, input?: object,files?:Record<string,File>): Promise<T> {
  const base = (import.meta.env.VITE_ADMIN_API_URL || import.meta.env.VITE_WORKER_API_URL)?.replace(/\/$/, '');
  if (!base) throw new Error('El formulario está pendiente de configuración.');
  let payload:FormData|string|undefined=input?JSON.stringify(input):undefined;
  if(input&&files&&Object.keys(files).length){const form=new FormData();form.set('payload',JSON.stringify(input));for(const [id,file]of Object.entries(files))form.set('file:'+id,file);payload=form;}
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),45000);
  try {
  const result = await fetch(`${base}/api/public/capture/${token}`, { signal:controller.signal, method: input ? 'POST' : 'GET', headers:payload instanceof FormData?{}:{'Content-Type':'application/json'}, ...(payload?{body:payload}:{}) });
  const data = await result.json(); if (!result.ok) throw Object.assign(new Error(data.message || 'No se pudo enviar la solicitud.'),{field:typeof data.field==='string'?data.field:undefined});
  if(input&&data?.ok!==true)throw new Error('No se recibió confirmación del guardado. Vuelve a enviar sin cerrar esta página.');
  return data;
  } catch(error){
    if(controller.signal.aborted||error instanceof TypeError)throw new Error('No se pudo confirmar el registro por un problema de conexión. Vuelve a enviar sin cerrar esta página.');
    throw error;
  } finally {clearTimeout(timeout);}
}
