export type QuestionProgress={index:number;retry:number;consumed:number;speechConsumed:number;results:{question:number;outcome:'UNDERSTOOD'|'UNANSWERED'}[]};
export class QuestionFlow{
 progress:QuestionProgress;
 constructor(public questions:string[],saved?:Partial<QuestionProgress>){this.progress={index:0,retry:0,consumed:0,speechConsumed:0,results:[],...saved};}
 get done(){return this.progress.index>=this.questions.length;}
 get instruction(){return this.done?'Todas las preguntas terminaron. Agradece brevemente y despídete. No hagas más preguntas.':`Tema pendiente ${this.progress.index+1}: ${this.questions[this.progress.index]}. ${this.progress.retry?'Es la única repregunta permitida: reformúlala una vez.':'Conecta este tema naturalmente con lo que ya dijo, sin leer literalmente ni repetir información.'}`;}
 cover(question:number,evidence:unknown,transcript:{speaker:string;text:string}[]){
  if(!Number.isInteger(question)||question<1||question>this.questions.length||this.progress.results.some(r=>r.question===question))return {accepted:false,instruction:this.instruction};
  if(typeof evidence!=='string'||!meaningfulAnswer(evidence)||!transcript.some(s=>s.speaker==='candidate'&&s.text.toLocaleLowerCase().includes(evidence.trim().toLocaleLowerCase())))return {accepted:false,instruction:'No hay una respuesta suficiente y verificable para este tema. '+this.instruction};
  this.progress.results.push({question,outcome:'UNDERSTOOD'});
  while(this.progress.results.some(r=>r.question===this.progress.index+1)){this.progress.index++;this.progress.retry=0;}
  return {accepted:true,finished:this.done,instruction:this.instruction};
 }
 record(question:number,outcome:unknown,candidateLength:number,speechVersion=0){
  if(this.done||question!==this.progress.index+1)return {accepted:false,instruction:this.instruction};
  if(!['UNDERSTOOD','UNCLEAR','OFF_TOPIC','INTERVIEW_QUESTION'].includes(String(outcome))||(candidateLength<=this.progress.consumed&&speechVersion<=this.progress.speechConsumed))return {accepted:false,instruction:'Escucha la respuesta antes de registrar el resultado. '+this.instruction};
  this.progress.consumed=candidateLength;this.progress.speechConsumed=speechVersion;
  if(outcome==='OFF_TOPIC'||outcome==='INTERVIEW_QUESTION')return {accepted:true,finished:false,instruction:(outcome==='OFF_TOPIC'?'No respondas el contenido ajeno. Redirige brevemente sin reiniciar el saludo. ':'Responde sólo la duda sobre la entrevista con información conocida; no inventes condiciones laborales. ')+this.instruction};
  if(outcome==='UNCLEAR'&&this.progress.retry===0)this.progress.retry=1;
  else{this.progress.results.push({question,outcome:outcome==='UNDERSTOOD'?'UNDERSTOOD':'UNANSWERED'});this.progress.index++;while(this.progress.results.some(r=>r.question===this.progress.index+1))this.progress.index++;this.progress.retry=0;}
  return {accepted:true,finished:this.done,instruction:this.instruction};
 }
}
export function meaningfulAnswer(text:string){const t=text.trim().toLocaleLowerCase().replace(/[¿?¡!.,]/g,'');return t.length>=2&&!['ah','eh','qué','que','en dónde','en donde','cómo','como','no entendí','no entendi','repite'].includes(t);}
export const questionTool={functionDeclarations:[{name:'record_answer',description:'Registra si se comprendió la respuesta de la pregunta actual. No evalúa aptitud. OFF_TOPIC para consultas ajenas al trabajo/entrevista; INTERVIEW_QUESTION para dudas laborales o sobre el proceso. Ninguna consume la repregunta ni avanza. Usar antes de repreguntar o pasar a otra pregunta.',parameters:{type:'OBJECT',properties:{question:{type:'INTEGER'},outcome:{type:'STRING',enum:['UNDERSTOOD','UNCLEAR','OFF_TOPIC','INTERVIEW_QUESTION']}},required:['question','outcome']}},{name:'cover_topic',description:'Marca un tema cubierto por una respuesta anterior suficiente. Incluye una cita literal del postulante; nunca uses antecedentes del Voicebot ni texto de CinthIA. Puedes cubrir varios temas sin volver a preguntarlos.',parameters:{type:'OBJECT',properties:{question:{type:'INTEGER'},evidence:{type:'STRING'}},required:['question','evidence']}}]};
