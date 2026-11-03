import {describe, it, expect} from 'vitest';
import {limaDay, trainingDayNumber, trainingEvaluationsApproved, unlockIsActive} from '../../shared/trainingRules';
describe('reglas del piloto de Formación', () => {
 it('conserva el día peruano después de las 19:00', () => {
  expect(limaDay(new Date('2026-11-04T01:00:00Z'))).toBe('2026-11-03');
  expect(limaDay(new Date('2026-11-04T02:30:00Z'))).toBe('2026-11-03');
 });
 it('numera días calendario sin excluir sábados ni limitar a doce sesiones', () => {
  expect(trainingDayNumber('2026-10-26','2026-10-31')).toBe(6);
  expect(trainingDayNumber('2026-10-26','2026-11-13')).toBe(19);
 });
 it('exige todas las evaluaciones configuradas, con notas válidas', () => {
  const config=[{id:'a',name:'A',maxScore:20,minScore:16},{id:'b',name:'B',maxScore:100,minScore:80}];
  const first={evaluationId:'a',score:20,maxScore:20,result:'APROBADO'};
  expect(trainingEvaluationsApproved([], [first])).toBe(false);
  expect(trainingEvaluationsApproved(config, [first])).toBe(false);
  expect(trainingEvaluationsApproved(config, [first,{evaluationId:'b',score:0,maxScore:100,result:'APROBADO'}])).toBe(false);
  expect(trainingEvaluationsApproved(config, [first,{definitionId:'b',score:80,maxScore:100}])).toBe(true);
 });
 it('no acepta desbloqueos futuros ni vencidos', () => {
  const unlock={status:'APROBADA',decidedAt:'2026-11-03T20:00:00Z',expiresAt:'2026-11-03T20:30:00Z'};
  expect(unlockIsActive(unlock,Date.parse('2026-11-03T19:59:59Z'))).toBe(false);
  expect(unlockIsActive(unlock,Date.parse(unlock.decidedAt))).toBe(true);
  expect(unlockIsActive(unlock,Date.parse(unlock.expiresAt))).toBe(false);
 });
});
