import { formatCaptureTime } from './captureTime';
import type { CandidateRecord } from '../types';
import type { CaptureEvent } from '../services/captureApi';
import { companyText, optionLabel, optionValue, techCenterSections } from '../../shared/techCenterForm';

export type ExportCell = string | number | boolean | null | undefined;
export type ExportSheet = { name: string; headers: string[]; rows: ExportCell[][] };

const stringify = (value: unknown): string => value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
const legacyFields = new Map(techCenterSections.flatMap(section => section.fields.map(field => [field.key, { ...field, section: section.title }] as const)));
const applicantFields = ['fullName', 'documentType', 'documentNumber', 'phone', 'email', 'district'];

export function buildCandidateFormSheets(candidates: CandidateRecord[], events: CaptureEvent[]): ExportSheet[] {
  const candidatesSheet: ExportSheet = {
    name: 'Candidatos',
    headers: ['Empresa', 'ID candidato', 'Nombre completo', 'Nombres', 'Apellidos', 'Tipo documento', 'Documento', 'Teléfono', 'Correo', 'Distrito / ciudad', 'Dirección', 'Fecha nacimiento', 'Edad', 'Convocatoria', 'Perfil', 'Responsable', 'Etapa', 'Estado', 'Fuente', 'Detalle fuente', 'Fecha postulación', 'Experiencia (meses)', 'Nivel de inglés', 'Horario / jornada', 'Modalidad', 'Observaciones de registro'],
    rows: candidates.map(candidate => {
      const enriched = candidate as CandidateRecord & { companyId?: string; companyName?: string; documentType?: string };
      return [enriched.companyName || enriched.companyId, candidate.id, candidate.fullName, candidate.firstName, candidate.lastName, enriched.documentType, candidate.dni, candidate.phone, candidate.email, candidate.district || candidate.city, candidate.address, candidate.birthDate, candidate.age || '', candidate.campaignName, candidate.jobProfile, candidate.recruiterName, candidate.selection?.stage, candidate.selection?.status, candidate.source, candidate.sourceDetails, candidate.applicationDate, candidate.experienceMonths || '', candidate.englishLevel, candidate.workSchedule, candidate.workModality, candidate.observationsGeneral];
    }),
  };
  const includedCandidates = new Set(candidates.map(candidate => candidate.id));
  for (const event of events) {
    if (includedCandidates.has(event.candidateId)) continue;
    includedCandidates.add(event.candidateId);
    candidatesSheet.rows.push([event.companyName || event.companyId, event.candidateId, event.applicant.fullName, '', '', event.applicant.documentType, event.applicant.documentNumber, event.applicant.phone, event.applicant.email, event.applicant.district, '', '', '', '', '', '', '', event.status, event.source, '', event.createdAt, '', '', '', '', '']);
  }
  const capturesSheet: ExportSheet = {
    name: 'Captaciones',
    headers: ['Empresa', 'ID candidato', 'ID captación', 'Fecha de envío', 'Fuente', 'Estado', 'Conflicto de identidad', 'Título formulario', 'Versión formulario', 'Nombre declarado', 'Tipo documento declarado', 'Documento declarado', 'Teléfono declarado', 'Correo declarado', 'Distrito declarado', 'Consentimiento', 'Aviso de privacidad', 'Consentimiento datos sensibles'],
    rows: [],
  };
  const answersSheet: ExportSheet = {
    name: 'Respuestas',
    headers: ['Empresa', 'ID candidato', 'ID captación', 'Fecha de envío', 'Formulario', 'Versión', 'Origen', 'Sección', 'ID pregunta', 'Pregunta original', 'Tipo', 'Obligatoria', 'Respuesta', 'Valor original (JSON)', 'Opciones (JSON)', 'Ayuda', 'Condición (JSON)'],
    rows: [],
  };
  const attachmentsSheet: ExportSheet = {
    name: 'Adjuntos',
    headers: ['Empresa', 'ID candidato', 'ID captación', 'ID pregunta', 'Nombre de archivo', 'Tipo MIME', 'Tamaño (bytes)', 'SHA-256'],
    rows: [],
  };

  for (const event of events) {
    const form = event.applicant.formSubmission;
    const questions = form?.questions || [];
    const answers = form?.answers || {};
    const extended = event as CaptureEvent & { consent?: unknown; privacyAcknowledgement?: unknown; sensitiveDisclosureConsent?: unknown };
    const context = [event.companyName || event.companyId, event.candidateId, event.id, event.createdAt];
    capturesSheet.rows.push([...context, event.source, event.status, event.conflict ? 'Sí' : 'No', form?.title || 'Formulario anterior', form?.revision ?? '', event.applicant.fullName, event.applicant.documentType, event.applicant.documentNumber, event.applicant.phone, event.applicant.email, event.applicant.district, stringify(extended.consent), stringify(extended.privacyAcknowledgement), stringify(extended.sensitiveDisclosureConsent)]);
    const base = [...context, form?.title || 'Formulario anterior', form?.revision ?? ''];
    const addAnswer = (origin: string, section: string, id: string, label: string, type: string, required: boolean | '', value: unknown, options?: unknown, hint?: string, condition?: unknown) => {
      const labels = Array.isArray(options) ? options as { value: string; label: string }[] : [];
      const display = Array.isArray(value) ? value.map(item => labels.find(option => option.value === item)?.label || item).join(', ') : labels.find(option => option.value === value)?.label || stringify(value);
      answersSheet.rows.push([...base, origin, section, id, label, type, required === '' ? '' : required ? 'Sí' : 'No', display, stringify(value === undefined ? '' : value), stringify(options), hint || '', stringify(condition)]);
    };
    const seen = new Set<string>();
    if (form) {
      for (const question of questions) {
        const value = answers[question.id];
        addAnswer('Formulario', question.section, question.id, question.label, question.type, question.required, value, question.options, question.hint, question.condition);
        if (value !== undefined) seen.add(`${question.id}\u0000${stringify(value)}`);
      }
      for (const [id, value] of Object.entries(answers)) {
        if (questions.some(question => question.id === id)) continue;
        addAnswer('Respuesta adicional', '', id, id, '', '', value);
        seen.add(`${id}\u0000${stringify(value)}`);
      }
      for (const file of form.attachments || []) {
        const extendedFile = file as typeof file & { mimeType?: string; sha256?: string };
        attachmentsSheet.rows.push([event.companyName || event.companyId, event.candidateId, event.id, file.id, file.name, extendedFile.mimeType, file.size, extendedFile.sha256]);
      }
    }
    for (const [id, value] of Object.entries(event.applicant.techCenterAnswers || {})) {
      if (seen.has(`${id}\u0000${stringify(value)}`)) continue;
      const field = legacyFields.get(id);
      const company = event.companyName || event.applicant.techCenterAnswers?.companyName || 'TECH CENTER';
      const label = field ? companyText(field.label, company) : id;
      const options = field?.options?.map(item => ({ value: optionValue(item), label: optionLabel(item) }));
      addAnswer('Formulario anterior', field?.section || '', id, label, field?.type || '', field?.required ?? '', value, options, field?.hint);
    }
    for (const [id, value] of Object.entries(event.applicant)) {
      if (applicantFields.includes(id) || id === 'formSubmission' || id === 'techCenterAnswers') continue;
      addAnswer('Datos generales adicionales', '', id, id, '', '', value);
    }
  }
  // Preserve each submission independently; the summary identifies the latest response.
  const latestByCandidate = new Map<string, CaptureEvent>();
  for (const event of events) {
    if (!Number.isFinite(Date.parse(event.createdAt))) continue;
    const previous = latestByCandidate.get(event.candidateId);
    if (!previous || Date.parse(event.createdAt) > Date.parse(previous.createdAt)) latestByCandidate.set(event.candidateId, event);
  }
  candidatesSheet.headers.push('Última respuesta del formulario (hora de Perú)');
  for (const row of candidatesSheet.rows) {
    const event = latestByCandidate.get(String(row[1]));
    row.push(event ? formatCaptureTime(event.createdAt) : 'Sin respuesta de formulario registrada');
  }
  for (const sheet of [capturesSheet, answersSheet]) {
    sheet.headers[3] = 'Fecha de envío original (UTC)';
    sheet.headers.push('Respuesta del formulario (hora de Perú)');
    for (const row of sheet.rows) row.push(formatCaptureTime(String(row[3] || '')));
  }
  return [candidatesSheet, capturesSheet, answersSheet, attachmentsSheet];
}
