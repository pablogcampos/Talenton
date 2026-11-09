import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {TrainingPreparation} from './TrainingPreparation';
import {TrainingFinalPanel} from './TrainingFinalPanel';
import {useTalent} from '../../context/TalentContext';
import type {TrainingCohort,CandidateRecord} from '../../types';
vi.mock('../../context/TalentContext',()=>({useTalent:vi.fn()}));
vi.mock('../../services/workerApi',()=>({workerApi:vi.fn(),getWorkerErrorMessage:(_e:unknown,fallback:string)=>fallback}));
const cohort={id:'g',trainerId:'trainer',status:'PROGRAMADA',evaluationsConfig:[]} as TrainingCohort;
const participant={id:'p',fullName:'Participante de prueba',training:{status:'PENDIENTE_INICIO',evaluations:[]}} as unknown as CandidateRecord;
function actor(){vi.mocked(useTalent).mockReturnValue({currentUser:{id:'trainer',role:'FORMADOR'},scopedCandidates:[]} as unknown as ReturnType<typeof useTalent>);}
describe('flujo simplificado de teoría',()=>{
 it('ofrece un solo inicio grupal sin configurar evaluaciones',()=>{
  actor();const html=renderToStaticMarkup(<TrainingPreparation cohort={cohort} participants={[participant,{...participant,id:'p2'}]}/>);
  expect(html).toContain('Iniciar capacitación del grupo (2)');
  expect(html).not.toContain('Agregar evaluación');expect(html).not.toContain('Falta configurar');
  expect((html.match(/Iniciar capacitación del grupo/g)||[])).toHaveLength(1);
  expect((html.match(/Cesar participante/g)||[])).toHaveLength(2);
 });
 it('ofrece finalizar teoría cuando hay participantes en capacitación',()=>{
  actor();const html=renderToStaticMarkup(<TrainingPreparation cohort={{...cohort,status:'EN_CAPACITACION'}} participants={[{...participant,training:{...participant.training,status:'EN_CAPACITACION'}}]}/>);
  expect(html).toContain('Finalizar etapa teórica');expect(html).not.toContain('Nota mínima');
 });
 it('no ofrece acciones sobre grupos ajenos o cerrados',()=>{
  actor();
  for(const group of [{...cohort,trainerId:'otro'},{...cohort,status:'FINALIZADA' as const},{...cohort,status:'CANCELADA' as const}]){
   const html=renderToStaticMarkup(<TrainingPreparation cohort={group} participants={[participant]}/>);
   expect(html).not.toContain('<button');
  }
 });
 it('muestra estado pendiente a OJT y nota final incluyendo cero',()=>{
  actor();const html=renderToStaticMarkup(<TrainingPreparation cohort={{...cohort,status:'PENDIENTE_OJT'}} participants={[{...participant,training:{...participant.training,status:'PENDIENTE_OJT',finalGrade:0}}]}/>);
  expect(html).toContain('Pendiente a OJT');expect(html).toContain('Nota final: 0/20');expect(html).not.toContain('<button');
 });
 it('el envío a Talento espera verificación del servidor',()=>{
  const html=renderToStaticMarkup(<TrainingFinalPanel participants={[participant]} saving={false} onAlta={()=>{}}/>);
  expect(html).toContain('Verificando requisitos');expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enviar a Gestión de Talento/);
 });
});
