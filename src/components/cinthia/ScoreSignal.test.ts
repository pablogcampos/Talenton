import {expect,it} from 'vitest';
import {scoreSignal} from './ScoreSignal';
it('colors normalized rubric scores and keeps incomplete evidence neutral',()=>{
 expect(scoreSignal(4).label).toBe('Verde · 100/100');
 expect(scoreSignal(3).label).toBe('Ámbar · 67/100');
 expect(scoreSignal(2).label).toBe('Rojo · 33/100');
 expect(scoreSignal(4,50).label).toContain('Sin evidencia');
 expect(scoreSignal(null).label).toContain('pendiente');
});
