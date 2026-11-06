import React, { useState } from 'react';
import { 
  Search, 
  Plus, 
  Filter, 
  Bell, 
  HelpCircle, 
  ChevronDown, 
  UserPlus, 
  Briefcase, 
  GraduationCap,
  Sparkles,
  Building,
  CheckCircle,
  X,
  Building2,
  Users,
  Menu
} from 'lucide-react';
import { useTalent } from '../../context/TalentContext';
import { ActiveNavModule } from '../../types';
import { IdentityAvatar } from '../common/IdentityAvatar';

interface HeaderProps {
  navigationOpen?: boolean;
  onToggleNavigation?: () => void;
  onOpenNewCandidateModal: () => void;
  onOpenNewCampaignModal: () => void;
  onOpenNewCohortModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  navigationOpen,
  onToggleNavigation,
  onOpenNewCandidateModal,
  onOpenNewCampaignModal,
  onOpenNewCohortModal
}) => {
  const { 
    activeModule, 
    searchQuery, 
    setSearchQuery, 
    scopedCampaigns, 
    selectedCampaignId, 
    setSelectedCampaignId,
    scopedCandidates,
    openCandidate360,
    currentUser
  } = useTalent();

  const [showNotifications, setShowNotifications] = useState(false);

  // Derive title from active module
  const getModuleMeta = (mod: ActiveNavModule) => {
    switch (mod) {
      case 'OPERACIONES_ADMIN': return { title: 'Requerimientos y enlaces', subtitle: 'RQ por empresa', section: 'Operaciones' };
      case 'SELECCION_VOICEBOT': return { title: 'Leads Voicebot', subtitle: 'Bandeja compartida de leads', section: 'Selección' };
      case 'SELECCION_PROPUESTAS': return { title: 'Propuesta Laboral', subtitle: 'Propuestas, asignación y firmas', section: 'Selección' };
      case 'SELECCION_CAPTACION': return { title: 'Captación', subtitle: 'Enlaces y bandeja de postulantes', section: 'Selección' };
      case 'INICIO':
      case 'SELECCION_DASHBOARD':
        return {
          title: 'Panel de Selección',
          subtitle: 'Indicadores globales, embudo de conversión, Pareto de motivos de rechazo y desempeño por selector',
          section: 'Selección'
        };
      case 'CONVOCATORIAS':
      case 'SELECCION_CONVOCATORIAS':
        return {
          title: 'Gestión de Convocatorias',
          subtitle: 'Administración de requerimientos (RQ), sueldos, bonos, sedes y asignación de selectores',
          section: 'Selección'
        };
      case 'MIS_CONVOCATORIAS':
        return {
          title: currentUser.role === 'JEFE_SELECCION' ? 'Pipeline de Convocatorias' : 'Mis Convocatorias Asignadas',
          subtitle: 'Pipeline Kanban CRM, seguimiento diario de postulantes y cumplimiento de cuotas',
          section: 'Selección'
        };
      case 'CANDIDATOS':
      case 'SELECCION_CANDIDATOS':
        return {
          title: 'Directorio de Candidatos',
          subtitle: 'Ficha 360°, datos personales, historial de contactos, evaluaciones y trazabilidad',
          section: 'Selección'
        };
      case 'FORMACION_CAPACITACIONES':
        return {
          title: 'Capacitaciones & Generaciones',
          subtitle: 'Control diario de asistencia, notas por módulo y gestión de bajas',
          section: '2. Formación'
        };
      case 'FORMACION_DASHBOARD':
        return {
          title: currentUser.role === 'FORMADOR' ? 'Mi Panel de Formación' : 'Panel de Formación',
          subtitle: currentUser.role === 'FORMADOR' ? 'Indicadores de tus grupos y participantes asignados' : 'Indicadores de capacitación, OJT y avance de grupos',
          section: '2. Formación'
        };
      case 'FORMACION_MIS_CAPACITACIONES':
        return {
          title: currentUser.role === 'FORMADOR' ? 'Mis Capacitaciones Asignadas' : 'Grupos Asignados',
          subtitle: 'Gestión operativa de los grupos bajo tu responsabilidad',
          section: '2. Formación'
        };
      case 'FORMACION_PARTICIPANTES':
        return {
          title: 'Participantes de Formación',
          subtitle: 'Seguimiento de participantes dentro del alcance autorizado',
          section: '2. Formación'
        };
      case 'FORMACION_OJT':
        return {
          title: 'Piso de Operaciones (OJT)',
          subtitle: 'Seguimiento diario de desempeño, llamadas, TMO, conversión y coaching',
          section: '2. Formación'
        };
      case 'TALENTO_CONTRATACIONES':
        return {
          title: 'Gestión de Talento & Contrataciones',
          subtitle: 'Validación de expedientes, registro de contratos, firma y fecha de alta',
          section: '3. Gestión de Talento'
        };
      case 'ANALITICA':
        return {
          title: 'Analítica de Dotación & Funnel',
          subtitle: 'Métricas de conversión, deserciones por etapa y tiempos de contratación',
          section: 'Reportes'
        };
      case 'CONFIGURACION':
        return {
          title: 'Configuración de Parámetros',
          subtitle: 'Estados de selección, motivos de baja, KPIs de OJT y plantillas',
          section: '5. Administración'
        };
      case 'ADMIN_USUARIOS':
        return {
          title: 'Gestión de Usuarios & Roles (RBAC)',
          subtitle: 'Creación de colaboradores, asignación de perfiles, permisos por módulo y simulación de vistas',
          section: '5. Administración'
        };
      default:
        return {
          title: 'Talent-On',
          subtitle: 'Plataforma integral de gestión de talento y operaciones',
          section: 'TalentCC'
        };
    }
  };

  const currentMeta = getModuleMeta(activeModule);

  // Quick live search matching candidates
  const matchingCandidates = searchQuery.trim().length > 1 
    ? scopedCandidates.filter(c => 
        c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.dni.includes(searchQuery) ||
        c.campaignName.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  const aptosCount = scopedCandidates.filter(c => c.selection?.stage === 'APTO_CAPACITACION').length;

  return (
    <header className="talent-header bg-white border-b border-slate-200 flex items-center justify-between z-20 shrink-0 shadow-[0_2px_12px_rgba(12,30,53,0.025)]">
      {/* Left: View title & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button className="talent-navigation-toggle" aria-label="Abrir menú" aria-controls="talent-navigation" aria-expanded={navigationOpen} onClick={onToggleNavigation}><Menu size={20} /></button>
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>{currentMeta.section}</span>
            <span>/</span>
            <span className="text-slate-800 font-semibold">{currentMeta.title}</span>
          </div>
        </div>
      </div>

      {/* Center/Right: Campaign Filter & Quick Search */}
      <div className="flex items-center gap-3">
        
        {/* Global Instant Search */}
        <span className="hidden text-xs text-slate-500 lg:inline">Talent-On · Gestión unificada</span>
        {!['JEFE_OPERACIONES','COORDINADOR_OPERACIONES'].includes(currentUser.role) && <div className="relative w-64 hidden sm:block">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por postulante o DNI..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-7 py-2 text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Quick search floating dropdown */}
          {matchingCandidates.length > 0 && (
            <div className="absolute top-full mt-1.5 left-0 w-80 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 divide-y divide-slate-100">
              <div className="text-2xs uppercase font-bold text-slate-500 px-2 py-1">
                Postulantes encontrados ({matchingCandidates.length})
              </div>
              {matchingCandidates.map(c => (
                <div
                  key={c.id}
                  onClick={() => {
                    openCandidate360(c.id);
                    setSearchQuery('');
                  }}
                  className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <IdentityAvatar src={c.avatarUrl} name={c.fullName} className="w-7 h-7 rounded-full text-[9px]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 truncate">{c.fullName}</div>
                    <div className="text-2xs text-slate-500 truncate">DNI: {c.dni} • {c.campaignName}</div>
                  </div>
                  <span className="text-2xs px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold shrink-0">
                    {c.selection?.stage || c.currentStage}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>}

        {/* Notifications */}
        {!['JEFE_OPERACIONES','COORDINADOR_OPERACIONES'].includes(currentUser.role) && <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2.5 text-slate-500 hover:text-sky-700 hover:bg-sky-50 border border-transparent hover:border-sky-100 rounded-xl relative transition-colors cursor-pointer"
            title="Notificaciones y Alertas"
          >
            <Bell className="w-4 h-4" />
            {aptosCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 text-xs">
              <div className="font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>Notificaciones de Selección</span>
                <span className="text-2xs text-emerald-600 font-bold">Activas</span>
              </div>
              <div className="py-2 space-y-2">
                {aptosCount > 0 ? (
                  <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-emerald-800 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-xs">{aptosCount} Candidato(s) Apto(s)</div>
                      <div className="text-2xs text-emerald-700">Listos para pase a grupo de Capacitación.</div>
                    </div>
                  </div>
                ) : null}
                <div className="p-2 bg-slate-50 rounded-lg text-slate-600 text-2xs">
                  Proceso de captación activo en {scopedCampaigns.length} convocatorias.
                </div>
              </div>
            </div>
          )}
        </div>}

      </div>
    </header>
  );
};
