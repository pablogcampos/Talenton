export type QuestionProgress={index:number;retry:number;consumed:number;speechConsumed:number;results:{question:number;outcome:'UNDERSTOOD'|'UNANSWERED'}[]};
export class QuestionFlow{
 progress:QuestionProgress;
 constructor(public questions:string[],saved?:Partial<QuestionProgress>){this.progress={index:0,retry:0,consumed:0,speechConsumed:0,results:[],...saved};}
 get done(){return this.progress.index>=this.questions.length;}
 get instruction(){return this.done?'Todas las preguntas terminaron. Agradece brevemente y despídete. No hagas más preguntas.':`Pregunta ${this.progress.index+1}: ${this.questions[this.progress.index]}. ${this.progress.retry?'Es la única repregunta permitida: reformúlala una vez.':'Haz sólo esta pregunta.'}`;}
 record(question:number,outcome:unknown,candidateLength:number,speechVersion=0){
  if(this.done||question!==this.progress.index+1)return {accepted:false,instruction:this.instruction};
  if(!['UNDERSTOOD','UNCLEAR'].includes(String(outcome))||(candidateLength<=this.progress.consumed&&speechVersion<=this.progress.speechConsumed))return {accepted:false,instruction:'Escucha la respuesta antes de registrar el resultado. '+this.instruction};
  this.progress.consumed=candidateLength;this.progress.speechConsumed=speechVersion;
  if(outcome==='UNCLEAR'&&this.progress.retry===0)this.progress.retry=1;
  else{this.progress.results.push({question,outcome:outcome==='UNDERSTOOD'?'UNDERSTOOD':'UNANSWERED'});this.progress.index++;this.progress.retry=0;}
  return {accepted:true,finished:this.done,instruction:this.instruction};
 }
}
export const questionTool={functionDeclarations:[{name:'record_answer',description:'Registra si se comprendió la respuesta de la pregunta actual. No evalúa aptitud. Usar antes de repreguntar o pasar a otra pregunta.',parameters:{type:'OBJECT',properties:{question:{type:'INTEGER'},outcome:{type:'STRING',enum:['UNDERSTOOD','UNCLEAR']}},required:['question','outcome']}}]};
