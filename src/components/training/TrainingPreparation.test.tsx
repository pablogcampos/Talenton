import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, it, expect, vi} from 'vitest';
import {TrainingPreparation} from './TrainingPreparation';
import {TrainingFinalPanel} from './TrainingFinalPanel';
import {useTalent} from '../../context/TalentContext';
import type {TrainingCohort, CandidateRecord} from '../../types';
vi.mock('../../context/TalentContext', () => ({useTalent:vi.fn()}));
vi.mock('../../services/workerApi', () => ({workerApi:vi.fn(),getWorkerErrorMessage:(_e:unknown,fallback:string)=>fallback}));
const cohort={id:'g',trainerId:'trainer',status:'PROGRAMADA',evaluationsConfig:[]} as TrainingCohort;
const participant={id:'p',fullName:'Participante de prueba',training:{status:'PENDIENTE_INICIO'}} as CandidateRecord;
function actor(role:string) { vi.mocked(useTalent).mockReturnValue({currentUser:{id:'trainer',role},addCustomEvaluationToCohort:vi.fn(),updateParticipantTrainingStatus:vi.fn()} as unknown as ReturnType<typeof useTalent>); }
describe('preparación del piloto por perfil', () => {
 it('permite al formador asignado configurar sus evaluaciones', () => {
  actor('FORMADOR');
  const html=renderToStaticMarkup(<TrainingPreparation cohort={cohort} participants={[participant]}/>);
  expect(html).toContain('Falta configurar las evaluaciones');
  expect(html).toContain('Agregar evaluación');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Iniciar capacitación/);
 });
 it('no permite configurar grupos ajenos o cerrados', () => {
  actor('FORMADOR');
  for(const group of [{...cohort,trainerId:'otro'},{...cohort,status:'FINALIZADA' as const},{...cohort,status:'CANCELADA' as const}]) {
   expect(renderToStaticMarkup(<TrainingPreparation cohort={group}/>)).not.toContain('Agregar evaluación');
  }
 });
 it('permite iniciar al participante cuando el grupo está iniciado', () => {
  actor('FORMADOR');
  const html=renderToStaticMarkup(<TrainingPreparation cohort={{...cohort,status:'EN_CAPACITACION'}} participants={[participant]}/>);
  expect(html).toContain('Iniciar capacitación');
  expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Iniciar capacitación/);
 });
 it('ofrece configuración al responsable sin preseleccionar una nota mínima', () => {
  actor('COORDINADOR_FORMACION');
  const html=renderToStaticMarkup(<TrainingPreparation cohort={cohort}/>);
  expect(html).toContain('Agregar evaluación');
  expect(html).toContain('Nota mínima');
  expect(html).toMatch(/max="20"[^>]*value=""/);
 });
 it('el envío a Talento espera una verificación del servidor', () => {
  const html=renderToStaticMarkup(<TrainingFinalPanel participants={[participant]} saving={false} onAlta={()=>{}}/>);
  expect(html).toContain('Verificando requisitos');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enviar a Gestión de Talento/);
 });
});
