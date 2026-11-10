export const TECH_CENTER_FORM = 'techcenter-v1';
export const COMPANY_CAPTURE_FORM = 'company-capture-v1';
import {publicCaptureConfig, captureShifts, type CaptureCampaignConfig} from './captureCampaignConfig';
export type CaptureCampaignOption = { id: string; name: string; configuration?: CaptureCampaignConfig | null; form?:import('./captureFormSchema').CaptureForm|null; unavailableReason?:string; formRevision?:number|null };
export const companyText = (text: string, name: string) => text.replaceAll('TECH CENTER', name);
export const techCenterIntro = [
  'Somos TECH CENTER, una empresa peruana especializada en servicios de telemarketing, Contact Center y BPO, que trabaja con empresas nacionales e internacionales.',
  'Queremos conocer tu perfil profesional, experiencia y disponibilidad para identificar las oportunidades laborales que mejor se ajusten a tus competencias.',
  'Responde con información verídica. Los campos obligatorios están identificados con (*).',
];
export const techCenterPrivacy = 'TECH CENTER tratará los datos proporcionados para gestionar tu postulación, comunicarse contigo y evaluar tu perfil frente a los requisitos del puesto.';
export const techCenterPrivacyNote = 'Las autorizaciones que legalmente requieran consentimiento, especialmente para datos sensibles o finalidades adicionales, deberán recabarse por separado cuando corresponda.';
type Option = string | { value: string; label: string };
export type TechCenterField = {
  key: string; label: string; required?: boolean; options?: readonly Option[];
  type?: 'email' | 'tel' | 'textarea' | 'number'; max?: number; minValue?: number; maxValue?: number;
  when?: (values: Record<string, unknown>) => boolean; hint?: string;
};
export const techCenterSections: { title: string; hint?: string; when?: TechCenterField['when']; fields: TechCenterField[] }[] = [
  { title: '1. DATOS PERSONALES', fields: [
    { key: 'documentType', label: '1. Tipo de documento', required: true, options: [{value:'DNI',label:'DNI'},{value:'CE',label:'Carné de extranjería'},{value:'OTRO',label:'Otro documento válido'}] },
    { key: 'documentNumber', label: '2. Número de documento de identidad', required: true, max: 24 },
    { key: 'fullName', label: '3. Nombres y apellidos completos', required: true, max: 120 },
    { key: 'age', label: '4. ¿Cuántos años tienes?', required: true, type: 'number', minValue: 0, maxValue: 120 },
    { key: 'district', label: '5. ¿En qué provincia y distrito resides actualmente?', required: true, max: 160 },
    { key: 'addressReference', label: '6. Dirección referencial o zona de residencia (Opcional)', max: 240 },
    { key: 'phone', label: '7. Número de celular / WhatsApp', required: true, type: 'tel', max: 30 },
    { key: 'email', label: '8. Correo electrónico', required: true, type: 'email', max: 160 },
  ]},
  { title: '2. EXPERIENCIA LABORAL', fields: [
    { key: 'contactCenterExperience', label: '9. ¿Tienes experiencia laboral en call center o contact center?', required: true, options: ['Sí','No'] },
    { key: 'experienceMonths', label: '10. ¿Cuántos meses de experiencia tienes en call center?', required: true, type: 'number', minValue: 1, maxValue: 1200, when: v => v.contactCenterExperience === 'Sí' },
    { key: 'experienceDetails', label: '¿En qué campañas trabajaste?', required: true, type: 'textarea', max: 1500, when: v => v.contactCenterExperience === 'Sí' },
    { key: 'workedAtTechCenter', label: '11. ¿Has trabajado anteriormente en TECH CENTER?', required: true, options: ['Sí','No'] },
    { key: 'education', label: '12. ¿Cuál es tu grado de instrucción?', required: true, options: ['Secundaria incompleta','Secundaria completa','Estudios técnicos en curso','Estudios técnicos concluidos','Estudios universitarios en curso','Bachiller','Titulado(a)'] },
  ]},
  { title: '3. POSTULACIÓN Y DISPONIBILIDAD', fields: [
    { key: 'preferredCampaign', label: '13. ¿A qué campaña deseas postular?', required: true, options: ['Retenciones Bitel','Migraciones Bitel','Portabilidad Bitel','Win Outbound','Portabilidad Costa Rica','Finetwork','Prosegur','Carsa Préstamos','Impulsadores','Portabilidad Movistar','Cobranzas Bitel'] },
    { key: 'workday', label: '14. ¿Qué jornada laboral se ajusta a tu disponibilidad?', required: true, options: ['Full time','Semi full','Part time'] },
    { key: 'availability', label: '15. ¿En qué turno tienes disponibilidad para trabajar?', required: true, options: captureShifts },
    { key: 'commitments', label: '16. ¿Actualmente tienes compromisos laborales o académicos que podrían coincidir con el horario de trabajo?', required: true, options: ['No','Sí (indicar disponibilidad)'] },
    { key: 'commitmentsDetails', label: 'Indica tu disponibilidad', required: true, type: 'textarea', max: 1000, when: v => v.commitments === 'Sí (indicar disponibilidad)' },
    { key: 'modality', label: '17. ¿Qué modalidad de trabajo prefieres? (Sujeta a disponibilidad de la campaña)', required: true, options: [{value:'Presencial',label:'Presencial'},{value:'Remota',label:'Remoto'}] },
  ]},
  { title: '4. HERRAMIENTAS DE TRABAJO', hint: 'Estas preguntas corresponden a una campaña remota.', when: v => v.modality === 'Remota', fields: [
    { key: 'computer', label: '18. ¿Cuentas con computadora o laptop disponible para trabajar?', options: ['Sí','No'] },
    { key: 'usbHeadset', label: '19. ¿Cuentas con headset (audífonos con micrófono)?', options: ['Sí','No'] },
    { key: 'internet', label: '20. ¿Cuentas con conexión estable a internet?', options: ['Sí, por cable','Sí, inalámbrica','No'] },
  ]},
  { title: '5. INCLUSIÓN Y ACCESIBILIDAD', fields: [
    { key: 'conadis', label: '21. ¿Cuentas con carné de CONADIS? (Respuesta voluntaria)', options: ['Sí','No'] },
    { key: 'adjustments', label: '22. ¿Necesitas algún apoyo para participar en la entrevista o evaluación? (Opcional)', options: ['Sí','No','Prefiero comunicarlo directamente a Reclutamiento'], hint: 'Por ejemplo: acceso sin escaleras, interpretación en lengua de señas o un formato de lectura accesible. No necesitas indicar diagnósticos.' },
    { key: 'adjustmentDetails', label: 'Puedes indicar qué adaptación necesitas (Opcional)', type: 'textarea', max: 1000, when: v => v.adjustments === 'Sí', hint: 'No es necesario revelar diagnósticos ni información médica.' },
  ]},
];
export const optionValue = (option: Option) => typeof option === 'string' ? option : option.value;
export const optionLabel = (option: Option) => typeof option === 'string' ? option : option.label;
export function selectedCaptureConfig(values: Record<string, unknown>, campaigns: CaptureCampaignOption[]) {
  const campaign=campaigns.find(c=>c.id===values.preferredCampaign);
  return campaign && !campaign.unavailableReason ? publicCaptureConfig(campaign.configuration) : undefined;
}
export function changeCaptureAnswer(values: Record<string,string>, key: string, value: string, _campaigns: CaptureCampaignOption[]) {
  const next = {...values, [key]:value};
  if (key === 'preferredCampaign') {
    for (const name of ['workday','availability','modality','computer','usbHeadset','internet']) delete next[name];
  }
  return next;
}
export function companySections(companyName: string, campaigns: CaptureCampaignOption[], values: Record<string, unknown> = {}) {
  const config = selectedCaptureConfig(values,campaigns);
  return techCenterSections.map(section => ({...section,
    ...(section.title.startsWith('4.') ? {when: () => values.modality === 'Remota'} : {}),
    fields:section.fields.map(field=>({
    ...field,label:companyText(field.label,companyName),
    ...(field.key==='preferredCampaign'?{options:campaigns.map(c=>({value:c.id,label:c.name})),max:240}:{}),
    ...(field.key==='age'?{minValue:config?.minAge ?? 0,maxValue:config?.maxAge ?? 120,hint:config ? (config.maxAge===null ? 'Edad mínima: '+config.minAge+' años.' : 'Rango de edad: '+config.minAge+' a '+config.maxAge+' años.') : 'Selecciona una campaña para consultar el rango de edad.'}:{}),
    ...(field.key==='workday'?{options:config?.workdays || [],hint:'Opciones ofrecidas por la campaña seleccionada.'}:{}),
    ...(field.key==='availability'?{options:config?.schedules || [],hint:'Turnos disponibles: mañana y tarde.'}:{}),
    ...(field.key==='modality'?{options:config ? [{value:'Presencial',label:'Presencial'},{value:'Remota',label:'Remoto'}] : [],label:'17. ¿Qué modalidad de trabajo prefieres? (Sujeta a disponibilidad de la campaña)'}:{}),
  }))}));
}
export function visibleTechCenterFields(values: Record<string, unknown>, campaigns?: CaptureCampaignOption[]) {
  return (campaigns ? companySections('TECH CENTER',campaigns,values) : techCenterSections).filter(section => !section.when || section.when(values))
    .flatMap(section => section.fields.filter(field => !field.when || field.when(values)));
}
// Strict allowlist shared by UI and server: hidden conditional answers are discarded.
export function validateTechCenterAnswers(values: Record<string, unknown>, campaigns?: CaptureCampaignOption[]) {
  if (campaigns && !selectedCaptureConfig(values,campaigns)) throw new Error('La campaña no está disponible o tiene pendiente la configuración del formulario.');
  const answers: Record<string, string> = {};
  for (const field of visibleTechCenterFields(values,campaigns)) {
    const raw = values[field.key];
    if (raw !== undefined && typeof raw !== 'string') throw new Error('Revisa: ' + field.label);
    const value = (raw as string || '').normalize('NFKC').trim();
    if ((field.required && !value) || value.length > (field.max || 160) ||
      (value && field.type === 'number' && (!/^\d+$/.test(value) || Number(value) < (field.minValue ?? 0) || Number(value) > (field.maxValue ?? 120))) ||
      (value && field.options && !field.options.some(option => optionValue(option) === value))) {
      throw new Error('Revisa: ' + field.label);
    }
    if (value) answers[field.key] = value;
  }
  return answers;
}
