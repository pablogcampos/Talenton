import {describe,it,expect} from 'vitest';
import {defaultCaptureForm,validateCaptureForm,validateFormAnswers,effectiveQuestions,visibleQuestions,sensitiveQuestionIds,type FormQuestion} from '../../shared/captureFormSchema';
import {verifyCaptureFile,readCaptureSubmission} from '../src/captureAttachments';
import {publicCaptureConfig} from '../../shared/captureCampaignConfig';
const configuration={minAge:18,maxAge:60,workdays:['Full time'],schedules:['Turno mañana','Turno tarde'],modality:'Presencial' as const};
const custom=(type:FormQuestion['type'],extra:Partial<FormQuestion>={}):FormQuestion=>({id:'custom',label:'Pregunta',section:'Extra',type,required:true,...extra});
describe('Editor de formularios',()=>{
 it('acepta desplegables históricos sin debilitar los campos protegidos',()=>{
  const form=defaultCaptureForm();
  const legacy={...form,questions:form.questions.map(q=>q.id==='preferredCampaign'?{...q,type:'select' as const}:q)};
  expect(validateCaptureForm(legacy).questions.find(q=>q.id==='preferredCampaign')?.type).toBe('select');
  for(const patch of [{type:'multiple'},{type:'short'},{required:false},{condition:{field:'fullName',operator:'equals',value:'x'}}]){
   expect(()=>validateCaptureForm({...legacy,questions:legacy.questions.map(q=>q.id==='preferredCampaign'?{...q,...patch}:q)})).toThrow();
  }
 });
 it('la plantilla conserva el orden solicitado, condiciones y campos del sistema',()=>{
  const f=validateCaptureForm(defaultCaptureForm());
  expect(f.questions).toHaveLength(27);
  expect(f.questions.map(q=>q.id)).toEqual(['documentType','documentNumber','age','fullName','contactCenterExperience','experienceDetails','reentry','birthDate','district','addressReference','phone','email','pregnancy','children','disability','disabilityDetails','conadis','education','preferredCampaign','workday','availability','contractType','workOrStudy','modality','computer','usbHeadset','internet']);
  const q=effectiveQuestions(f,configuration,{id:'campaign',name:'Campaña'},'Konectados');
  expect(q.find(q=>q.id==='preferredCampaign')?.options).toEqual([{value:'campaign',label:'Campaña'}]);
  expect(q.find(q=>q.id==='age')).toMatchObject({min:18,max:60});
  expect(q.find(q=>q.id==='workday')?.options).toEqual([{value:'Full time',label:'FULL TIME'}]);
  expect(q.find(q=>q.id==='availability')?.options?.map(o=>o.value)).toEqual(['Turno mañana','Turno tarde']);
  expect(visibleQuestions(q,{modality:'Presencial'}).some(q=>q.id==='computer')).toBe(false);
  expect(visibleQuestions(q,{contactCenterExperience:'No',disability:'No'}).some(q=>q.id==='disabilityDetails')).toBe(false);
  expect(sensitiveQuestionIds.every(id=>f.questions.find(q=>q.id===id)?.required===false)).toBe(true);
 });
 it('todas las campañas preguntan preferencia presencial o remota, sin imponer la modalidad configurada',()=>{
  for(const config of [publicCaptureConfig(null)!,configuration,{...configuration,modality:'Remota' as const}]){
   const questions=effectiveQuestions(defaultCaptureForm(),config,{id:'talent-up:bitel-migraciones',name:'Migraciones Bitel'},'Talent Up');
   expect(questions.find(q=>q.id==='modality')).toMatchObject({options:[{value:'Presencial',label:'Presencial'},{value:'Remota',label:'Remoto'}]});
   expect(questions.find(q=>q.id==='modality')?.label).toContain('PREFERIDA');
   expect(validateFormAnswers(questions.filter(q=>q.id==='modality'),{modality:'Remota'})).toEqual({modality:'Remota'});
   expect(validateFormAnswers(questions.filter(q=>q.id==='modality'),{modality:'Presencial'})).toEqual({modality:'Presencial'});
   expect(visibleQuestions(questions,{modality:'Remota'}).some(q=>q.id==='computer')).toBe(true);
   expect(visibleQuestions(questions,{modality:'Presencial'}).some(q=>q.id==='computer')).toBe(false);
  }
 });
 it('no permite borrar identidad, duplicar IDs, ciclos, condiciones inválidas ni CONADIS obligatorio',()=>{
  const f=defaultCaptureForm();
  for(const questions of [f.questions.filter(q=>q.id!=='documentNumber'),[...f.questions,f.questions[0]],f.questions.map(q=>q.id==='fullName'?{...q,required:false}:q),f.questions.map(q=>q.id==='conadis'?{...q,required:true}:q),f.questions.map(q=>q.id==='pregnancy'?{...q,required:true}:q),[...f.questions,custom('short',{condition:{field:'custom',operator:'equals',value:'Sí'}})],f.questions.map(q=>q.id==='computer'?{...q,condition:undefined}:q)])
   expect(()=>validateCaptureForm({...f,questions})).toThrow();
 });
 it('tipos corto, largo, número, email, fecha y teléfono',()=>{
  expect(validateFormAnswers([custom('short')],{custom:' Hola '})).toEqual({custom:'Hola'});
  expect(()=>validateFormAnswers([custom('long',{maxLength:5})],{custom:'demasiado'})).toThrow();
  expect(validateFormAnswers([custom('number',{min:0,max:10})],{custom:'3.5'})).toEqual({custom:'3.5'});
  for(const value of ['NaN','11','-1','1e4'])expect(()=>validateFormAnswers([custom('number',{min:0,max:10})],{custom:value})).toThrow();
  expect(()=>validateFormAnswers([custom('email')],{custom:'no-email'})).toThrow();
  expect(()=>validateFormAnswers([custom('date')],{custom:'2026-02-30'})).toThrow();
  expect(validateFormAnswers([custom('date')],{custom:'2026-10-13'})).toEqual({custom:'2026-10-13'});
 });
 it('selección única y múltiple: allowlist, sin duplicados ni cambio de tipo',()=>{
  const options=[{value:'a',label:'A'},{value:'b',label:'B'}];
  expect(validateFormAnswers([custom('multiple',{options})],{custom:['b','a']})).toEqual({custom:['a','b']});
  for(const value of ['a',['x'],['a','a'],[]])expect(()=>validateFormAnswers([custom('multiple',{options})],{custom:value})).toThrow();
  expect(validateFormAnswers([custom('single',{options})],{custom:'a'})).toEqual({custom:'a'});
  expect(()=>validateFormAnswers([custom('select',{options})],{custom:['a']})).toThrow();
 });
 it('condiciones descartan respuestas ocultas y sus descendientes',()=>{
  const qs=[custom('single',{options:[{value:'Sí',label:'Sí'},{value:'No',label:'No'}]}),{...custom('short'),id:'child',condition:{field:'custom',operator:'equals' as const,value:'Sí'}},{...custom('short'),id:'descendant',condition:{field:'child',operator:'equals' as const,value:'dato'}}];
  expect(validateFormAnswers(qs,{custom:'No',child:'dato',descendant:'no debe guardarse',role:'ADMIN'})).toEqual({custom:'No'});
  expect(()=>validateFormAnswers(qs,{custom:'Sí'})).toThrow();
 });
 it('adjuntos obligatorios deben existir; no se aceptan rutas enviadas por el navegador',()=>{
  expect(()=>validateFormAnswers([custom('file')],{custom:'r2://otro'})).toThrow();
  expect(validateFormAnswers([custom('file')],{},new Set(['custom']))).toEqual({});
 });
 it('verifica firma, extensión, MIME y tamaño del documento',async()=>{
  expect((await verifyCaptureFile(new File(['%PDF-1.7 test'],'cv.pdf',{type:'application/pdf'}))).sha256).toHaveLength(64);
  for(const file of [new File(['fake'],'cv.pdf',{type:'application/pdf'}),new File(['%PDF-1.7'],'bad.html',{type:'application/pdf'}),new File([''],'cv.pdf',{type:'application/pdf'}),new File([new Uint8Array(2*1024*1024+1)],'large.pdf',{type:'application/pdf'})])
   await expect(verifyCaptureFile(file)).rejects.toThrow();
 });
 it('multipart acotado y sin duplicar preguntas de archivo',async()=>{
  const form=new FormData();form.set('payload',JSON.stringify({fullName:'Prueba aislada'}));form.append('file:cv',new File(['%PDF-test'],'cv.pdf',{type:'application/pdf'}));
  const parsed=await readCaptureSubmission(new Request('https://test',{method:'POST',body:form}));expect(parsed.files.size).toBe(1);
  form.append('file:cv',new File(['%PDF-test'],'cv.pdf',{type:'application/pdf'}));
  await expect(readCaptureSubmission(new Request('https://test',{method:'POST',body:form}))).rejects.toThrow();
 });
});
