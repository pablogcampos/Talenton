import { workerApi } from './workerApi';
export interface ProcessQuestion { id: string; label: string; type: 'CLOSED' | 'OPEN'; points: number; options?: string[]; correctIndex?: number }
export interface ProcessEvaluation { id: string; name: string; stage: string; minScore: number; questions: ProcessQuestion[] }
export interface ProcessTemplate { id?: string; previousId?: string; version?: number; name: string; description: string; position: string; stages: { stage: string; requirements: string }[]; evaluations: ProcessEvaluation[]; responsibleIds: string[]; interviewFields: string[]; rules: Record<string, boolean> }
export const processStages = ['NUEVO', 'CONTACTADO', 'ENTREVISTA', 'VERIFICACION_TECNICA', 'EVALUACIONES', 'APTO_CAPACITACION'];
export const selectionAdvancedApi = {
  configuration: (id: string) => workerApi<{ templates: ProcessTemplate[] }>(`/api/selection/campaigns/${encodeURIComponent(id)}`),
  template: (id: string, input: ProcessTemplate) => workerApi(`/api/selection/campaigns/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(input) }),
  messages: (id: string) => workerApi<{ id: string; name: string; type: string; content: string }[]>(`/api/selection/messages/${encodeURIComponent(id)}`),
  createMessage: (id: string, input: object) => workerApi(`/api/selection/messages/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(input) }),
  link: (eventId: string, campaignId: string, templateId: string, companyId?: string) => workerApi('/api/selection/link', { method: 'POST', body: JSON.stringify({ eventId, campaignId, templateId }) }, companyId),
  history: (id: string) => workerApi<{ applications: any[]; legacy: any }>(`/api/selection/candidates/${encodeURIComponent(id)}`),
  initialize: (id: string, templateId: string) => workerApi(`/api/selection/candidates/${encodeURIComponent(id)}/initialize`, { method: 'POST', body: JSON.stringify({ templateId }) }),
  close: (id: string, reason: string) => workerApi(`/api/selection/candidates/${encodeURIComponent(id)}/close`, { method: 'POST', body: JSON.stringify({ reason }) }),
  application: (id: string) => workerApi<any>(`/api/selection/applications/${encodeURIComponent(id)}`),
  action: (id: string, type: string, input: object) => workerApi(`/api/selection/applications/${encodeURIComponent(id)}/${type}`, { method: 'POST', body: JSON.stringify({ ...input, requestId: crypto.randomUUID() }) }),
};
