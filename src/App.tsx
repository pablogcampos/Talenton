import React, { lazy, Suspense, useEffect, useState } from 'react';
import { TalentProvider, useTalent } from './context/TalentContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginView } from './components/auth/LoginView';
import { SupabaseAccessGate } from './components/auth/SupabaseAccessGate';
import { ActiveNavModule, UserProfile } from './types';
import { SelectionRqAlert } from './components/selection/SelectionRqAlert';

import { VoicebotNotifications } from './components/selection/VoicebotNotifications';
const CinthiaView = lazy(() => import('./views/CinthiaView').then(m => ({default:m.CinthiaView})));
const PublicCinthiaView = lazy(() => import('./views/PublicCinthiaView').then(m => ({default:m.PublicCinthiaView})));
const VoicebotView = lazy(() => import('./views/VoicebotView').then(m => ({ default: m.VoicebotView })));
const LaborOffersView = lazy(() => import('./views/LaborOffersView').then(m => ({ default: m.LaborOffersView })));
const PublicOfferView = lazy(() => import('./views/PublicOfferView').then(m => ({ default: m.PublicOfferView })));
const Candidate360Modal = lazy(() => import('./components/candidates/Candidate360Modal').then(module => ({ default: module.Candidate360Modal })));
const DashboardView = lazy(() => import('./views/DashboardView').then(module => ({ default: module.DashboardView })));
const GlobalDashboardView = lazy(() => import('./views/GlobalDashboardView').then(module => ({ default: module.GlobalDashboardView })));
const ConvocatoriasView = lazy(() => import('./views/ConvocatoriasView').then(module => ({ default: module.ConvocatoriasView })));
const SelectionRqView = lazy(() => import('./views/SelectionRqView').then(module => ({ default: module.SelectionRqView })));
const OperationsAdminView = lazy(() => import('./views/OperationsAdminView').then(module => ({ default: module.OperationsAdminView })));
const PublicOperationsRqView = lazy(() => import('./views/PublicOperationsRqView').then(module => ({ default: module.PublicOperationsRqView })));
const MisConvocatoriasView = lazy(() => import('./views/MisConvocatoriasView').then(module => ({ default: module.MisConvocatoriasView })));
const CandidatosView = lazy(() => import('./views/CandidatosView').then(module => ({ default: module.CandidatosView })));
const CaptacionView = lazy(() => import('./views/CaptacionView').then(module => ({ default: module.CaptacionView })));
const PublicCaptureView = lazy(() => import('./views/PublicCaptureView').then(module => ({ default: module.PublicCaptureView })));
const TrainingSurveysView = lazy(() => import('./views/TrainingSurveyView').then(module => ({ default: module.TrainingSurveysView })));
const PublicTrainingSurveyView = lazy(() => import('./views/TrainingSurveyView').then(module => ({ default: module.PublicTrainingSurveyView })));
const FormacionDashboardView = lazy(() => import('./views/FormacionDashboardView').then(module => ({ default: module.FormacionDashboardView })));
const CapacitacionesView = lazy(() => import('./views/CapacitacionesView').then(module => ({ default: module.CapacitacionesView })));
const MisCapacitacionesView = lazy(() => import('./views/MisCapacitacionesView').then(module => ({ default: module.MisCapacitacionesView })));
const ParticipantesView = lazy(() => import('./views/ParticipantesView').then(module => ({ default: module.ParticipantesView })));
const OjtView = lazy(() => import('./views/OjtView').then(module => ({ default: module.OjtView })));
const ContratacionesView = lazy(() => import('./views/ContratacionesView').then(module => ({ default: module.ContratacionesView })));
const AnaliticaView = lazy(() => import('./views/AnaliticaView').then(module => ({ default: module.AnaliticaView })));
const ConfiguracionView = lazy(() => import('./views/ConfiguracionView').then(module => ({ default: module.ConfiguracionView })));
const UsuariosView = lazy(() => import('./views/UsuariosView').then(module => ({ default: module.UsuariosView })));
const CandidateCreateModal = lazy(() => import('./components/modals/CandidateCreateModal').then(module => ({ default: module.CandidateCreateModal })));
const ConvocatoriaModal = lazy(() => import('./components/modals/ConvocatoriaModal').then(module => ({ default: module.ConvocatoriaModal })));
const CreateTrainingCohortModal = lazy(() => import('./components/modals/CreateTrainingCohortModal').then(module => ({ default: module.CreateTrainingCohortModal })));

