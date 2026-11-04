import {describe,it,expect} from 'vitest';
import {normalizeOfferWorkday} from '../../../shared/offerWorkdays';
describe('jornadas de propuestas',()=>{
 it('reconoce respuestas históricas y valores del perfil',()=>{
  for(const value of ['Full time','FULL_TIME','Fulltime'])expect(normalizeOfferWorkday(value)).toBe('FULL_TIME');
  for(const value of ['Semi full','Semifull','SEMIFUL'])expect(normalizeOfferWorkday(value)).toBe('SEMI_FULL');
  for(const value of ['Part','Part time','PART_TIME'])expect(normalizeOfferWorkday(value)).toBe('PART_TIME');
 });
 it('no interpreta turno, modalidad ni datos ausentes como jornada',()=>{
  for(const value of ['',undefined,null,'Turno mañana','Turno tarde','Presencial','Full time / Part time'])expect(normalizeOfferWorkday(value)).toBeUndefined();
 });
});
