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
it('covers future topics only from literal candidate evidence and skips them later',()=>{
 const f=new QuestionFlow(['Experiencia','Disponibilidad','Motivación']);const transcript=[{speaker:'candidate',text:'Trabajé dos años en ventas y tengo disponibilidad por las tardes.'}];
 expect(f.cover(2,'disponibilidad por las tardes',transcript).accepted).toBe(true);
 f.record(1,'UNDERSTOOD',70);expect(f.progress.index).toBe(2);
 expect(f.cover(3,'me gusta aprender',transcript).accepted).toBe(false);
 expect(f.cover(3,'Me motiva crecer',[{speaker:'cinthia',text:'Me motiva crecer'}]).accepted).toBe(false);
});
it('rejects single-letter fragments and clarification requests without rejecting yes/no',async()=>{
 const {meaningfulAnswer}=await import('../src/cinthiaQuestionFlow');
 for(const text of ['C','A','¿Qué?','¿En dónde?','eh'])expect(meaningfulAnswer(text)).toBe(false);
 for(const text of ['Sí','No','Sin experiencia','Disponibilidad completa'])expect(meaningfulAnswer(text)).toBe(true);
});
it('off-topic and interview questions never consume clarification or advance',()=>{
 const f=new QuestionFlow(['Experiencia']);
 f.record(1,'OFF_TOPIC',30);expect(f.progress.index).toBe(0);expect(f.progress.retry).toBe(0);expect(f.progress.results).toEqual([]);
 f.record(1,'UNCLEAR',40);expect(f.progress.retry).toBe(1);
 f.record(1,'INTERVIEW_QUESTION',70);f.record(1,'OFF_TOPIC',100);expect(f.progress.retry).toBe(1);expect(f.done).toBe(false);
 f.record(1,'UNDERSTOOD',150);expect(f.done).toBe(true);
});
