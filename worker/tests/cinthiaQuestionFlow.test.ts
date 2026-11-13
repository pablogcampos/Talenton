import {it,expect} from 'vitest';
import {QuestionFlow} from '../src/cinthiaQuestionFlow';
it('allows exactly one clarification, then advances without inventing an answer',()=>{
 const f=new QuestionFlow(['Experiencia','Disponibilidad']);
 expect(f.record(1,'UNCLEAR',10)).toMatchObject({accepted:true,finished:false});expect(f.progress.retry).toBe(1);
 expect(f.record(1,'UNCLEAR',20)).toMatchObject({accepted:true,finished:false});expect(f.progress.index).toBe(1);expect(f.progress.results[0].outcome).toBe('UNANSWERED');
 expect(f.record(2,'UNDERSTOOD',35)).toMatchObject({finished:true});
});
it('ignores duplicate results, wrong questions and calls without candidate speech',()=>{
 const f=new QuestionFlow(['Experiencia','Disponibilidad']);
 expect(f.record(1,'UNDERSTOOD',0).accepted).toBe(false);expect(f.record(2,'UNDERSTOOD',10).accepted).toBe(false);
 f.record(1,'UNCLEAR',10);expect(f.record(1,'UNCLEAR',10).accepted).toBe(false);expect(f.progress.index).toBe(0);
});
it('restores the question and clarification counter after a pause',()=>{
 const f=new QuestionFlow(['Experiencia','Disponibilidad']);f.record(1,'UNCLEAR',10);
 const resumed=new QuestionFlow(f.questions,JSON.parse(JSON.stringify(f.progress)));resumed.record(1,'UNCLEAR',20);expect(resumed.progress.index).toBe(1);
});
it('untranscribed speech permits one clarification, never a completion based on silence',()=>{
 const f=new QuestionFlow(['Pregunta uno','Pregunta dos']);
 expect(f.record(1,'UNCLEAR',0,0).accepted).toBe(false);
 f.record(1,'UNCLEAR',0,1);expect(f.progress.retry).toBe(1);
 expect(f.record(1,'UNCLEAR',0,1).accepted).toBe(false);
 f.record(1,'UNCLEAR',0,2);expect(f.progress.index).toBe(1);expect(f.done).toBe(false);
});
