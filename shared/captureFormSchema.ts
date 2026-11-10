import {type CaptureCampaignConfig, type PublicCaptureConfig, validateCaptureCampaignConfig} from './captureCampaignConfig';
import {techCenterSections, optionValue, optionLabel, companyText} from './techCenterForm';

export const questionTypes = {short:'Texto corto', long:'Texto largo', number:'Número', single:'Respuesta única', multiple:'Respuesta múltiple', select:'Lista desplegable', email:'Correo electrónico', tel:'Teléfono', date:'Fecha', file:'Adjuntar documento'} as const;
export type QuestionType = keyof typeof questionTypes;
export type FormAnswer = string | string[];
export type FormAnswers = Record<string,FormAnswer>;
export type FormQuestion = {
  id:string; label:string; section:string; type:QuestionType; required:boolean; hint?:string;
  options?:{value:string;label:string}[]; min?:number; max?:number; maxLength?:number;
  condition?:{field:string; value:string; operator:'equals'|'notEquals'|'includes'};
};
export type CaptureForm = {title:string; description:string; questions:FormQuestion[]};
export type CaptureFormBundle = {configuration:CaptureCampaignConfig; form:CaptureForm};
export const protectedQuestions = ['documentType','documentNumber','fullName','age','district','phone','email','preferredCampaign','workday','availability','modality'];
export const sensitiveQuestionIds = ['pregnancy','children','disability','disabilityDetails','conadis'] as const;
const conditionMap:Record<string,FormQuestion['condition']>={
  experienceMonths:{field:'contactCenterExperience',value:'Sí',operator:'equals'},
  experienceDetails:{field:'contactCenterExperience',value:'Sí',operator:'equals'},
  commitmentsDetails:{field:'commitments',value:'Sí (indicar disponibilidad)',operator:'equals'},
  computer:{field:'modality',value:'Remota',operator:'equals'},
  usbHeadset:{field:'modality',value:'Remota',operator:'equals'},
  internet:{field:'modality',value:'Remota',operator:'equals'},
  adjustmentDetails:{field:'adjustments',value:'Sí',operator:'equals'},
  disabilityDetails:{field:'disability',value:'Sí',operator:'equals'},
};
export function defaultCaptureForm():CaptureForm {
  const original=techCenterSections.flatMap(s=>s.fields.map(f=>({
    id:f.key,label:f.label,section:s.title,type:(f.options?'select':f.type==='textarea'?'long':f.type||'short') as QuestionType,
    required:!!f.required,...(f.hint?{hint:f.hint}:{}),
    ...(f.options?{options:f.options.map(o=>({value:optionValue(o),label:optionLabel(o)}))}:{}),
    ...(f.max?{maxLength:f.max}:{}),...(f.minValue!==undefined?{min:f.minValue}:{}),...(f.maxValue!==undefined?{max:f.maxValue}:{}),
    ...(conditionMap[f.key]?{condition:conditionMap[f.key]}:{})
  })));
  const existing=(id:string,patch:Partial<FormQuestion>={}):FormQuestion=>({...original.find(q=>q.id===id)!,...patch});
  const extra=(id:string,label:string,section:string,type:QuestionType,required=false,options?:string[]):FormQuestion=>({id,label,section,type,required,...(options?{options:options.map(value=>({value,label:value}))}:{})});
  const personal='1. DATOS PERSONALES', experience='2. EXPERIENCIA LABORAL', availability='3. POSTULACIÓN Y DISPONIBILIDAD', inclusion='5. INCLUSIÓN Y ACCESIBILIDAD';
  const questions:FormQuestion[]=[
    existing('documentType',{label:'TIPO DE DOCUMENTO'}),
    existing('documentNumber',{label:'NÚMERO DE DOCUMENTO DE IDENTIDAD'}),
    existing('age',{label:'INDICA TU EDAD'}),
    existing('fullName',{label:'NOMBRES Y APELLIDOS COMPLETOS ( EN MAYÚSCULA )'}),
    existing('contactCenterExperience',{label:'CUENTAS CON EXPERIENCIA EN CALL CENTER',type:'single'}),
    existing('experienceDetails',{label:'EN CASO CUENTES CON EXPERIENCIA, INDICANOS CUÁNTO TIEMPO Y PARA QUÉ CAMPAÑAS LABORASTE',type:'short',maxLength:240}),
    extra('reentry','ERES REINGRESO',experience,'single',true,['Sí','No']),
    extra('birthDate','FECHA DE NACIMIENTO',personal,'date',true),
    existing('district',{label:'PROVINCIA / DISTRITO'}),
    existing('addressReference',{label:'DIRECCIÓN DE DOMICILIO',required:true}),
    existing('phone',{label:'TU NÚMERO DE CELULAR / WHATSAPP'}),
    existing('email',{label:'CORREO ELECTRONICO'}),
    extra('pregnancy','¿TE ENCUENTRAS EN ESTADO DE GESTACIÓN?',inclusion,'short'),
    extra('children','¿TIENES HIJOS ? SI ES ASÍ, ¿QUE EDAD TIENEN?',inclusion,'short'),
    extra('disability','¿CUENTAS CON ALGUNA DISCAPACIDAD O ENFERMEDAD?',inclusion,'single',false,['Sí','No']),
    {...extra('disabilityDetails','SI PRESENTAS ALGUNA DISCAPACIDAD, O ENFERMEDAD DETALLANOS CUÁL ES',inclusion,'short'),condition:conditionMap.disabilityDetails},
    existing('conadis',{label:'¿CUENTAS CON CARNET DE CONADIS?',type:'single'}),
    existing('education',{label:'GRADO DE INSTRUCCIÓN',type:'single',options:['Secundaria incompleta','Secundaria completa','Técnico en curso','Técnico completo','Universitario en curso','Bachiller','Titulado(a)'].map(value=>({value,label:value}))}),
    existing('preferredCampaign',{label:'SERVICIO',type:'single'}),
    existing('workday',{label:'DISPONIBILIDAD DE HORARIO',type:'single'}),
    existing('availability',{label:'HORARIO DE TRABAJO'}),
    extra('contractType','TIPO DE CONTRTO',availability,'single',true,['PLANILLA MICRO']),
    extra('workOrStudy','¿TE ENCUENTRAS TRABAJANDO O ESTUDIANDO? DE SER EL CASO, INDICANOS EL HORARIO',availability,'short',true),
    existing('modality',{label:'MODALIDAD DE TRABAJO',type:'single'}),
    existing('computer',{label:'¿CUENTAS CON PC O LAPTOP?',type:'short',options:undefined}),
    existing('usbHeadset',{label:'¿CUENTAS CON AURICULARES CON ENTRADA USB?',type:'short',options:undefined}),
    existing('internet',{label:'¿CUENTAS CON CONEXIÓN A INTERNET YA SEA INALAMBRICO O POR CABLE?',type:'short',options:undefined}),
  ];
  return {title:'Formulario de registro de postulantes',description:'Responde con información verídica. Los campos obligatorios están identificados con (*).',
    questions:questions.map(q=>({...q,section:'Datos del postulante'}))};
}
const str=(x:unknown,max:number,required=true):string=>{
  if(typeof x!=='string'||x.length>max||required&&!x.trim())throw new Error('Revisa los textos del formulario.');
  return x.normalize('NFKC').trim();
};
export function validateCaptureForm(raw:unknown):CaptureForm {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Formulario inválido.');
  const v=raw as Record<string,unknown>;
  if(!Array.isArray(v.questions)||!v.questions.length||v.questions.length>60)throw new Error('El formulario admite hasta 60 preguntas.');
  const ids=new Set<string>();
  const questions:FormQuestion[]=v.questions.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Pregunta inválida.');
    const q=raw as FormQuestion;
    if(!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(q.id)||['__proto__','constructor','prototype','privacyAcknowledged','requestId','website','turnstileToken','formRevision'].includes(q.id)||ids.has(q.id))throw new Error('Identificador de pregunta inválido o duplicado.');
    ids.add(q.id);
    if(!Object.hasOwn(questionTypes,q.type)||typeof q.required!=='boolean')throw new Error('Tipo de pregunta inválido.');
    const out:FormQuestion={id:q.id,label:str(q.label,240),section:str(q.section,100),type:q.type,required:q.required};
    if(q.hint)out.hint=str(q.hint,500);
    if(['single','multiple','select'].includes(q.type)){
      if(!Array.isArray(q.options)||!q.options.length||q.options.length>40)throw new Error('Define entre 1 y 40 alternativas.');
      out.options=q.options.map(o=>({value:str(o.value,160),label:str(o.label,160)}));
      if(new Set(out.options.map(o=>o.value)).size!==out.options.length)throw new Error('Las alternativas no deben repetirse.');
    }
    for(const key of ['min','max'] as const)if(q[key]!==undefined){
      if(typeof q[key]!=='number'||!Number.isFinite(q[key])||Math.abs(q[key]!)>1e9)throw new Error('Límite numérico inválido.');
      out[key]=q[key];
    }
    if(out.min!==undefined&&out.max!==undefined&&out.min>out.max)throw new Error('El mínimo supera al máximo.');
    if(q.maxLength!==undefined){
      if(!Number.isInteger(q.maxLength)||q.maxLength<1||q.maxLength>4000)throw new Error('Longitud máxima: entre 1 y 4000.');
      out.maxLength=q.maxLength;
    }
    if(q.condition){
      if(!['equals','notEquals','includes'].includes(q.condition.operator))throw new Error('Condición inválida.');
      out.condition={field:str(q.condition.field,64),value:str(q.condition.value,160),operator:q.condition.operator};
    }
    return out;
  });
  const baseline=defaultCaptureForm().questions;
  for(const id of protectedQuestions){
    const q=questions.find(q=>q.id===id),base=baseline.find(q=>q.id===id)!;
    // Radio buttons and dropdowns both persist one string; legacy published forms use both.
    const compatible=q&&(q.type===base.type||(['single','select'].includes(q.type)&&['single','select'].includes(base.type)));
    if(!q||!compatible||!q.required||q.condition)throw new Error('Conserva el campo obligatorio de sistema: '+id);
    if(id==='documentType'&&JSON.stringify(q.options)!==JSON.stringify(base.options))throw new Error('Conserva los tipos de documento del sistema.');
  }
  // Only previous questions can be referenced: no cycles or conditions on hidden descendants.
  for(let i=0;i<questions.length;i++){
    const q=questions[i];if(!q.condition)continue;
    const parent=questions.slice(0,i).find(p=>p.id===q.condition!.field);
    if(!parent||parent.type==='file')throw new Error('La condición debe referirse a una pregunta anterior.');
    if(parent.options&&!parent.options.some(o=>o.value===q.condition!.value))throw new Error('La condición usa una alternativa inexistente.');
  }
  for(const id of ['computer','usbHeadset','internet']){
    const q=questions.find(q=>q.id===id);
    if(q&&JSON.stringify(q.condition)!==JSON.stringify(conditionMap[id]))throw new Error('Las preguntas de equipos deben depender de modalidad Remota.');
  }
  const conadis=questions.find(q=>q.id==='conadis');
  if(conadis&&(conadis.required||!['select','single'].includes(conadis.type)||JSON.stringify(conadis.options?.map(o=>o.value))!==JSON.stringify(['Sí','No'])))throw new Error('CONADIS debe ser voluntario y tener respuestas Sí/No.');
  for(const id of sensitiveQuestionIds){
    const q=questions.find(q=>q.id===id);
    if(q?.required)throw new Error('Las preguntas sensibles deben ser voluntarias: '+id);
  }
  const details=questions.find(q=>q.id==='disabilityDetails');
  if(details&&JSON.stringify(details.condition)!==JSON.stringify(conditionMap.disabilityDetails))throw new Error('El detalle de salud solo debe mostrarse tras una respuesta afirmativa.');
  if(questions.filter(q=>q.type==='file').length>3)throw new Error('Máximo 3 preguntas de adjuntos por formulario.');
  return {title:str(v.title,160),description:str(v.description??'',2000,false),questions};
}
export function validateFormBundle(raw:unknown):CaptureFormBundle{
  const v=raw as CaptureFormBundle;
  return {configuration:validateCaptureCampaignConfig(v?.configuration),form:validateCaptureForm(v?.form)};
}
export function effectiveQuestions(form:CaptureForm,config:PublicCaptureConfig,campaign:{id:string;name:string},companyName:string):FormQuestion[]{
  return form.questions.map(q=>{
    const out={...q,label:companyText(q.label,companyName)};
    if(q.id==='age'){out.min=config.minAge;out.max=config.maxAge??120;out.hint=config.maxAge==null?'Edad mínima: '+config.minAge+' años.':'Rango permitido: '+config.minAge+'–'+config.maxAge+' años.';}
    const options=q.id==='workday'?config.workdays:q.id==='availability'?config.schedules:q.id==='modality'?['Presencial','Remota']:undefined;
    if(q.id==='modality')out.label='MODALIDAD DE TRABAJO PREFERIDA (SUJETA A DISPONIBILIDAD DE LA CAMPAÑA)';
    if(options)out.options=options.map(v=>({value:v,label:q.id==='modality'?(v==='Remota'?'Remoto':'Presencial'):q.id==='workday'?v.toUpperCase():v}));
    if(q.id==='availability')out.type='select';
    if(q.id==='preferredCampaign')out.options=[{value:campaign.id,label:campaign.name}];
    return out;
  });
}
export function visibleQuestions(questions:FormQuestion[],values:Record<string,unknown>):FormQuestion[]{
  const visible=new Set<string>();
  return questions.filter(q=>{
    const c=q.condition;
    if(c){
      if(!visible.has(c.field))return false;
      const answer=values[c.field];
      if(answer===undefined||answer===''||Array.isArray(answer)&&!answer.length)return false;
      const match=c.operator==='includes'?Array.isArray(answer)&&answer.includes(c.value):c.operator==='equals'?answer===c.value:answer!==c.value;
      if(!match)return false;
    }
    visible.add(q.id);return true;
  });
}
export function validateFormAnswers(questions:FormQuestion[],raw:Record<string,unknown>,fileIds:Set<string>=new Set()):FormAnswers{
  const answers:FormAnswers={};
  for(const q of visibleQuestions(questions,raw)){
    const fail=()=>{throw new Error('Revisa: '+q.label);};
    if(q.type==='file'){if(q.required&&!fileIds.has(q.id))fail();continue;}
    const v=raw[q.id];
    if(q.type==='multiple'){
      if(v===undefined||Array.isArray(v)&&!v.length){if(q.required)fail();continue;}
      if(!Array.isArray(v)||v.length>40||v.some(x=>typeof x!=='string'||!q.options?.some(o=>o.value===x))||new Set(v).size!==v.length)fail();
      answers[q.id]=[...(v as string[])].sort();continue;
    }
    if(v===undefined||v===''){if(q.required)fail();continue;}
    if(typeof v!=='string')fail();
    const value=(v as string).normalize('NFKC').trim();
    if(!value){if(q.required)fail();continue;}
    if(value.length>(q.maxLength??(q.type==='long'?4000:240)))fail();
    if(q.options&&!q.options.some(o=>o.value===value))fail();
    if(q.type==='number'&&(!/^-?\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value))||q.min!==undefined&&Number(value)<q.min||q.max!==undefined&&Number(value)>q.max))fail();
    if(['age','experienceMonths'].includes(q.id)&&(!/^\d+$/.test(value)||q.id==='experienceMonths'&&Number(value)<1))fail();
    if(q.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail();
    if(q.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))fail();
    answers[q.id]=value;
  }
  return answers;
}
