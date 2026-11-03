import React from 'react';
import { LucideIcon } from 'lucide-react';
import { 
  BarChart3, 
  ClipboardList,
  Building2, 
  Layers, 
  Users, 
  GraduationCap, 
  Headphones, 
  Briefcase, 
  PieChart, 
  Settings, 
  ShieldCheck, 
  UserPlus, 
  Sparkles,
  ChevronRight,
  Shield,
  LogOut
} from 'lucide-react';
import { useTalent } from '../../context/TalentContext';
import { ActiveNavModule, AppModuleName, UserRole } from '../../types';
import { IdentityAvatar } from '../common/IdentityAvatar';

export const Sidebar: React.FC<{ navigationOpen?: boolean; onCloseNavigation?: () => void }> = ({ navigationOpen, onCloseNavigation }) => {
  const [expandedModule, setExpandedModule] = React.useState<AppModuleName | 'OPERACIONES' | null>('SELECCION');
  const { 
    activeModule, 
    setActiveModule, 
    candidates, 
    campaigns, 
    scopedCampaigns,
    scopedCandidates,
    myAssignedCampaigns,
    cohorts,
    currentUser,
    availableUsers,
    logout
  } = useTalent();

  // Helper to check module permission
  const hasModule = (mod: AppModuleName): boolean => {
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.allowedModules) {
      return currentUser.allowedModules.includes(mod);
    }
    // Fallback based on legacy role
    if (mod === 'SELECCION') return ['JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'].includes(currentUser.role);
    if (mod === 'FORMACION') return ['JEFE_FORMACION', 'COORDINADOR_FORMACION', 'FORMADOR', 'ANALISTA_SELECCION'].includes(currentUser.role);
    if (mod === 'TALENTO') return ['JEFE_TALENTO', 'ANALISTA_TALENTO'].includes(currentUser.role);
    if (mod === 'ANALITICA') return ['JEFE_SELECCION', 'JEFE_FORMACION', 'JEFE_TALENTO'].includes(currentUser.role);
    if (mod === 'ADMINISTRACION') return currentUser.role === 'ADMIN';
    if (mod === 'OPERACIONES') return ['JEFE_OPERACIONES', 'COORDINADOR_OPERACIONES'].includes(currentUser.role);
    return false;
  };

  // Calculate live badge counts
  const activeCampaignsCount = scopedCampaigns.filter(c => c.status === 'EN_PROCESO' || c.status === 'PUBLICADO').length;
  const myCampaignsCount = myAssignedCampaigns.length;
  const scopedCandidatesCount = scopedCandidates.length;
  
  const totalCohortsCount = cohorts.length;
  const myCohortsCount = cohorts.filter(co => {
    if (currentUser.role === 'FORMADOR') return co.trainerId === currentUser.id;
    if (currentUser.role === 'COORDINADOR_FORMACION') return co.coordinatorId === currentUser.id;
    return true;
  }).length;
  const pendingAssignmentCount = cohorts.filter(c => c.status === 'PENDIENTE_ASIGNACION').length;
  const inTrainingCount = candidates.filter(c => c.currentStage === 'CAPACITACION' || c.training?.status === 'EN_CAPACITACION').length;
  const inOjtCount = candidates.filter(c => c.currentStage === 'OJT' || c.training?.status === 'EN_OJT' || c.ojt?.status === 'EN_PISO').length;
  const readyForHiringCount = candidates.filter(c => c.currentStage === 'APTO_ALTA' || c.training?.finalResult === 'APTO_ALTA' || c.ojt?.status === 'APTO_ALTA').length;

  type NavigationItem = { id: ActiveNavModule; label: string; icon: LucideIcon; badge: React.ReactNode; badgeColor?: string };
  const navSections: { group: string; modKey: AppModuleName; sectionKey?: 'OPERACIONES'; items: NavigationItem[] }[] = [];

  // 1. MÓDULO SELECCIÓN
  if (hasModule('SELECCION')) {
    const selectionItems: NavigationItem[] = [
      {
        id: 'SELECCION_DASHBOARD',
        label: 'Panel de Selección',
        icon: BarChart3,
        badge: null
      }
    ];

    if (currentUser.role === 'ADMIN' || currentUser.role === 'JEFE_SELECCION' || currentUser.role === 'ANALISTA_SELECCION') {
      selectionItems.push({ id: 'SELECCION_RQ', label: 'Alertas de RQ', icon: Briefcase, badge: null });
      selectionItems.push({
        id: 'CONVOCATORIAS',
        label: 'Convocatorias',
        icon: Building2,
        badge: activeCampaignsCount > 0 ? activeCampaignsCount : null,
        badgeColor: 'bg-sky-100 text-sky-800'
      });
    }

    selectionItems.push({
      id: 'MIS_CONVOCATORIAS',
      label: currentUser.role === 'ADMIN' || currentUser.role === 'JEFE_SELECCION' ? 'Pipeline & Kanban' : 'Mis Convocatorias',
      icon: Layers,
      badge: myCampaignsCount > 0 ? myCampaignsCount : null,
      badgeColor: 'bg-purple-100 text-purple-800'
    });

    selectionItems.push({
      id: 'CANDIDATOS',
      label: 'Candidatos',
      icon: Users,
      badge: scopedCandidatesCount > 0 ? scopedCandidatesCount : null,
      badgeColor: 'bg-slate-700 text-slate-200'
    });

    navSections.push({
      group: '1. SELECCIÓN & RECLUTAMIENTO',
      modKey: 'SELECCION',
      items: selectionItems
    });
    if (['ADMIN', 'JEFE_SELECCION', 'ANALISTA_SELECCION', 'RECLUTADOR'].includes(currentUser.role)) selectionItems.push({ id: 'SELECCION_PROPUESTAS', label: 'Propuesta Laboral', icon: Briefcase, badge: null });
    if (['ADMIN', 'RECLUTADOR', 'ANALISTA_SELECCION'].includes(currentUser.role)) selectionItems.push({ id: 'SELECCION_CAPTACION', label: 'Captación', icon: UserPlus, badge: null });
  }

  // 2. MÓDULO FORMACIÓN & OJT
  if (currentUser.role === 'ADMIN' || (hasModule('OPERACIONES') && ['JEFE_OPERACIONES','COORDINADOR_OPERACIONES'].includes(currentUser.role))) {
    navSections.push({ group: 'OPERACIONES', modKey: 'OPERACIONES', sectionKey: 'OPERACIONES', items: [{ id: 'OPERACIONES_ADMIN', label: 'Requerimientos y enlaces', icon: Briefcase, badge: null }] });
  }

  if (hasModule('FORMACION')) {
    const formacionItems: NavigationItem[] = [
      {id:'FORMACION_ENCUESTAS',label:'Encuestas de capacitación',icon:ClipboardList,badge:null},
      {
        id: 'FORMACION_DASHBOARD',
        label: 'Panel de Formación',
        icon: BarChart3,
        badge: null
      }
    ];

    if (['ADMIN', 'JEFE_FORMACION', 'COORDINADOR_FORMACION'].includes(currentUser.role)) {
      formacionItems.push({
        id: 'FORMACION_CAPACITACIONES',
        label: 'Capacitaciones',
        icon: GraduationCap,
        badge: pendingAssignmentCount > 0 ? `${pendingAssignmentCount} por asignar` : (totalCohortsCount > 0 ? totalCohortsCount : null),
        badgeColor: pendingAssignmentCount > 0 ? 'bg-amber-500 text-white font-semibold' : 'bg-indigo-100 text-indigo-700'
      });
    }

    if (['ADMIN', 'COORDINADOR_FORMACION', 'FORMADOR'].includes(currentUser.role)) {
      formacionItems.push({
        id: 'FORMACION_MIS_CAPACITACIONES',
        label: currentUser.role === 'FORMADOR' ? 'Mis Capacitaciones' : (currentUser.role === 'COORDINADOR_FORMACION' ? 'Grupos Asignados' : 'Capacitaciones asignadas'),
        icon: Layers,
        badge: myCohortsCount > 0 ? myCohortsCount : null,
        badgeColor: 'bg-purple-100 text-purple-800'
      });
    }

    formacionItems.push({
      id: 'FORMACION_PARTICIPANTES',
      label: 'Participantes',
      icon: Users,
      badge: inTrainingCount + inOjtCount > 0 ? inTrainingCount + inOjtCount : null,
      badgeColor: 'bg-slate-700 text-slate-200'
    });

    formacionItems.push({
      id: 'FORMACION_OJT',
      label: 'OJT (En Piso)',
      icon: Headphones,
      badge: inOjtCount > 0 ? inOjtCount : null,
      badgeColor: 'bg-emerald-100 text-emerald-800 font-semibold'
    });

    navSections.push({
      group: '2. FORMACIÓN & OJT',
      modKey: 'FORMACION',
      items: formacionItems
    });
  }

  // 3. MÓDULO GESTIÓN DE TALENTO
  if (hasModule('TALENTO')) {
    navSections.push({
      group: '3. GESTIÓN DE TALENTO',
      modKey: 'TALENTO',
      items: [
        {
          id: 'TALENTO_CONTRATACIONES',
          label: 'Contrataciones & Altas',
          icon: Briefcase,
          badge: readyForHiringCount > 0 ? `${readyForHiringCount} aptos` : null,
          badgeColor: 'bg-emerald-500 text-white animate-pulse'
        }
      ]
    });
  }

  // 4. MÓDULO ANALÍTICA
  if (hasModule('ANALITICA')) {
    navSections.push({
      group: '4. ANALÍTICA GLOBAL',
      modKey: 'ANALITICA',
      items: [
        {
          id: 'ANALITICA',
          label: 'Reportería & SLAs',
          icon: PieChart,
          badge: null
        }
      ]
    });
  }

  // 5. MÓDULO ADMINISTRACIÓN
  if (hasModule('ADMINISTRACION') || currentUser.role === 'ADMIN') {
    navSections.push({
      group: '5. ADMINISTRACIÓN',
      modKey: 'ADMINISTRACION',
      items: [
        {
          id: 'ADMIN_USUARIOS',
          label: 'Usuarios & Permisos (RBAC)',
          icon: ShieldCheck,
          badge: `${availableUsers.length}`,
          badgeColor: 'bg-purple-600 text-white'
        },
        {
          id: 'CONFIGURACION',
          label: 'Configuración de Sistema',
          icon: Settings,
          badge: null
        }
      ]
    });
  }

  const activeSectionKey = navSections.find(section =>
    section.items.some(item => item.id === activeModule)
  )?.sectionKey || navSections.find(section => section.items.some(item => item.id === activeModule))?.modKey;

  React.useEffect(() => {
    if (activeSectionKey) setExpandedModule(activeSectionKey);
  }, [activeSectionKey]);

  const moduleIcons: Record<AppModuleName, LucideIcon> = {
    SELECCION: Users,
    FORMACION: GraduationCap,
    TALENTO: Briefcase,
    ANALITICA: PieChart,
    ADMINISTRACION: Settings,
    OPERACIONES: Briefcase,
  };

  return (
    <aside id="talent-navigation" className={`talent-sidebar ${navigationOpen ? 'is-open' : ''} bg-gradient-to-b from-[#0C1E35] via-[#123F63] to-[#0B3654] text-white flex flex-col h-screen border-r border-[#154E7D] shrink-0 select-none shadow-[5px_0_22px_rgba(12,30,53,0.12)]`}>
      {/* Brand Identity */}
      <div className="talent-sidebar-brand px-4 flex items-center justify-center border-b border-white/10 overflow-hidden">
        <img src="/talent-on-sidebar-logo.png" alt="Talent-On" className="h-auto w-28 max-h-16 object-contain mix-blend-screen" />
      </div>

      {/* Navigation Links */}
      <div className="talent-sidebar-scrollbar flex-1 overflow-y-auto py-3 px-2.5 space-y-3">
        {navSections.length === 0 ? (
          <div className="p-4 text-center text-xs text-white/70 bg-white/5 border border-white/10 rounded-xl">
            No tienes módulos asignados. Contacta al Administrador.
          </div>
        ) : (
          navSections.map((section) => {
            const key = section.sectionKey || section.modKey;
            const MainIcon = section.sectionKey === 'OPERACIONES' ? Briefcase : moduleIcons[section.modKey];
            const isExpanded = expandedModule === key;
            const isSectionActive = activeSectionKey === key;
            return (
            <div key={key} className="space-y-1">
              <button
                type="button"
                onClick={() => setExpandedModule(isExpanded ? null : key)}
                aria-expanded={isExpanded}
                className={`group flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-xs font-semibold transition-colors ${
                  isSectionActive
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/90 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isSectionActive ? 'bg-white/15' : 'bg-white/10 group-hover:bg-white/15'}`}>
                    <MainIcon className="h-[18px] w-[18px] text-white" />
                  </span>
                  <span className="truncate">{section.group.replace(/^\d+\.\s*/, '')}</span>
                </span>
                <ChevronRight className={`h-4 w-4 shrink-0 text-white transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
              </button>

              {isExpanded && <div className="space-y-0.5 pt-1 pl-2">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveModule(item.id); onCloseNavigation?.(); }}
                      className={`min-h-10 w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 group cursor-pointer ${
                        isActive
                          ? 'bg-white text-[#143A56] font-semibold shadow-sm'
                          : 'text-white/90 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-sky-100' : 'bg-white/10 group-hover:bg-white/15'}`}>
                          <Icon className={`h-[18px] w-[18px] transition-colors ${isActive ? 'text-[#143A56]' : 'text-white'}`} />
                        </span>
                        <span>{item.label}</span>
                      </div>

                      {item.badge !== null && (
                        <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-sky-100 text-[#143A56]' : 'bg-sky-600 text-white'}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>}
            </div>
          )})
        )}
      </div>

      {/* Session footer */}
      <div className="p-3 border-t border-white/10 bg-[#0B3654]/70 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-bold uppercase tracking-wider text-white/60 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-300" />
            Sesión
          </span>
          <div className="flex items-center gap-1">
            <button onClick={logout} title="Cerrar sesión" className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-2 text-2xs text-white/65">
          <IdentityAvatar
            src={currentUser.avatarUrl}
            name={currentUser.name}
            className="w-9 h-9 rounded-full ring-2 ring-white/70 shrink-0 shadow-sm text-2xs"
            fallbackClassName="bg-white/15 text-white"
          />
          <div className="min-w-0 flex-1">
            <div className="text-white font-bold leading-tight truncate">{currentUser.nickname || currentUser.name}</div>
            <div className="text-white/60 text-[10px] truncate">{currentUser.tagline || currentUser.email}</div>
          </div>
          {currentUser.role === 'ADMIN' && (
            <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white text-[9px] font-extrabold uppercase shrink-0">
              Admin
            </span>
          )}
        </div>
      </div>
    </aside>
  );
};