const rolesForView: Partial<Record<ActiveNavModule, UserProfile['role'][]>> = {
  OPERACIONES_ADMIN: ['ADMIN', 'JEFE_OPERACIONES', 'COORDINADOR_OPERACIONES'],
  SELECCION_CINTHIA: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'],
  SELECCION_VOICEBOT: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'],
  SELECCION_PROPUESTAS: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'],
  SELECCION_RQ: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION'],
  SELECCION_CAPTACION: ['ADMIN', 'RECLUTADOR', 'ANALISTA_SELECCION'],
  SELECCION_DASHBOARD: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'],
  CONVOCATORIAS: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION'],
  SELECCION_CONVOCATORIAS: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION'],
  MIS_CONVOCATORIAS: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'],
  SELECCION_MIS_CONVOCATORIAS: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'],
  CANDIDATOS: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'],
  SELECCION_CANDIDATOS: ['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'],
  FORMACION_DASHBOARD: ['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION', 'FORMADOR'],
  FORMACION_CAPACITACIONES: ['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION'],
  FORMACION_MIS_CAPACITACIONES: ['ADMIN', 'COORDINADOR_FORMACION', 'FORMADOR'],
  FORMACION_PARTICIPANTES: ['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION', 'FORMADOR'],
  FORMACION_OJT: ['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION', 'FORMADOR'],
  FORMACION_ENCUESTAS: ['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION', 'FORMADOR'],
  TALENTO_CONTRATACIONES: ['ADMIN', 'JEFE_TALENTO', 'ANALISTA_TALENTO'],
  ANALITICA: ['ADMIN', 'JEFE_SELECCION', 'JEFE_FORMACION', 'JEFE_TALENTO'],
  CONFIGURACION: ['ADMIN'],
  ADMIN_USUARIOS: ['ADMIN'],
};

const defaultViewFor = (user: UserProfile): ActiveNavModule => {
  if (user.role === 'ADMIN') return 'ADMIN_USUARIOS';
  if (['JEFE_OPERACIONES','COORDINADOR_OPERACIONES'].includes(user.role)) return 'OPERACIONES_ADMIN';
  if (user.role === 'RECLUTADOR') return 'MIS_CONVOCATORIAS';
  if (['JEFE_SELECCION', 'ANALISTA_SELECCION'].includes(user.role)) return 'SELECCION_DASHBOARD';
  if (user.role === 'FORMADOR') return 'FORMACION_MIS_CAPACITACIONES';
  if (['JEFE_FORMACION', 'COORDINADOR_FORMACION'].includes(user.role)) return 'FORMACION_DASHBOARD';
  return 'TALENTO_CONTRATACIONES';
};

