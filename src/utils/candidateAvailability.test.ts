import {describe,it,expect} from 'vitest';
import type {CaptureEvent} from '../services/captureApi';
import {candidateAvailability} from './candidateAvailability';
const event=(createdAt:string,applicant:unknown)=>({createdAt,applicant} as CaptureEvent);
describe('horario declarado del candidato',()=>{
 it('recupera un turno anterior aunque la última respuesta solo informe jornada',()=>{
  expect(candidateAvailability([event('2026-11-01',{techCenterAnswers:{availability:'Turno tarde'}}),event('2026-11-05',{formSubmission:{answers:{workday:'Full time'},questions:[]}})])).toEqual({workday:'Full time',shift:'Turno tarde'});
 });
 it('usa etiquetas del formulario y el envío más reciente sin depender del orden',()=>{
  const recent=event('2026-11-05',{formSubmission:{answers:{availability:'am'},questions:[{id:'availability',options:[{value:'am',label:'Turno mañana'}]}]}});
  expect(candidateAvailability([recent,event('2026-11-01',{techCenterAnswers:{availability:'Turno tarde'}})]).shift).toBe('Turno mañana');
 });
 it('no confunde jornada con turno ni inventa un horario',()=>{
  expect(candidateAvailability([],'Semifull')).toEqual({workday:'Semifull',shift:'No informado en el formulario'});
 });
});
