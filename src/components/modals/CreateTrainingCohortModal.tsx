import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  GraduationCap, 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  CheckSquare, 
  Square, 
  AlertCircle, 
  Sparkles,
  Info,
  Building2,
  Laptop,
  CheckCircle2,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { useTalent } from '../../context/TalentContext';
import { CampaignCall, CandidateRecord } from '../../types';
import { getWorkerErrorMessage } from '../../services/workerApi';
import { isCandidateAlreadyInTraining, isCandidateReadyForTraining } from '../../utils/trainingEligibility';

interface CreateTrainingCohortModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCampaignId?: string | null;
}

export const CreateTrainingCohortModal: React.FC<CreateTrainingCohortModalProps> = ({
  isOpen,
  onClose,
  initialCampaignId
}) => {
  const { 
    campaigns, 
    candidates, 
    currentUser, 
    createTrainingFromSelection, 
    setActiveModule, 
    setSelectedCohortId 
  } = useTalent();

  // Campaign selection
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId || '');
  
  // Cohort basic info
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [schedule, setSchedule] = useState<string>('08:00 - 15:00 (Lunes a Sábado)');
  const [modality, setModality] = useState<'PRESENCIAL' | 'REMOTO' | 'HIBRIDO'>('PRESENCIAL');
  const [location, setLocation] = useState<string>('Sede Central - Lima Centro');
  const [roomOrLink, setRoomOrLink] = useState<string>('Sala de Capacitación 302');
  const [totalDays, setTotalDays] = useState<number>(8);
  const [passingMinGrade, setPassingMinGrade] = useState<number>(14);

  // OJT Estimation
  const [ojtStartDate, setOjtStartDate] = useState<string>('');
  const [ojtEndDate, setOjtEndDate] = useState<string>('');
  const [observations, setObservations] = useState<string>('');

  // Selected candidates
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectionCampaignRef = useRef('');
  const selectionInitializedRef = useRef(false);
  const defaultsCampaignRef = useRef('');

  // Update defaults when initial campaign or campaign selection changes
  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
    } else if (!selectedCampaignId && campaigns.length > 0) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [initialCampaignId, campaigns]);

  // When selectedCampaignId changes, pre-fill code and name
  useEffect(() => {
    if (!isOpen) {
      defaultsCampaignRef.current = '';
      return;
    }
    if (selectedCampaignId && defaultsCampaignRef.current !== selectedCampaignId) {
      defaultsCampaignRef.current = selectedCampaignId;
      const camp = campaigns.find(c => c.id === selectedCampaignId);
      const randomNum = Math.floor(10 + Math.random() * 90);
      const nextCode = `CAP-2026-${camp?.code?.replace('CONV-', '') || '01'}-${randomNum}`;
      setCode(nextCode);
      setName(`Capacitación Inicial - ${camp?.title || 'Servicio'}`);
      const campaignModality = camp?.managementType || 'PRESENCIAL';
      setModality(campaignModality);
      setLocation(campaignModality === 'REMOTO' ? 'Home Office' : camp?.location || 'Sede Central - Lima Centro');
      setRoomOrLink(campaignModality === 'REMOTO' ? 'Microsoft Teams / Enlace Virtual' : 'Sala de Capacitación 302');
      
      // Calculate estimated default dates (starting next Monday)
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
      const startStr = nextWeek.toISOString().split('T')[0];
      setStartDate(startStr);

      // OJT Date: startStr + 10 days
      const ojtStart = new Date(nextWeek);
      ojtStart.setDate(nextWeek.getDate() + 10);
      const ojtEnd = new Date(ojtStart);
      ojtEnd.setDate(ojtStart.getDate() + 5);

      setOjtStartDate(ojtStart.toISOString().split('T')[0]);
      setOjtEndDate(ojtEnd.toISOString().split('T')[0]);

    }
  }, [isOpen, selectedCampaignId, campaigns]);

  useEffect(() => {
    if (!isOpen || !selectedCampaignId) {
      selectionCampaignRef.current = '';
      selectionInitializedRef.current = false;
      return;
    }
    const availableIds = new Set(candidates.filter(c => isCandidateReadyForTraining(c, selectedCampaignId)).map(c => c.id));
    const campaignChanged = selectionCampaignRef.current !== selectedCampaignId;
    selectionCampaignRef.current = selectedCampaignId;
    if (campaignChanged) selectionInitializedRef.current = false;
    const shouldSelectDefaults = !selectionInitializedRef.current && availableIds.size > 0;
    if (shouldSelectDefaults) selectionInitializedRef.current = true;
    setSelectedCandidateIds(current => shouldSelectDefaults
      ? [...availableIds]
      : current.filter(id => availableIds.has(id)));
  }, [isOpen, selectedCampaignId, candidates]);

  if (!isOpen) return null;

  const currentCampaign = campaigns.find(c => c.id === selectedCampaignId);
  
  const aptCandidates = candidates.filter(cand => selectedCampaignId && cand.campaignId === selectedCampaignId && cand.selection?.stage === 'APTO_CAPACITACION');
  const eligibleCandidates = aptCandidates.filter(cand => isCandidateReadyForTraining(cand, selectedCampaignId));
  const assignedCandidates = aptCandidates.filter(isCandidateAlreadyInTraining);
  const availableIds = new Set(eligibleCandidates.map(cand => cand.id));

  const filteredCandidates = aptCandidates.filter(c => {
    const matchSearch = c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        c.dni.includes(searchTerm) ||
                        c.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch;
  });

  const toggleSelectCandidate = (id: string) => {
    if (!availableIds.has(id)) return;
    setSelectedCandidateIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (eligibleCandidates.length > 0 && selectedCandidateIds.length === eligibleCandidates.length) {
      setSelectedCandidateIds([]);
    } else {
      setSelectedCandidateIds(eligibleCandidates.map(c => c.id));
    }
  };

  const isAuthorizedRole = currentUser.role === 'ANALISTA_SELECCION' || currentUser.role === 'ADMIN' || currentUser.role === 'JEFE_SELECCION';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isAuthorizedRole) {
      setErrorMsg('Solo el rol Analista de Selección (o Jefatura) está autorizado para crear capacitaciones desde una convocatoria.');
      return;
    }
    if (!selectedCampaignId) {
      setErrorMsg('Por favor seleccione una convocatoria/campaña.');
      return;
    }
    if (!name.trim()) {
      setErrorMsg('El nombre de la capacitación es obligatorio.');
      return;
    }
    if (!startDate) {
      setErrorMsg('La fecha de inicio es obligatoria.');
      return;
    }
    if (selectedCandidateIds.length === 0) {
      setErrorMsg('Debe seleccionar al menos un postulante apto para iniciar el grupo de capacitación.');
      return;
    }
    if (selectedCandidateIds.some(id => !availableIds.has(id))) {
      setErrorMsg('La disponibilidad de los postulantes cambió. Actualiza la lista antes de crear la capacitación.');
      return;
    }

    try {
      setIsSubmitting(true);
      const createdCohort = await createTrainingFromSelection({
        name,
        code: code || `CAP-2026-${Date.now().toString().slice(-4)}`,
        campaignId: selectedCampaignId,
        candidateIds: selectedCandidateIds,
        startDate,
        schedule,
        modality,
        location,
        roomOrLink,
        ojtStartDate,
        ojtEndDate,
        observations,
        passingMinGrade,
        totalDays
      });

      onClose();
      // Redirect to Formación Capacitaciones and open created cohort
      setActiveModule('FORMACION_CAPACITACIONES');
      setSelectedCohortId(createdCohort.id);
    } catch (error: unknown) {
      setErrorMsg(getWorkerErrorMessage(error, 'No se pudo crear la capacitación. Revisa los datos e inténtalo nuevamente.'));
      if (error instanceof Error && ['CANDIDATE_ALREADY_IN_TRAINING', 'CANDIDATE_NOT_READY_FOR_TRAINING'].includes(error.message)) {
        window.dispatchEvent(new Event('talent:data-changed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        id="create-training-cohort-modal"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/90 text-white flex items-center justify-center shadow-md">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Pase a Formación</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Convocatoria &rarr; Formación
                </span>
              </div>
              <h2 className="text-lg font-bold text-white">Crear Capacitación desde Convocatoria</h2>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Convocatoria Bloqueada & Parámetros Principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            {/* Convocatoria Origen Bloqueada */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  Convocatoria de Origen (Bloqueada)
                </label>
                <span className="text-2xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                  Origen Vinculado
                </span>
              </div>
              {currentCampaign ? (
                <div className="bg-white border border-slate-300 rounded-xl p-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-2xs font-mono font-bold bg-slate-900 text-sky-400 px-2 py-0.5 rounded">
                        {currentCampaign.code}
                      </span>
                      <strong className="text-sm text-slate-900">{currentCampaign.title}</strong>
                    </div>
                    <p className="text-xs text-slate-500">
                      {currentCampaign.company || currentCampaign.client} • Sede: {currentCampaign.location} • Modalidad: {currentCampaign.managementType}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xs text-slate-500 block">Vacantes</span>
                    <span className="text-xs font-bold text-slate-900">{currentCampaign.vacancies} cupos</span>
                  </div>
                </div>
              ) : (
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                  required
                >
                  <option value="">Seleccione una convocatoria...</option>
                  {campaigns.map(camp => (
                    <option key={camp.id} value={camp.id}>
                      [{camp.code}] {camp.title} — {camp.company || camp.client}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Código de Capacitación */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Código de Capacitación</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ej: CAP-2026-081"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                required
              />
            </div>

            {/* Nombre del Grupo */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Nombre del Grupo / Cohort</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Capacitación Inicial Atención al Cliente"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Section 2: Fechas, Modalidad, Horario y Sede */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Fecha Inicio Capacitación
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Horario de Clases
              </label>
              <input
                type="text"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="Ej: 08:00 - 15:00"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                <Laptop className="w-3.5 h-3.5 text-slate-500" />
                Modalidad
              </label>
              <select
                value={modality}
                onChange={(e) => {
                  const val = e.target.value as 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';
                  setModality(val);
                  if (val === 'REMOTO') {
                    setLocation('Home Office');
                    setRoomOrLink('Microsoft Teams / Enlace Virtual');
                  } else {
                    setLocation('Sede Central - Lima Centro');
                    setRoomOrLink('Sala de Capacitación 302');
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="PRESENCIAL">Presencial</option>
                <option value="REMOTO">Remoto (Home Office)</option>
                <option value="HIBRIDO">Híbrido</option>
              </select>
              {currentCampaign?.managementType && modality !== currentCampaign.managementType && (
                <p className="text-xs text-amber-700" role="status">
                  La convocatoria indica modalidad {currentCampaign.managementType.toLowerCase()}. Confirma si este grupo tendrá una modalidad distinta.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                Sede
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej: Sede Central - Lima Centro"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Sala o Enlace Virtual</label>
              <input
                type="text"
                value={roomOrLink}
                onChange={(e) => setRoomOrLink(e.target.value)}
                placeholder="Ej: Sala 302 / Enlace Teams"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Días de Teoría / Nota Mínima</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="3"
                  max="30"
                  value={totalDays}
                  onChange={(e) => setTotalDays(Number(e.target.value))}
                  placeholder="Días"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-center"
                  title="Días de teoría"
                />
                <input
                  type="number"
                  min="11"
                  max="20"
                  value={passingMinGrade}
                  onChange={(e) => setPassingMinGrade(Number(e.target.value))}
                  placeholder="Min /20"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-center"
                  title="Nota mínima aprobatoria (ej: 14/20)"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Estimación OJT */}
          <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                Fecha Estimada Inicio OJT (En Piso)
              </label>
              <input
                type="date"
                value={ojtStartDate}
                onChange={(e) => setOjtStartDate(e.target.value)}
                className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                Fecha Estimada Fin OJT
              </label>
              <input
                type="date"
                value={ojtEndDate}
                onChange={(e) => setOjtEndDate(e.target.value)}
                className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 4: Postulantes Aptos para Capacitación */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Seleccionar Postulantes Aptos ({selectedCandidateIds.length} seleccionados de {eligibleCandidates.length} disponibles)
                </h3>
                <p className="text-xs text-slate-500">
                  Solo se pueden seleccionar postulantes aptos que aún no pertenecen a otro grupo.
                </p>
                {assignedCandidates.length > 0 && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    {assignedCandidates.length} ya {assignedCandidates.length === 1 ? 'está inscrito' : 'están inscritos'} en capacitación y no se incluirán.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={eligibleCandidates.length === 0}
                  className="px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-md border border-indigo-200 transition-colors"
                >
                  {selectedCandidateIds.length === eligibleCandidates.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                </button>
              </div>
            </div>

            {/* Postulantes list */}
            {aptCandidates.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                <p className="text-sm font-medium text-slate-600">
                  No hay candidatos en estado "Apto para capacitación" para esta convocatoria.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  En el módulo de Selección, evalúe a los candidatos y cámbielos a "Apto para capacitación".
                </p>
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                {filteredCandidates.map(cand => {
                  const isSelected = selectedCandidateIds.includes(cand.id);
                  const alreadyAssigned = isCandidateAlreadyInTraining(cand);
                  return (
                    <div
                      key={cand.id}
                      onClick={() => toggleSelectCandidate(cand.id)}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-disabled={alreadyAssigned}
                      tabIndex={alreadyAssigned ? -1 : 0}
                      onKeyDown={event => {
                        if (!alreadyAssigned && (event.key === ' ' || event.key === 'Enter')) {
                          event.preventDefault();
                          toggleSelectCandidate(cand.id);
                        }
                      }}
                      className={`p-3 flex items-center justify-between transition-colors ${
                        alreadyAssigned ? 'cursor-not-allowed bg-slate-50 opacity-70' : isSelected ? 'cursor-pointer bg-indigo-50/60' : 'cursor-pointer hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-indigo-600">
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 fill-indigo-600 text-white" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-300" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{cand.fullName}</span>
                            <span className="text-xs font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                              DNI {cand.dni}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                            <span>Tel: {cand.phone}</span>
                            <span>Email: {cand.email}</span>
                            {cand.recruiterName && <span>Reclutador: {cand.recruiterName}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {cand.selection?.scores?.overall && (
                          <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
                            Score: {cand.selection.scores.overall} pts
                          </span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 border rounded-full ${alreadyAssigned ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          {alreadyAssigned ? `Ya asignado${cand.training?.cohortCode ? ` · ${cand.training.cohortCode}` : ''}` : 'Disponible para capacitación'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 5: Observaciones */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Observaciones iniciales del grupo (Opcional)</label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={2}
              placeholder="Instrucciones para el formador, condiciones específicas del cliente o perfil requerido..."
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-indigo-500" />
            <span>El grupo iniciará con estado <strong className="text-amber-700">"Pendiente de Asignación"</strong> para que el Coordinador asigne Formador.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200/80 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selectedCandidateIds.length === 0 || isSubmitting}
              className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md shadow-indigo-500/20 flex items-center gap-2 transition-colors"
            >
              <span>{isSubmitting ? 'Creando capacitación…' : `Crear Capacitación (${selectedCandidateIds.length})`}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