const MainLayout: React.FC = () => {
  const { 
    activeModule, 
    selectedCandidateId, 
    closeCandidate360,
    currentUser,
    setActiveModule,
    connectionError,
  } = useTalent();

  useEffect(() => {
    const normalized = activeModule === 'INICIO' ? 'SELECCION_DASHBOARD' : activeModule;
    const allowed = (rolesForView[normalized]?.includes(currentUser.role) ?? false) && (normalized !== 'OPERACIONES_ADMIN' || currentUser.role === 'ADMIN' || currentUser.allowedModules?.includes('OPERACIONES'));
    if (!allowed) setActiveModule(defaultViewFor(currentUser));
  }, [activeModule, currentUser, setActiveModule]);

  // Modals state
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [isCohortModalOpen, setIsCohortModalOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="talent-app flex h-screen bg-slate-100 overflow-hidden font-sans antialiased text-slate-900">
      {/* Sidebar navigation */}
      <Sidebar navigationOpen={navigationOpen} onCloseNavigation={() => setNavigationOpen(false)} />
      {navigationOpen && <button className="talent-navigation-backdrop" aria-label="Cerrar menú" onClick={() => setNavigationOpen(false)} />}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top Header */}
        <Header 
          navigationOpen={navigationOpen}
          onToggleNavigation={() => setNavigationOpen(open => !open)}
          onOpenNewCandidateModal={() => setIsCandidateModalOpen(true)}
          onOpenNewCampaignModal={() => setIsCampaignModalOpen(true)}
          onOpenNewCohortModal={() => setIsCohortModalOpen(true)}
        />

        <VoicebotNotifications />
        {/* Scrollable View Container */}
        <main className="talent-content flex-1 overflow-y-auto custom-scrollbar">
          {connectionError && <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{connectionError}<button className="ml-4 underline" onClick={()=>window.dispatchEvent(new Event('talent:data-changed'))}>Reintentar</button></div>}
          <Suspense fallback={<div className="py-12 text-center text-slate-500">Cargando módulo…</div>}>
          <div className="talent-view w-full space-y-6">
            {(activeModule === 'INICIO' || activeModule === 'SELECCION_DASHBOARD') && <SelectionRqAlert />}
            {activeModule === 'SELECCION_CINTHIA' && <CinthiaView />}
            {activeModule === 'SELECCION_VOICEBOT' && <VoicebotView />}
            {activeModule === 'SELECCION_PROPUESTAS' && <LaborOffersView />}
            {activeModule === 'SELECCION_RQ' && <SelectionRqView />}
            {activeModule === 'OPERACIONES_ADMIN' && <OperationsAdminView />}
            {activeModule === 'SELECCION_CAPTACION' && <CaptacionView />}
            
            {/* SELECCIÓN MODULE */}
            {(activeModule === 'INICIO' || activeModule === 'SELECCION_DASHBOARD' || (activeModule as string) === 'DASHBOARD') && (
              currentUser.globalAdmin&&!currentUser.managedCompany?<GlobalDashboardView/>:<DashboardView />
            )}
            
            {(activeModule === 'CONVOCATORIAS' || activeModule === 'SELECCION_CONVOCATORIAS') && (
              <ConvocatoriasView />
            )}
            
            {activeModule === 'MIS_CONVOCATORIAS' && (
              <MisConvocatoriasView />
            )}
            
            {(activeModule === 'CANDIDATOS' || activeModule === 'SELECCION_CANDIDATOS') && (
              <CandidatosView />
            )}

            {/* FORMACIÓN & OJT MODULE */}
            {activeModule === 'FORMACION_DASHBOARD' && (
              currentUser.globalAdmin&&!currentUser.managedCompany?<GlobalDashboardView/>:<FormacionDashboardView />
            )}

            {activeModule === 'FORMACION_CAPACITACIONES' && (
              <CapacitacionesView onOpenNewCohortModal={() => setIsCohortModalOpen(true)} />
            )}

            {activeModule === 'FORMACION_MIS_CAPACITACIONES' && (
              <MisCapacitacionesView />
            )}

            {activeModule === 'FORMACION_PARTICIPANTES' && (
              <ParticipantesView />
            )}

            {activeModule === 'FORMACION_OJT' && (
              <OjtView />
            )}

            {/* TALENTO / CONTRATACIONES */}
            {activeModule === 'FORMACION_ENCUESTAS' && <TrainingSurveysView />}
            {activeModule === 'TALENTO_CONTRATACIONES' && (
              <ContratacionesView />
            )}

            {/* ANALÍTICA & CONFIGURACIÓN & USUARIOS RBAC */}
            {activeModule === 'ANALITICA' && (
              currentUser.globalAdmin&&!currentUser.managedCompany?<GlobalDashboardView/>:<AnaliticaView />
            )}
            
            {activeModule === 'ADMIN_USUARIOS' && (
              <UsuariosView />
            )}

            {activeModule === 'CONFIGURACION' && (
              <ConfiguracionView />
            )}
          </div>
          </Suspense>
        </main>
      </div>

      {/* Unified 360° Candidate Record Modal */}
      <Suspense fallback={null}>
        {selectedCandidateId && (
          <Candidate360Modal
            candidateId={selectedCandidateId}
            onClose={closeCandidate360}
          />
        )}

      {/* Global Modals */}
      {isCandidateModalOpen && (
        <CandidateCreateModal
          isOpen
          onClose={() => setIsCandidateModalOpen(false)}
        />
      )}
      
      {isCampaignModalOpen && (
        <ConvocatoriaModal
          isOpen
          onClose={() => setIsCampaignModalOpen(false)}
        />
      )}
      
      {isCohortModalOpen && (
        <CreateTrainingCohortModal
          isOpen
          onClose={() => setIsCohortModalOpen(false)}
        />
      )}
      </Suspense>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated, mustChangePassword } = useTalent();
  return isAuthenticated ? (mustChangePassword ? <SupabaseAccessGate /> : <MainLayout />) : <LoginView />;
};

export default function App() {
  const cinthiaRoute=window.location.pathname.match(/^\/cinthia\/([a-f0-9]{64})$/);
  if(cinthiaRoute)return <Suspense fallback={<p className="p-6">Cargando CinthIA…</p>}><PublicCinthiaView key={cinthiaRoute[1]} token={cinthiaRoute[1]}/></Suspense>;
  const groupOfferRoute = window.location.pathname.match(/^\/propuesta\/capacitacion\/([a-f0-9]{64})$/);
  if (groupOfferRoute) return <Suspense fallback={<p className="p-6">Cargando propuesta…</p>}><PublicOfferView key={groupOfferRoute[1]} token={groupOfferRoute[1]} groupLink /></Suspense>;
  const offerRoute = window.location.pathname.match(/^\/propuesta\/([a-f0-9]{64})$/);
  if (offerRoute) return <Suspense fallback={<p className="p-6">Cargando propuesta…</p>}><PublicOfferView token={offerRoute[1]} /></Suspense>;
  const surveyRoute = window.location.pathname.match(/^\/encuestas\/capacitacion\/([0-9a-f-]{36})$/);
  if (surveyRoute) return <Suspense fallback={<p className="p-6">Cargando encuesta…</p>}><PublicTrainingSurveyView token={surveyRoute[1]} /></Suspense>;
  const operationsRoute = window.location.pathname.match(/^\/operaciones\/rq\/([a-f0-9]{48})$/);
  if (operationsRoute) return <Suspense fallback={<p className="p-6">Cargando RQ…</p>}><PublicOperationsRqView token={operationsRoute[1]} /></Suspense>;
  const captureRoute = window.location.pathname.match(/^\/captacion\/([a-f0-9]{48})$/);
  if (captureRoute) return <Suspense fallback={<p className="p-6">Cargando formulario…</p>}><PublicCaptureView token={captureRoute[1]} /></Suspense>;
  return (
    <TalentProvider>
      <AppContent />
    </TalentProvider>
  );
}
