import { CandidateTransfer } from '../components/candidates/CandidateTransfer';
import { CaptureLinkToCampaign } from '../components/candidates/CaptureLinkToCampaign';
import React, { useState } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  Phone, 
  Mail, 
  MapPin, 
  Building2, 
  Calendar, 
  UserCheck, 
  UserX, 
  ArrowRight, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  Award,
  MoreVertical,
  SlidersHorizontal,
  ChevronLeft,
  Download
} from 'lucide-react';
import { useTalent } from '../context/TalentContext';
import { CandidateRecord, SelectionStage } from '../types';
import { CandidateCreateModal } from '../components/modals/CandidateCreateModal';
import { Candidate360Modal } from '../components/candidates/Candidate360Modal';
import { getExpedientAnalysis } from '../utils/expedientUtils';
import { IdentityAvatar } from '../components/common/IdentityAvatar';
import { captureApi } from '../services/captureApi';
import { getWorkerErrorMessage } from '../services/workerApi';
import { buildCandidateFormSheets } from '../utils/candidateFormExport';

export const CandidatosView: React.FC = () => {
  const { 
    scopedCandidates, 
    scopedCampaigns, 
    availableUsers, 
    currentUser, 
    openCandidate360, 
    selectedCandidateId, 
    closeCandidate360 
  } = useTalent();

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('ALL');
  const [selectedRecruiter, setSelectedRecruiter] = useState('ALL');
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedExpedient, setSelectedExpedient] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const canExportForms = ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'].includes(currentUser.role);

  const handleExportForms = async () => {
    setExporting(true); setExportError('');
    try {
      const result = await captureApi.exportAll();
      if (result.items.length !== result.total) throw new Error('La consulta de formularios quedó incompleta. No se descargó un archivo parcial.');
      const { downloadXlsx } = await import('../utils/xlsxExport');
      downloadXlsx(buildCandidateFormSheets(scopedCandidates, result.items), `talent-on-formularios-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      setExportError(getWorkerErrorMessage(error, 'No se pudo exportar la información completa de los formularios.'));
    } finally { setExporting(false); }
  };

  // Distinct sources
  const sources = Array.from(new Set(scopedCandidates.map(c => c.source))).filter(Boolean);
  const getCandidateName = (candidate: CandidateRecord) => candidate.fullName?.trim() || [candidate.firstName, candidate.lastName].filter(Boolean).join(' ').trim() || 'Nombre no registrado';

  // Filtered candidate list
  const filteredCandidates = scopedCandidates.filter(c => {
    // Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match = getCandidateName(c).toLowerCase().includes(q) ||
                    (c.dni || '').includes(q) ||
                    (c.phone || '').includes(q) ||
                    (c.email || '').toLowerCase().includes(q);
      if (!match) return false;
    }

    // Campaign
    if (selectedCampaign !== 'ALL' && c.campaignId !== selectedCampaign) return false;

    // Recruiter
    if (selectedRecruiter !== 'ALL' && c.recruiterId !== selectedRecruiter) return false;

    // Source
    if (selectedSource !== 'ALL' && c.source !== selectedSource) return false;

    // Stage
    if (selectedStage !== 'ALL' && c.selection?.stage !== selectedStage) return false;

    // Status
    if (selectedStatus !== 'ALL' && c.selection?.status !== selectedStatus) return false;

    if (selectedExpedient !== 'ALL' && getExpedientAnalysis(c).status !== selectedExpedient) return false;

    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedCandidates = filteredCandidates.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getStageBadge = (stage: SelectionStage) => {
    const labels: Partial<Record<SelectionStage, string>> = { NUEVO: 'Nuevo', CONTACTADO: 'Contactado', ENTREVISTA: 'Entrevista', VERIFICACION_TECNICA: 'Verificación técnica', EVALUACIONES: 'Evaluaciones', APTO_CAPACITACION: 'Apto capacitación', DESCARTADO: 'Descartado' };
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-2xs font-semibold ${stage === 'DESCARTADO' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-800'}`}>{labels[stage] || stage || 'Sin etapa'}</span>;
  };

  return (
    <div className="space-y-4 pb-8">
      <section className="flex flex-wrap items-start justify-between gap-4 px-1">
        <div><h2 className="text-lg font-bold text-[#0C1E35]">Directorio de candidatos</h2><p className="mt-0.5 text-2xs text-slate-500">Postulantes, contactos, evaluaciones y trazabilidad en una sola vista.</p><div className="mt-3 flex items-center gap-1.5 text-2xs font-medium text-slate-600"><Users className="h-3.5 w-3.5 text-[#143A56]" />{scopedCandidates.length} {scopedCandidates.length === 1 ? 'candidato registrado' : 'candidatos registrados'}</div></div>
        <div className="flex flex-wrap items-center gap-2">
          {canExportForms && <button type="button" disabled={exporting} onClick={() => void handleExportForms()} className="flex items-center gap-2 rounded-lg border border-[#143A56] bg-white px-4 py-2.5 text-xs font-bold text-[#143A56] hover:bg-sky-50 disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? 'Preparando Excel…' : 'Exportar formularios'}</button>}
          <button type="button" onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2 rounded-lg bg-[#143A56] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#0C1E35]"><Plus className="h-4 w-4" />Registrar postulante</button>
        </div>
      </section>
      {exportError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">{exportError}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1.6fr)_minmax(190px,1fr)_minmax(180px,0.9fr)_auto]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={searchTerm} onChange={event => { setSearchTerm(event.target.value); setPage(1); }} placeholder="Buscar candidato por nombre, DNI, teléfono o email..." className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-100" /></div>
          <select value={selectedCampaign} onChange={event => { setSelectedCampaign(event.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-800"><option value="ALL">Todas las convocatorias</option>{scopedCampaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select>
          <select value={selectedStage} onChange={event => { setSelectedStage(event.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-800"><option value="ALL">Todas las etapas</option><option value="NUEVO">Nuevo</option><option value="CONTACTADO">Contactado</option><option value="ENTREVISTA">Entrevista</option><option value="VERIFICACION_TECNICA">Verificación técnica</option><option value="EVALUACIONES">Evaluaciones</option><option value="APTO_CAPACITACION">Apto capacitación</option><option value="DESCARTADO">Descartado</option></select>
          <details className="group relative"><summary className="flex h-full min-h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-[#143A56] hover:bg-sky-50 [&::-webkit-details-marker]:hidden"><SlidersHorizontal className="h-3.5 w-3.5" />Más filtros</summary><div className="absolute right-0 top-12 z-20 w-64 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"><select value={selectedRecruiter} onChange={event => { setSelectedRecruiter(event.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><option value="ALL">Todos los responsables</option>{availableUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select><select value={selectedSource} onChange={event => { setSelectedSource(event.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><option value="ALL">Todas las fuentes</option>{sources.map(source => <option key={source} value={source}>{source}</option>)}</select><select value={selectedStatus} onChange={event => { setSelectedStatus(event.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><option value="ALL">Todos los estados</option><option value="ACTIVO">Activo</option><option value="APTO_CAPACITACION">Apto capacitación</option><option value="NO_APTO">No apto</option><option value="DESCARTADO">Descartado</option></select><select value={selectedExpedient} onChange={event => { setSelectedExpedient(event.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><option value="ALL">Todos los expedientes</option><option value="COMPLETO">Completo</option><option value="INCOMPLETO">Incompleto</option><option value="PENDIENTE_VALIDACION">Pendiente de validación</option><option value="OBSERVADO">Observado</option></select></div></details>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="py-3 px-3">Postulante</th>
                <th className="py-3 px-3">Contacto</th>
                <th className="py-3 px-3">Convocatoria</th>
                <th className="py-3 px-3">Responsable</th>
                <th className="py-3 px-3">Expediente</th>
                <th className="py-3 px-3">Etapa actual</th>
                <th className="py-3 px-3">Estado</th>
                <th className="py-3 px-3 text-right">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-slate-500"><Users className="mx-auto mb-2 h-7 w-7 text-slate-300" /><strong className="block text-slate-800">No se encontraron candidatos</strong><span className="mt-1 block text-2xs">Prueba con otros criterios de búsqueda.</span></td>
                </tr>
              ) : (
                pagedCandidates.map(cand => {
                  const isDiscarded = cand.currentStage === 'DESCARTADO' || cand.selection?.status === 'NO_APTO';
                  const isApto = cand.selection?.stage === 'APTO_CAPACITACION';
                  const candidateName = getCandidateName(cand);
                  const campaign = scopedCampaigns.find(item => item.id === cand.campaignId);
                  const expedient = getExpedientAnalysis(cand);
                  const expedientComplete = expedient.status === 'COMPLETO';

                  return (
                    <tr key={cand.id} className="hover:bg-slate-50/80 transition-colors">
                      
                      {/* Candidate Avatar & Name */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <IdentityAvatar src={cand.avatarUrl} name={candidateName} className="h-8 w-8 rounded-full border border-slate-200 text-2xs" />
                          <div className="min-w-0"><div className="max-w-[180px] truncate font-semibold leading-tight text-slate-900" title={candidateName}>{candidateName}</div><div className="mt-0.5 text-2xs text-slate-500">DNI: {cand.dni || 'No registrado'}</div></div>
                        </div>
                      </td>

                      {/* Contact Info */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 text-slate-700"><Phone className="h-3 w-3 text-slate-400" />{cand.phone || 'No registrado'}</div><div className="mt-1 flex max-w-[170px] items-center gap-1.5 truncate text-2xs text-slate-500"><Mail className="h-3 w-3 shrink-0" />{cand.email || 'No registrado'}</div>
                      </td>

                      {/* Convocatoria */}
                      <td className="max-w-[190px] px-3 py-3">
                        <div className="text-2xs font-bold text-sky-700">{cand.captureOnly ? 'Captación' : cand.campaignCode || campaign?.code || 'Sin código'}</div><div className="mt-0.5 truncate font-semibold text-slate-900" title={cand.campaignName}>{cand.captureOnly ? 'Pendiente de vincular' : cand.campaignName || campaign?.title || 'Sin convocatoria'}</div><div className="mt-0.5 truncate text-2xs text-slate-500">{campaign?.company || campaign?.client || currentUser.companies?.find(company=>company.id===cand.companyId)?.name || cand.companyId || 'Sin empresa'} · {campaign?.location || 'Sin sede'}</div>
                      </td>

                      {/* Selector */}
                      <td className="px-3 py-3 font-medium text-slate-700">{cand.recruiterName || 'Sin asignar'}<span className="mt-0.5 block text-2xs text-slate-500">Responsable</span></td>

                      {/* Expediente Badge */}
                      <td className="px-3 py-3"><div className={`font-bold ${expedientComplete ? 'text-emerald-700' : 'text-amber-600'}`}>{expedient.percentage}%</div><span className="text-2xs text-slate-500">{expedientComplete ? 'Completo' : 'Incompleto'}</span><div className="mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${expedientComplete ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${expedient.percentage}%` }} /></div></td>

                      {/* Etapa Actual */}
                      <td className="py-3 px-3">
                        {cand.captureOnly ? <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-2xs font-semibold text-sky-800">Captación</span> : getStageBadge(cand.selection?.stage)}
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-2xs font-semibold ${
                          cand.captureOnly ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                          isDiscarded ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                          'bg-emerald-50 text-emerald-700'
                        }`}>
                          {cand.captureOnly ? 'Pendiente de vincular' : isDiscarded ? 'Descartado' : isApto ? 'Activo' : 'Activo'}
                        </span>
                      </td>

                      {/* Action: Open 360 */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">{cand.captureOnly && ['ADMIN','RECLUTADOR','ANALISTA_SELECCION'].includes(currentUser.role) && <CaptureLinkToCampaign candidateId={cand.id} companyId={cand.companyId} />}<button type="button" onClick={() => openCandidate360(cand.id)} className="flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-2xs font-semibold text-sky-800 hover:bg-sky-50">Ficha 360°<ChevronRight className="h-3 w-3" /></button><CandidateTransfer candidate={cand} /></div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2.5 text-2xs text-slate-500"><span>Mostrando {filteredCandidates.length ? (currentPage - 1) * pageSize + 1 : 0} a {Math.min(currentPage * pageSize, filteredCandidates.length)} de {filteredCandidates.length} candidatos</span><div className="flex items-center gap-2"><button type="button" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))} className="rounded-md border border-slate-200 p-1.5 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button><span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-[#143A56] px-2 font-semibold text-white">{currentPage}</span><button type="button" disabled={currentPage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))} className="rounded-md border border-slate-200 p-1.5 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button><select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="ml-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"><option value={10}>10 por página</option><option value={20}>20 por página</option><option value={50}>50 por página</option></select></div></footer>
      </section>

      {/* Create Modal */}
      <CandidateCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* 360 Modal */}
      {selectedCandidateId && (
        <Candidate360Modal
          candidateId={selectedCandidateId}
          onClose={closeCandidate360}
        />
      )}

    </div>
  );
};
