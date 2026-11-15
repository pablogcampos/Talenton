export const activityTypes = ['Abierta','Experiencia','Competencia','Situacional','Simulación comercial','Caso práctico','Elegibilidad'] as const;
export type Competency = {id:string;name:string;description:string;category:string;behaviors:string;weight:number;rubric:[string,string,string,string]};
export type Activity = {id:string;type:typeof activityTypes[number];question:string;essential:boolean;competencyIds:string[];followup:string};
export type EvaluationConfig = {name:string;description:string;companyId:string;campaignId:string;positions:string[];category:'Operativo'|'Staff'|'Otro';minutes:number;objective:string;competencies:Competency[];activities:Activity[];instructions:string;followups:number};
export const newEvaluation = ():EvaluationConfig=>({name:'',description:'',companyId:'',campaignId:'',positions:[],category:'Operativo',minutes:5,objective:'',competencies:[],activities:[],instructions:'',followups:1});
export function validEvaluationShape(value:unknown):value is EvaluationConfig{
 const c=value as EvaluationConfig;
 const text=(v:unknown,max=4000)=>typeof v==='string'&&v.length<=max;
 return !!c&&['name','description','companyId','campaignId','objective','instructions','category'].every(k=>text(c[k as keyof EvaluationConfig]))&&Number.isInteger(c.minutes)&&Number.isInteger(c.followups)
 &&Array.isArray(c.positions)&&c.positions.length<=20&&c.positions.every(p=>text(p,150))
 &&Array.isArray(c.competencies)&&c.competencies.length<=20&&c.competencies.every(x=>x&&['id','name','description','category','behaviors'].every(k=>text(x[k as keyof Competency]))&&Number.isFinite(x.weight)&&Array.isArray(x.rubric)&&x.rubric.length===4&&x.rubric.every(r=>text(r,2000)))
 &&Array.isArray(c.activities)&&c.activities.length<=20&&c.activities.every(a=>a&&text(a.id,100)&&text(a.question,1000)&&text(a.followup)&&activityTypes.includes(a.type)&&typeof a.essential==='boolean'&&Array.isArray(a.competencyIds)&&a.competencyIds.length<=20&&a.competencyIds.every(id=>text(id,100)));
}
export function evaluationIssues(c:EvaluationConfig):string[]{
 const issues:string[]=[];
 if(!c||!Array.isArray(c.competencies)||!Array.isArray(c.activities)||!Array.isArray(c.positions))return ['Configuración inválida.'];
 if(!c.name?.trim()||c.name.length>150)issues.push('Indica un nombre de hasta 150 caracteres.');
 if(!c.companyId?.trim())issues.push('Selecciona una empresa.');
 if(!c.positions?.length||c.positions.some(p=>!p.trim()||p.length>150))issues.push('Indica al menos un puesto.');
 if(!['Operativo','Staff','Otro'].includes(c.category))issues.push('Selecciona una categoría.');
 if(!c.objective?.trim()||c.objective.length>4000)issues.push('Indica un objetivo de hasta 4000 caracteres.');
 if(typeof c.instructions!=='string'||c.instructions.length>4000||typeof c.description!=='string'||c.description.length>4000)issues.push('Las instrucciones y descripción admiten hasta 4000 caracteres.');
 if(!Number.isInteger(c.minutes)||c.minutes<3||c.minutes>20)issues.push('La duración debe ser de 3 a 20 minutos.');
 if(!Number.isInteger(c.followups)||c.followups<0||c.followups>2)issues.push('Permite entre 0 y 2 seguimientos por actividad.');
 if(!c.competencies?.length||c.competencies.length>20)issues.push('Configura entre 1 y 20 competencias.');
 const ids=new Set(c.competencies.map(x=>x.id));
 if(ids.size!==c.competencies.length)issues.push('Hay competencias duplicadas.');
 if(Math.abs(c.competencies.reduce((sum,x)=>sum+x.weight,0)-100)>0.001)issues.push('Los pesos deben sumar 100%.');
 for(const x of c.competencies){if(!x.id||typeof x.name!=='string'||!x.name.trim()||typeof x.behaviors!=='string'||!x.behaviors.trim()||!Number.isFinite(x.weight)||x.weight<=0||!Array.isArray(x.rubric)||x.rubric.length!==4||x.rubric.some(r=>typeof r!=='string'||!r.trim()||r.length>2000))issues.push(`Completa los comportamientos, peso y cuatro niveles de ${x.name||'la competencia'}.`);}
 if(!c.activities?.length||c.activities.length>20)issues.push('Configura entre 1 y 20 actividades.');
 if(new Set(c.activities.map(a=>a.id)).size!==c.activities.length)issues.push('Hay actividades duplicadas.');
 for(const a of c.activities){if(!a.id||!activityTypes.includes(a.type)||a.question.trim().length<5||a.question.length>1000)issues.push('Completa las preguntas de las actividades.');if(a.competencyIds.some(id=>!ids.has(id)))issues.push('Una actividad refiere una competencia inexistente.');if(a.type==='Elegibilidad'&&a.competencyIds.length)issues.push('La elegibilidad no se puntúa.');}
 for(const x of c.competencies)if(!c.activities.some(a=>a.type!=='Elegibilidad'&&a.competencyIds.includes(x.id)))issues.push(`Asocia una actividad a ${x.name}.`);
 return [...new Set(issues)];
}
export type EvidenceScore={competencyId:string;score:number|null;evidence:{segmentId:string;quote:string}[];justification:string;strengths:string[];followup:string[];unverified:string[]};
// Only literal candidate evidence can support a score. Missing evidence never becomes zero.
export function validateEvaluationResult(config:EvaluationConfig,input:unknown,transcript:{id:string;speaker:string;text:string}[]){
 const rows=(input as {competencies?:EvidenceScore[]})?.competencies;
 if(!Array.isArray(rows)||rows.length!==config.competencies.length)throw Error('CINTHIA_RESULT_INVALID');
 const seen=new Set<string>();
 const competencies=config.competencies.map(c=>{
  const r=rows.find(r=>r.competencyId===c.id);
  if(!r||seen.has(r.competencyId)||!(r.score===null||Number.isInteger(r.score)&&r.score>=1&&r.score<=4)||!Array.isArray(r.evidence)||typeof r.justification!=='string'||r.justification.length>3000||!['strengths','followup','unverified'].every(k=>Array.isArray(r[k as keyof EvidenceScore])&&(r[k as keyof EvidenceScore] as string[]).every(s=>typeof s==='string'&&s.length<=2000)))throw Error('CINTHIA_RESULT_INVALID');
  seen.add(c.id);
  for(const e of r.evidence)if(typeof e.quote!=='string'||!e.quote.trim()||!transcript.some(t=>t.id===e.segmentId&&t.speaker==='candidate'&&t.text.includes(e.quote)))throw Error('CINTHIA_EVIDENCE_INVALID');
  if(r.score!==null&&!r.evidence.length)throw Error('CINTHIA_EVIDENCE_REQUIRED');
  return {...r,weight:c.weight,name:c.name};
 });
 const complete=competencies.every(c=>c.score!==null);
 const declared=(input as {declared?:{topic:string;segmentId:string;quote:string}[]}).declared??[];
 if(!Array.isArray(declared)||declared.length>20||declared.some(e=>!['Experiencia','Disponibilidad'].includes(e.topic)||typeof e.quote!=='string'||!e.quote.trim()||!transcript.some(t=>t.id===e.segmentId&&t.speaker==='candidate'&&t.text.includes(e.quote))))throw Error('CINTHIA_EVIDENCE_INVALID');
 return {competencies,declared,global:complete?Math.round(competencies.reduce((s,c)=>s+c.score!*c.weight,0))/100:null,coverage:competencies.filter(c=>c.score!==null).reduce((s,c)=>s+c.weight,0),requiresHumanReview:true};
}
