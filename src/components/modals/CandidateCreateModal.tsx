import { workerUpload } from '../../services/workerApi';
import React, { useEffect, useState } from 'react';
import { 
  X, 
  UserPlus, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Phone, 
  Mail, 
  MapPin, 
  Briefcase,
  Share2,
  Save
} from 'lucide-react';
import { useTalent } from '../../context/TalentContext';
import { LeadSourceType } from '../../types';
import { workModalities, workSchedules, type CandidatePreferences } from '../../../shared/candidatePreferences';
import { getWorkerErrorMessage } from '../../services/workerApi';

interface CandidateCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCampaignId?: string;
  voicebotLead?: {id:string;full_name:string;phone:string;district:string;experience:string};
}

export const CandidateCreateModal: React.FC<CandidateCreateModalProps> = ({
  isOpen,
  onClose,
  defaultCampaignId, voicebotLead
}) => {
  const { 
    addCandidate, 
    checkDuplicateCandidate, 
    campaigns, 
    availableUsers, 
    currentUser,
    scopedCampaigns,
    openCandidate360
  } = useTalent();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [district, setDistrict] = useState('Lima Centro');
  const [workModality, setWorkModality] = useState<CandidatePreferences['workModality']>('');
  const [workSchedule, setWorkSchedule] = useState<CandidatePreferences['workSchedule']>('');
  const [campaignId, setCampaignId] = useState(defaultCampaignId || scopedCampaigns[0]?.id || campaigns[0]?.id || '');
  const [recruiterId, setRecruiterId] = useState(currentUser.id);
  const [source, setSource] = useState<LeadSourceType>('Facebook Gratis');
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().split('T')[0]);
  const [cvFile, setCvFile] = useState<File|null>(null);
  const cvFileName = cvFile?.name || 'Sin CV adjunto';
  const [createdCandidateId, setCreatedCandidateId] = useState<string|null>(null);
  const [observations, setObservations] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) { setDuplicateWarning(null); setCreatedCandidateId(null); }
    if (isOpen && defaultCampaignId) setCampaignId(defaultCampaignId);
    if (isOpen && currentUser.role === 'RECLUTADOR') setRecruiterId(currentUser.id);
  }, [isOpen, defaultCampaignId, currentUser.id, currentUser.role]);
  useEffect(() => { if (isOpen) setAge(''); }, [isOpen]);

  useEffect(()=>{if(isOpen&&voicebotLead){setSource('Otro');setFirstName(voicebotLead.full_name);setLastName('');setPhone(voicebotLead.phone.replace(/\D/g,'').replace(/^51(?=\d{9}$)/,''));setDistrict(voicebotLead.district||'');setObservations(voicebotLead.experience?'Experiencia declarada: '+voicebotLead.experience:'');}},[isOpen,voicebotLead?.id]);
  if (!isOpen) return null;

  const selectedCampaign = campaigns.find(campaign => campaign.id === campaignId);
  const recruiterLocked = currentUser.role === 'RECLUTADOR';

  const handleDniChange = (val: string) => {
    setDni(val);
    if (val.length >= 8) {
      const dup = checkDuplicateCandidate(val, phone,undefined,selectedCampaign?.companyId);
      if (dup.isDuplicate) {
        setDuplicateWarning(dup.reason || 'DNI duplicado detectado');
      } else {
        setDuplicateWarning(null);
      }
    } else {
      setDuplicateWarning(null);
    }
  };

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (val.length >= 9) {
      const dup = checkDuplicateCandidate(dni, val,undefined,selectedCampaign?.companyId);
      if (dup.isDuplicate) {
        setDuplicateWarning(dup.reason || 'Teléfono duplicado detectado');
      } else {
        setDuplicateWarning(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!firstName.trim() || !lastName.trim() || !dni.trim() || !phone.trim() || !Number.isInteger(Number(age)) || Number(age) < 1 || Number(age) > 120) return;

    // Check duplicate
    const dup = createdCandidateId ? {isDuplicate:false,reason:undefined} : checkDuplicateCandidate(dni, phone,undefined,selectedCampaign?.companyId);
    if (dup.isDuplicate) {
      setDuplicateWarning(dup.reason || 'No se puede registrar un postulante duplicado');
      return;
    }

    const targetCamp = campaigns.find(c => c.id === campaignId);
    if (!targetCamp) {
      setDuplicateWarning('Selecciona una convocatoria disponible antes de registrar al postulante.');
      return;
    }
    const recruiter = availableUsers.find(u => u.id === recruiterId);

    setDuplicateWarning(null);setIsSubmitting(true);
    try {
      const res = createdCandidateId ? {success:true,candidate:{id:createdCandidateId},message:undefined} : await addCandidate({
      voicebotLeadId: voicebotLead?.id,
      dni: dni.trim(),
      fullName: `${firstName.trim()} ${lastName.trim()}`,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      age: Number(age),
      city: `Lima - ${district}`,
      district: district,
      workModality,
      workSchedule,
      campaignId: targetCamp.id,
      campaignCode: targetCamp.code,
      campaignName: targetCamp.title,
      jobProfile: targetCamp.title,
      recruiterId: recruiter?.id || currentUser.id,
      recruiterName: recruiter?.name || currentUser.name,
      analystId: targetCamp.assignedAnalystId || '',
      analystName: targetCamp.assignedAnalystName || '',
      source: source,
      applicationDate: applicationDate,
      cvUrl: undefined,
      observationsGeneral: observations
      });

      if (res.success && res.candidate) {
        setCreatedCandidateId(res.candidate.id);
        if(cvFile){const form=new FormData();form.append('file',cvFile);form.append('name',cvFile.name);form.append('type','CV');await workerUpload('/api/candidates/'+encodeURIComponent(res.candidate.id)+'/documents',form);}
        onClose();
        openCandidate360(res.candidate.id);
      } else if (res.message) {
        setDuplicateWarning(getWorkerErrorMessage(new Error(res.message),'No se pudo registrar al postulante.'));
      }
    } catch (error) {
      setDuplicateWarning(getWorkerErrorMessage(error, 'No se pudo registrar al postulante. Inténtalo nuevamente.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-xs text-[#143A56] outline-hidden transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const fieldLabelClass = 'mb-1.5 block text-xs font-semibold text-[#143A56]';

  return (
    <div className="talent-modal-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0C1E35]/70 p-3 backdrop-blur-sm sm:p-5">
      <div className="talent-modal-shell my-auto flex max-h-[94vh] w-full max-w-[1220px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-5 sm:px-7">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><UserPlus className="h-6 w-6" /></span>
            <div><h3 className="text-xl font-bold leading-tight text-[#143A56]">Registrar postulante</h3><p className="mt-1 text-sm text-slate-600">Agrega un candidato al proceso de selección.</p></div>
          </div>
          <button type="button" disabled={isSubmitting} onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Cerrar"><X className="h-6 w-6" /></button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 sm:px-7">
            {defaultCampaignId && selectedCampaign && (
              <div className="flex items-center gap-4 rounded-xl border border-blue-200 bg-blue-50/40 px-4 py-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Briefcase className="h-5 w-5" /></span>
                <div className="min-w-0"><strong className="block truncate text-sm text-[#143A56]">{selectedCampaign.code} <span className="mx-1.5 text-slate-400">•</span> {selectedCampaign.title}</strong><span className="mt-0.5 block truncate text-xs text-slate-600">{[selectedCampaign.company || selectedCampaign.client, selectedCampaign.location, selectedCampaign.managementType].filter(Boolean).join('  •  ')}</span></div>
              </div>
            )}

            {duplicateWarning && <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /><div><p className="font-bold">Revisa la información</p><p className="mt-0.5 text-2xs">{duplicateWarning}</p></div></div>}

            {voicebotLead&&<p className="text-sm text-slate-600">Datos del voicebot precargados. Revisa nombres y apellidos, completa DNI, edad y convocatoria para convertir.</p>}
            <section className="space-y-4 border-b border-slate-200 pb-5">
              <h4 className="flex items-center gap-2 text-sm font-bold text-[#143A56]"><UserPlus className="h-5 w-5 text-blue-700" />1. Datos del postulante</h4>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
                <div><label className={fieldLabelClass}>Nombres <span className="text-rose-600">*</span></label><input required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ej: Daniel Alejandro" className={inputClass} /></div>
                <div><label className={fieldLabelClass}>Apellidos <span className="text-rose-600">*</span></label><input required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Ej: Ramos Salazar" className={inputClass} /></div>
                <div><label className={fieldLabelClass}>DNI / Documento de identidad <span className="text-rose-600">*</span></label><input required maxLength={10} value={dni} onChange={e => handleDniChange(e.target.value)} placeholder="Ej: 74829103" className={`${inputClass} font-mono font-semibold`} /></div>
                <div><label htmlFor="candidate-create-age" className={fieldLabelClass}>Edad (años) <span className="text-rose-600">*</span></label><input id="candidate-create-age" type="number" required min={1} max={120} step={1} value={age} onChange={e => setAge(e.target.value)} placeholder="Ej: 25" className={inputClass} /></div>
                <div><label className={fieldLabelClass}>Teléfono / Celular <span className="text-rose-600">*</span></label><div className="flex gap-1"><span className="flex h-11 w-20 shrink-0 items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-[#143A56]">+51 <span className="text-slate-500">⌄</span></span><input type="tel" required value={phone} onChange={e => handlePhoneChange(e.target.value)} placeholder="Ej: 984 712 390" className={inputClass} /></div></div>
                <div><label className={fieldLabelClass}>Correo electrónico</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Ej: daniel.ramos@gmail.com" className={inputClass} /></div>
                <div><label className={fieldLabelClass}>Distrito de residencia</label><select value={district} onChange={e => setDistrict(e.target.value)} className={inputClass}><option value="Lima Centro">Lima Centro</option><option value="Miraflores">Miraflores</option><option value="San Martín de Porres">San Martín de Porres</option><option value="Los Olivos">Los Olivos</option><option value="Independencia">Independencia</option><option value="Comas">Comas</option><option value="Surco">Santiago de Surco</option><option value="San Borja">San Borja</option><option value="San Juan de Lurigancho">San Juan de Lurigancho</option><option value="Ate">Ate</option><option value="Callao">Callao</option></select></div>
              </div>
            </section>

            <section className="space-y-4 border-b border-slate-200 pb-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className={fieldLabelClass}>Modalidad
                  <select value={workModality} onChange={e => setWorkModality(e.target.value as CandidatePreferences['workModality'])} className={inputClass}>
                    <option value="">Sin especificar</option>{workModalities.map(value => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className={fieldLabelClass}>Horario / Jornada
                  <select value={workSchedule} onChange={e => setWorkSchedule(e.target.value as CandidatePreferences['workSchedule'])} className={inputClass}>
                    <option value="">Sin especificar</option>{workSchedules.map(value => <option key={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <h4 className="flex items-center gap-2 text-sm font-bold text-[#143A56]"><Share2 className="h-5 w-5 text-blue-700" />2. Asignación</h4>
              <div className={`grid grid-cols-1 gap-x-5 gap-y-4 ${defaultCampaignId ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
                {!defaultCampaignId && <div><label className={fieldLabelClass}>Convocatoria de destino <span className="text-rose-600">*</span></label><select required value={campaignId} onChange={e => setCampaignId(e.target.value)} className={`${inputClass} font-semibold`}>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.title} ({campaign.company})</option>)}</select></div>}
                <div><label className={fieldLabelClass}>Responsable asignado</label><select value={recruiterId} disabled={recruiterLocked} onChange={e => setRecruiterId(e.target.value)} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100`}>{availableUsers.map(user => <option key={user.id} value={user.id}>{user.name} ({user.role === 'JEFE_SELECCION' ? 'Jefe' : user.role === 'ANALISTA_SELECCION' ? 'Analista' : 'Reclutador'})</option>)}</select>{recruiterLocked && <span className="mt-1 block text-2xs text-slate-500">Asignado automáticamente a tu usuario.</span>}</div>
                <div><label className={fieldLabelClass}>Fuente de atracción</label><select value={source} onChange={e => setSource(e.target.value as LeadSourceType)} className={inputClass}><option value="Facebook Gratis">Facebook Gratis</option><option value="Mantra">Mantra</option><option value="Referidos">Referidos</option><option value="Grupo WhatsApp">Grupo WhatsApp</option><option value="Reingreso">Reingreso</option><option value="Indeed">Indeed</option><option value="Otro">Otro canal directo</option></select></div>
                <div><label className={fieldLabelClass}>Fecha de postulación</label><input type="date" value={applicationDate} onChange={e => setApplicationDate(e.target.value)} className={inputClass} /></div>
              </div>
            </section>

            <section className="space-y-4">
              <h4 className="flex items-center gap-2 text-sm font-bold text-[#143A56]"><FileText className="h-5 w-5 text-blue-700" />3. Información adicional <span className="text-xs font-normal text-slate-500">(opcional)</span></h4>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div><label className={fieldLabelClass}>Adjuntar CV</label><div className="flex min-h-[76px] items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><FileText className="h-6 w-6 shrink-0 text-blue-700" /><div className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800">{cvFileName}</span><span className="mt-0.5 flex items-center gap-1 text-2xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{cvFile?'Seleccionado':'Opcional'}</span></div></div><label className="shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-blue-700 hover:bg-slate-50">Cambiar<input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => setCvFile(e.target.files?.[0] || null)} /></label></div></div>
                <div><label className={fieldLabelClass}>Observaciones</label><textarea rows={3} maxLength={300} value={observations} onChange={e => setObservations(e.target.value)} placeholder="Notas adicionales sobre el candidato..." className="min-h-[76px] w-full resize-none rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-xs text-[#143A56] outline-hidden transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /><span className="mt-1 block text-right text-2xs text-slate-400">{observations.length}/300</span></div>
              </div>
            </section>
          </div>

          <footer className="sticky bottom-0 flex flex-wrap shrink-0 justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4 sm:px-7">
            {duplicateWarning&&<p role="alert" className="w-full rounded-lg bg-red-50 p-3 text-sm text-red-700">{duplicateWarning} Los datos ingresados se conservan.</p>}
            <button type="button" disabled={isSubmitting} onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-[#143A56] hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{isSubmitting ? 'Registrando…' : 'Registrar postulante'}</button>
          </footer>
        </form>
      </div>
    </div>
  );
};
