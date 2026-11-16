import {it,expect} from 'vitest';
import {communicationTrial,voicebotDefault} from '../../shared/cinthiaTemplates';
import {evaluationIssues} from '../../shared/cinthiaEvaluation';
it('communication trial has two essential activities, three-minute cap and auditable weights',()=>{
 const config=communicationTrial('qa');expect(evaluationIssues(config)).toEqual([]);expect(config.minutes).toBe(3);expect(config.followups).toBe(0);expect(config.activities).toHaveLength(2);expect(config.activities.every(a=>a.essential)).toBe(true);expect(config.competencies.map(c=>c.name)).toEqual(['Claridad del mensaje','Coherencia','Cohesión']);expect(config.description).toContain('no se califican automáticamente');
});
it('default preserves original questions and keeps eligibility unscored',()=>{
 const questions=['¿Cuál es tu disponibilidad?','Cuéntame tu experiencia laboral.'];const config=voicebotDefault('qa',questions);expect(config.activities.map(a=>a.question)).toEqual(questions);expect(config.activities[0].competencyIds).toEqual([]);expect(evaluationIssues(config)).toEqual([]);
});
