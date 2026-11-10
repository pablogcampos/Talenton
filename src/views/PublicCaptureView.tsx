import React, { useEffect, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';
import { CompanyLogo, companyLogoSource } from '../components/common/CompanyLogo';
import { publicCaptureApi } from '../services/captureApi';
import { TechCenterFields } from '../components/capture/TechCenterFields';
import {CaptureFormFields} from '../components/capture/CaptureFormFields';
import {defaultCaptureForm,effectiveQuestions,visibleQuestions,sensitiveQuestionIds,type FormAnswers,type FormQuestion} from '../../shared/captureFormSchema';
import { COMPANY_CAPTURE_FORM, companyText, selectedCaptureConfig, type CaptureCampaignOption, techCenterIntro, techCenterPrivacy, techCenterPrivacyNote } from '../../shared/techCenterForm';
type Turnstile = { render: (el: HTMLElement, options: object) => string; remove: (id: string) => void; reset: (id: string) => void };
const steps = ['Datos personales', 'Contacto', 'Perfil y experiencia', 'Disponibilidad', 'Confirmación'] as const;
const personalFields = new Set(['documentType','documentNumber','age','birthDate','fullName','district','addressReference']);
const contactFields = new Set(['phone','email']);
const availabilityFields = new Set(['workday','availability','commitments','commitmentsDetails','modality','computer','usbHeadset','internet','contractType','workOrStudy']);
const defaultPublicCaptureForm = defaultCaptureForm();
function fieldStep(id:string,section=''):number {
  if(personalFields.has(id))return 0;
  if(contactFields.has(id))return 1;
  if(availabilityFields.has(id))return 3;
  if(/contacto/i.test(section))return 1;
  if(/disponibilidad|horario|herramientas/i.test(section))return 3;
  if(/datos personales|identidad/i.test(section))return 0;
  return 2;
}
export function PublicCaptureView({ token }: { token: string }) {
  const [active, setActive] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState(false), [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(''), widget = useRef<HTMLDivElement>(null), widgetId = useRef(''), requestId = useRef(crypto.randomUUID());
  const [data, setData] = useState({ fullName: '', phone: '', email: '', documentType: 'DNI', documentNumber: '', district: '', consent: false, website: '' });
  const [securityError,setSecurityError]=useState('');
  const submitting=useRef(false);
  const [sitekey, setSitekey] = useState('');
  const [formId, setFormId] = useState('');
  const [techAnswers, setTechAnswers] = useState<FormAnswers>({});
  const [sensitiveConsent,setSensitiveConsent]=useState(false);
  const [files,setFiles]=useState<Record<string,File>>({});
  const [companyName, setCompanyName] = useState('');
  const [campaigns, setCampaigns] = useState<CaptureCampaignOption[]>([]);
  const [step,setStep]=useState(0), [stepError,setStepError]=useState('');
  const stepFields=useRef<HTMLDivElement>(null);
  const selectedConfig = selectedCaptureConfig(techAnswers,campaigns);
  const selectedCampaign=campaigns.find(c=>c.id===techAnswers.preferredCampaign);
  const publishedForm=selectedCampaign?.form;
  const customForm=selectedCampaign ? publishedForm || defaultPublicCaptureForm : undefined;
  const questions=customForm&&selectedConfig&&selectedCampaign?effectiveQuestions(customForm,selectedConfig,selectedCampaign,companyName):undefined;
  const sensitiveAnswered=!!questions&&visibleQuestions(questions,techAnswers).some(q=>sensitiveQuestionIds.includes(q.id as typeof sensitiveQuestionIds[number])&&Boolean(techAnswers[q.id]));
  const changeAnswer=(key:string,value:string|string[])=>{
    if(key==='preferredCampaign'){
      setFiles({});setSensitiveConsent(false);setTechAnswers({preferredCampaign:String(value)});
      setStepError('');
    }else setTechAnswers(previous=>({...previous,[key]:value}));
  };
  useEffect(() => {
    let cancelled = false;
    setActive(false); setSecurityError(''); setChallenge(''); setError(''); setSuccess(false); setSitekey(''); setStep(0); setStepError('');
    setFormId(''); setCompanyName(''); setCampaigns([]); setTechAnswers({}); setSensitiveConsent(false); setData({ fullName: '', phone: '', email: '', documentType: 'DNI', documentNumber: '', district: '', consent: false, website: '' });
    requestId.current = crypto.randomUUID();
    publicCaptureApi<{ turnstileSiteKey?: string; securityReady?: boolean; formId?: string; companyName?:string; campaigns?:CaptureCampaignOption[] }>(token).then(config => {
      if (cancelled) return;
      const key = config.turnstileSiteKey || import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
      setActive(true);
      setFiles({});setFormId(config.formId || ''); setCompanyName(config.companyName || ''); setCampaigns(config.campaigns || []);
      if(config.formId !== COMPANY_CAPTURE_FORM || !config.companyName){setError('El formulario está actualizándose. Recarga la página en unos momentos.');return;}
      if (!key || config.securityReady === false) {
        setError('Formulario pendiente de configuración de seguridad. Contacta al responsable del enlace.');
        return;
      }
      setSitekey(key);
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [token]);
  useEffect(() => {
    if (!active || !sitekey || step !== 4 || !widget.current) return;
    let cancelled = false;
    const failed = () => { if (!cancelled) { setChallenge(''); setSecurityError('No se pudo cargar la verificación de seguridad. Revisa tu conexión y recarga la página.'); } };
    const init = () => {
      const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (!cancelled && api && widget.current && !widgetId.current) {
        try {
          widgetId.current = api.render(widget.current, {
            sitekey, action: 'capture',
            callback: (value: string) => { if (!cancelled) { setChallenge(value); setSecurityError(''); } },
            'expired-callback': () => { if (!cancelled) setChallenge(''); },
            'error-callback': failed,
          });
        } catch { failed(); }
      }
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-capture-turnstile]');
    const script = existing || document.createElement('script');
    script.addEventListener('load', init); script.addEventListener('error', failed);
    if (!existing) { script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.dataset.captureTurnstile = 'true'; document.head.appendChild(script); } else init();
    return () => { cancelled = true; script.removeEventListener('load', init); script.removeEventListener('error', failed); const api = (window as unknown as { turnstile?: Turnstile }).turnstile; if (widgetId.current) api?.remove(widgetId.current); widgetId.current = ''; };
  }, [active, sitekey, step]);

  const advance = () => {
    setStepError('');
    if(step===0&&!selectedConfig){setStepError('Selecciona una campaña disponible para continuar.');return;}
    const controls=stepFields.current?.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input, select, textarea');
    for(const control of controls||[]){
      if(!control.checkValidity()){
        control.reportValidity();
        setStepError('Revisa el campo indicado antes de continuar.');
        return;
      }
    }
    setStep(previous=>Math.min(previous+1,4));
  };
  const companyLogo = companyLogoSource(undefined, companyName);

  return <main className="talent-app min-h-screen bg-[#f3f7fa] px-4 py-6 text-[#143A56] sm:px-6 sm:py-10">
    <div className="mx-auto max-w-6xl">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_-30px_rgba(20,58,86,.35)]">
        <header className="grid gap-6 border-b border-slate-200 p-5 sm:p-8 lg:grid-cols-[minmax(240px,1fr)_minmax(0,1.7fr)] lg:gap-10">
          <div className="flex flex-col items-start gap-2 lg:border-r lg:border-slate-200 lg:pr-8"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Empresa contratante</p>{companyLogo?<CompanyLogo companyName={companyName} />:<div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-[#143A56]"><Building2 className="h-7 w-7" /></span><p className="text-xl font-bold">{companyName||'Cargando empresa…'}</p></div>}</div>
          <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Postula con nosotros</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Completa tu información para que podamos conocer tu perfil y disponibilidad.</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span>Tiempo estimado: {Math.max(4,Math.ceil((questions?.length||24)/3))} min</span><span>Los campos obligatorios están marcados con (*)</span></div></div>
        </header>
        {(customForm?.description||companyName)&&<details className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600 sm:px-8"><summary className="cursor-pointer font-medium text-[#143A56]">Información sobre esta postulación</summary><div className="mt-2 space-y-2">{customForm?.title&&<p className="font-semibold">{customForm.title}</p>}{customForm?.description&&<p>{customForm.description}</p>}{companyName&&techCenterIntro.map(paragraph=><p key={paragraph}>{companyText(paragraph,companyName)}</p>)}</div></details>}
        {error && <p role="alert" className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:mx-8">{error}</p>}
        {success ? <p role="status" className="m-5 rounded-xl bg-emerald-50 p-5 text-emerald-800 sm:m-8">Tu postulación fue registrada correctamente. Gracias por tu interés.</p> : active && formId === COMPANY_CAPTURE_FORM && <form className="p-5 sm:p-8" onSubmit={async e => {
      e.preventDefault(); if(step!==4){advance();return;} if(submitting.current||busy||!challenge||!selectedConfig)return;submitting.current=true;setBusy(true);setError('');
      try{
        const fileIds=new Set(questions?visibleQuestions(questions,techAnswers).filter(q=>q.type==='file').map(q=>q.id):[]);
        await publicCaptureApi(token,{...techAnswers,...(publishedForm?{formRevision:selectedCampaign?.formRevision}:{}),privacyAcknowledged:data.consent,sensitiveConsent:sensitiveAnswered&&sensitiveConsent,website:data.website,turnstileToken:challenge,requestId:requestId.current},Object.fromEntries(Object.entries(files as Record<string,File>).filter(([id])=>fileIds.has(id))));
        setSuccess(true);setFiles({});
      }catch(e){
        const message=e instanceof Error?e.message:'No se pudo enviar.';
        setError(message);
        const invalidQuestion=questions?.find(q=>message.includes(q.label));
        if(invalidQuestion)setStep(fieldStep(invalidQuestion.id,invalidQuestion.section));
        const api=(window as unknown as {turnstile?:Turnstile}).turnstile;if(widgetId.current)api?.reset(widgetId.current);setChallenge('');
      }
      finally{submitting.current=false;setBusy(false);}
    }}>
    <nav aria-label="Progreso de postulación" className="mb-7 grid grid-cols-5 gap-1 sm:gap-3">{steps.map((name,index)=><div key={name} aria-current={step===index?'step':undefined} className="min-w-0 text-center"><div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${index===step?'bg-sky-700 text-white':index<step?'bg-teal-100 text-teal-800':'bg-slate-100 text-slate-500'}`}>{index+1}</div><p className={`mt-2 text-[10px] leading-tight sm:text-xs ${index===step?'font-bold text-[#143A56]':'text-slate-500'}`}>{name}</p></div>)}</nav>
    <div role="progressbar" aria-label="Progreso del formulario" aria-valuemin={0} aria-valuemax={5} aria-valuenow={step+1} className="mb-6 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-700 transition-all" style={{width:`${(step+1)*20}%`}} /></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Paso {step+1} de {steps.length}</p>
        <h2 className="mt-1 text-xl font-bold">{steps[step]}</h2>
        <p className="mt-1 text-sm text-slate-500">{step===0?'Elige una campaña y cuéntanos quién eres.':step===1?'Comparte cómo podemos contactarte.':step===2?'Queremos conocer tu experiencia y perfil.':step===3?'Indica tus preferencias y disponibilidad.':'Revisa la declaración antes de enviar tu postulación.'}</p>
        {stepError&&<p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{stepError}</p>}
        <div ref={stepFields} className="mt-6 space-y-5">
          {step===0&&<>
            {!campaigns.length && <p role="status" className="rounded-lg bg-orange-50 p-3 text-sm">Esta empresa no tiene campañas disponibles para postular en este momento.</p>}
            {techAnswers.preferredCampaign && !selectedConfig && <p role="status" className="rounded-lg bg-orange-50 p-3 text-sm">Esta campaña tiene pendiente la configuración del formulario. Contacta al responsable del enlace o selecciona otra campaña.</p>}
            {selectedCampaign && selectedConfig && <p role="note" className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">Podrás elegir Presencial o Remoto según tu preferencia. Tu elección está sujeta a la disponibilidad de la campaña.</p>}
            <label className="block text-sm font-semibold">Campaña (*)<select className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-100" required value={String(techAnswers.preferredCampaign||'')} onChange={e=>changeAnswer('preferredCampaign',e.target.value)}><option value="">Selecciona la campaña a la que deseas postular</option>{campaigns.map(c=><option key={c.id} value={c.id} disabled={!!c.unavailableReason}>{c.name}{c.unavailableReason?' (no disponible)':''}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Las preguntas se adaptan a la campaña. Cambiarla reinicia las respuestas del formulario.</span></label>
          </>}
          {selectedConfig&&(questions?<CaptureFormFields key={selectedCampaign?.id} questions={questions} hideCampaign showQuestion={(q:FormQuestion)=>fieldStep(q.id,q.section)===step} values={techAnswers} uploadedFiles={files} onChange={changeAnswer} onFile={(id,file)=>{
            if(file&&file.size>2*1024*1024){setError('Cada adjunto debe pesar como máximo 2 MB.');setFiles(previous=>{const next={...previous};delete next[id];return next;});return;}
            setFiles(previous=>{const next={...previous};if(file)next[id]=file;else delete next[id];return next;});
          }}/>:<TechCenterFields hideCampaign showField={id=>fieldStep(id)===step} companyName={companyName} campaigns={campaigns} values={Object.fromEntries(Object.entries(techAnswers).filter((entry):entry is [string,string]=>typeof entry[1]==='string'))} onChange={changeAnswer} />)}
        </div>
        {step===4&&<section className="mt-6 space-y-4 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-bold">Protección de datos personales</h3>
          <aside className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"><b>Aviso de privacidad</b><p className="mt-2">{companyText(techCenterPrivacy,companyName)}</p></aside>
          <p className="text-sm font-semibold">Declaración de conocimiento (*)</p>
          <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1 h-4 w-4 accent-sky-700" type="checkbox" required checked={data.consent} onChange={e => setData({ ...data, consent: e.target.checked })} />He leído la información sobre el tratamiento de mis datos personales.</label>
          {sensitiveAnswered&&<label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1 h-4 w-4 accent-sky-700" type="checkbox" required checked={sensitiveConsent} onChange={e=>setSensitiveConsent(e.target.checked)}/>Autorizo de forma expresa y voluntaria el tratamiento de las respuestas sobre salud y situación familiar que decidí proporcionar para esta postulación.</label>}
          <p className="text-xs italic text-slate-500">{techCenterPrivacyNote}</p>
        </section>}
        <div className="hidden" aria-hidden="true"><input tabIndex={-1} autoComplete="off" value={data.website} onChange={e => setData({ ...data, website: e.target.value })} /></div>
        {step===4&&error&&<p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} Tus respuestas siguen en esta página. Revisa el mensaje y vuelve a enviar; espera la confirmación del registro.</p>}
        {securityError&&<p role="alert" className="mt-4 text-sm text-red-700">{securityError}</p>}
        <div className="mt-7 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
          {step>0&&<button type="button" disabled={busy} onClick={()=>{if(step===4)setChallenge('');setStep(previous=>previous-1);setStepError('');}} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-[#143A56] hover:bg-slate-50">Volver</button>}
          {step<4?<button type="button" onClick={advance} className="rounded-xl bg-[#143A56] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0d2d45]">Continuar →</button>:<><div ref={widget} className="w-full" /><button disabled={busy || !challenge || !selectedConfig} className="rounded-xl bg-[#143A56] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Registrando…' : 'Enviar postulación'}</button></>}
        </div>
      </div>
      <aside className="space-y-4 text-sm"><div className="rounded-2xl bg-sky-50 p-5"><p className="font-bold">Tu información está segura</p><p className="mt-2 leading-6 text-slate-600">La usaremos para gestionar tu postulación y comunicarnos contigo.</p></div><div className="rounded-2xl border border-slate-200 p-5"><p className="font-bold">¿En qué consiste el proceso?</p><ol className="mt-4 space-y-4 text-slate-600"><li><b className="text-[#143A56]">1. Completa tu registro</b><p>Cuéntanos sobre tu perfil.</p></li><li><b className="text-[#143A56]">2. Revisamos tu información</b><p>Evaluaremos tu postulación.</p></li><li><b className="text-[#143A56]">3. Te contactamos</b><p>Si tu perfil se ajusta, nos comunicaremos contigo.</p></li></ol></div></aside>
    </div>
    </form>}
      </section>
    </div>
  </main>;
}
