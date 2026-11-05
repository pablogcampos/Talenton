import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { CandidateRecord } from '../types';
import type { CaptureEvent } from '../services/captureApi';
import { buildCandidateFormSheets } from './candidateFormExport';
import { createXlsx } from './xlsxExport';

const candidate = { id: 'uc.techcenter.person-1', fullName: 'Persona Uno', dni: '00123456', phone: '900000001', email: 'uno@example.com', district: 'Lima', source: 'Facebook' } as unknown as CandidateRecord;
const formEvent = {
  id: 'capture-1', candidateId: candidate.id, ownerUid: 'owner-1', history: [], companyId: 'techcenter', companyName: 'Techcenter', createdAt: '2026-10-26T12:00:00Z', source: 'Facebook', status: 'Nuevo', conflict: false,
  applicant: { fullName: 'Persona Uno', documentType: 'DNI', documentNumber: '00123456', phone: '900000001', email: 'uno@example.com', district: 'Lima',
    formSubmission: { title: 'Postulación', revision: 3, questions: [
      { id: 'experienceDetails', label: 'Tiempo y campañas', section: 'Experiencia', type: 'long', required: true },
      { id: 'custom', label: 'Pregunta personalizada', section: 'Perfil', type: 'multiple', required: false, options: [{ value: 'a', label: 'Opción A' }, { value: 'b', label: 'Opción B' }] },
      { id: 'empty', label: 'Pregunta sin responder', section: 'Perfil', type: 'short', required: false },
    ], answers: { experienceDetails: '1 año en ventas', custom: ['a', 'b'], extra: '=HYPERLINK("https://example.test")' }, attachments: [{ id: 'cvFile', name: 'cv.pdf', size: 123 }] },
    techCenterAnswers: { experienceDetails: '1 año en ventas', companyName: 'Techcenter', preferredCampaignId: 'campaign-1' },
  },
} as CaptureEvent;
const oldEvent = {
  id: 'capture-2', candidateId: 'uc.techcenter.person-2', ownerUid: 'owner-1', history: [], companyId: 'techcenter', createdAt: '2026-10-25T12:00:00Z', source: 'WhatsApp', status: 'Nuevo', conflict: false,
  applicant: { fullName: 'Persona Dos', documentType: 'DNI', documentNumber: '87654321', phone: '900000002', email: '', district: 'Callao', techCenterAnswers: { contactCenterExperience: 'Sí', experienceMonths: '6', experienceDetails: 'Retenciones', legacyExtra: 'Dato conservado' } },
} as CaptureEvent;

describe('exportación completa de formularios', () => {
  it('muestra hora peruana, conserva cada envío y resume el último sin inventar fechas', () => {
    const latest = {...formEvent, id: 'latest', createdAt: '2026-11-06T02:15:30Z'};
    const noForm = {...candidate, id: 'without-form', applicationDate: '2026-11-06'};
    const [people, captures, answers] = buildCandidateFormSheets([candidate, noForm], [latest, formEvent, oldEvent]);
    expect(people.rows[0].at(-1)).toContain('05/11/2026');
    expect(people.rows[0].at(-1)).toContain('21:15:30');
    expect(people.rows[1].at(-1)).toBe('Sin respuesta de formulario registrada');
    expect(people.rows[2].at(-1)).toContain('07:00:00');
    expect(captures.rows[0][3]).toBe(latest.createdAt);
    expect(captures.rows[0].at(-1)).toContain('21:15:30');
    expect(captures.rows[1].at(-1)).toContain('07:00:00');
    expect(answers.rows.filter(row=>row[2]==='latest').every(row=>String(row.at(-1)).includes('21:15:30'))).toBe(true);
    const files=unzipSync(createXlsx([people,captures,answers]));
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('21:15:30');
  });
  it('incluye formularios personalizados, anteriores, preguntas vacías, extras y adjuntos', () => {
    const [people, captures, answers, attachments] = buildCandidateFormSheets([candidate], [formEvent, oldEvent]);
    expect(people.rows).toHaveLength(2);
    expect(captures.rows).toHaveLength(2);
    expect(answers.rows.filter(row => row[2] === 'capture-1')).toHaveLength(6);
    expect(answers.rows.some(row => row[8] === 'empty' && row[12] === '')).toBe(true);
    expect(answers.rows.some(row => row[8] === 'custom' && row[12] === 'Opción A, Opción B' && row[13] === '["a","b"]')).toBe(true);
    expect(answers.rows.some(row => row[8] === 'legacyExtra' && row[12] === 'Dato conservado')).toBe(true);
    expect(attachments.rows[0].slice(3, 7)).toEqual(['cvFile', 'cv.pdf', undefined, 123]);
  });

  it('genera un Excel con cuatro hojas y deja respuestas peligrosas como texto, no fórmulas', () => {
    const files = unzipSync(createXlsx(buildCandidateFormSheets([candidate], [formEvent, oldEvent])));
    const workbook = strFromU8(files['xl/workbook.xml']);
    const responses = strFromU8(files['xl/worksheets/sheet3.xml']);
    expect(workbook).toContain('name="Candidatos"');
    expect(workbook).toContain('name="Respuestas"');
    expect(workbook).toContain('name="Adjuntos"');
    expect(responses).toContain('t="inlineStr"');
    expect(responses).toContain('=HYPERLINK(&quot;https://example.test&quot;)');
    expect(responses).not.toContain('<f>');
    expect(responses).toContain('Pregunta personalizada');
  });
});
