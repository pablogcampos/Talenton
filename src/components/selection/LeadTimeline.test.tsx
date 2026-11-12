import {describe,it,expect} from 'vitest';
import {elapsed,leadTimes} from './LeadTimeline';
describe('lead timing',()=>{
 it('keeps the state clock across note updates and preserves the first take',()=>{
 const take={id:1,action:'TAKE',previous_status:'NUEVO',new_status:'EN_GESTION',created_at:'2026-11-12T14:01:00Z',notes:'',actor_name:'Reclutador'};
 const change={...take,id:2,action:'UPDATE',previous_status:'EN_GESTION',new_status:'CONTACTADO',created_at:'2026-11-12T14:04:00Z'};
 const notes={...change,id:3,previous_status:'CONTACTADO',created_at:'2026-11-12T14:05:00Z'};
 const timing=leadTimes({received_at:'2026-11-12T14:00:00Z',occurred_at:null,status:'CONTACTADO',history:[take,change,notes]});
 expect(timing.take).toEqual(take);expect(timing.stateAt).toBe(change.created_at);expect(elapsed(timing.stateAt!,Date.parse(notes.created_at))).toBe('00:01:00');
 });
 it('handles days and missing dates without inventing generation or past transitions',()=>{
 expect(elapsed('2026-11-10T14:00:00Z',Date.parse('2026-11-12T14:01:05Z'))).toBe('2 d 00:01:05');
 expect(elapsed('invalid',Date.now())).toBe('No disponible');
 expect(leadTimes({received_at:'2026-11-12T14:00:00Z',occurred_at:null,status:'CONTACTADO'}).stateAt).toBeNull();
 });
});
