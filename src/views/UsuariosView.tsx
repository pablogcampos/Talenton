import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Layers, 
  Search, 
  Filter, 
  Check, 
  X, 
  Edit3, 
  Trash2, 
  Eye, 
  Sparkles, 
  Building2, 
  Briefcase, 
  GraduationCap, 
  Phone, 
  Mail, 
  Lock, 
  Unlock,
  AlertCircle,
  HelpCircle,
  RotateCcw
} from 'lucide-react';
import { useTalent } from '../context/TalentContext';
import { UserProfile, UserRole, AppModuleName } from '../types';
import { UserModal } from '../components/modals/UserModal';
import { IdentityAvatar } from '../components/common/IdentityAvatar';

export const UsuariosView: React.FC = () => {
  const { 
    availableUsers, 
    currentUser, 
    deleteUser, 
    toggleUserStatus,
    resetUserPassword
  } = useTalent();

  const [search, setSearch] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserProfile | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  const showNotification = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleOpenCreateModal = () => {
    setUserToEdit(null);
    setIsUserModalOpen(true);
  };

  const handleOpenEditModal = (user: UserProfile) => {
    setUserToEdit(user);
    setIsUserModalOpen(true);
  };

  const handleDelete = async (user: UserProfile) => {
    if (user.id === currentUser.id) {
      showNotification('No puedes eliminar el usuario activo con el que estás interactuando.', 'error');
      return;
    }
    if (confirm(`¿Estás seguro de eliminar al usuario "${user.name}"? Esta acción se puede revertir restableciendo los datos.`)) {
      try {
        await deleteUser(user.id);
        showNotification(`Usuario "${user.name}" deshabilitado correctamente.`, 'success');
      } catch {
        showNotification('No fue posible deshabilitar el usuario.', 'error');
      }
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    try {
      await toggleUserStatus(user.id);
      const newStatus = user.status === 'INACTIVO' ? 'Activado' : 'Desactivado';
      showNotification(`Usuario "${user.name}" ${newStatus}.`, 'success');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'No fue posible actualizar el estado.', 'error');
    }
  };

  const handlePasswordReset = async (user: UserProfile) => {
    const newPassword = window.prompt(`Nueva contraseña temporal para ${user.name} (mínimo 8 caracteres):`);
    if (!newPassword) return;
    if (newPassword.length < 8) return showNotification('La contraseña debe tener al menos 8 caracteres.', 'error');
    try {
      await resetUserPassword(user.id, newPassword);
      showNotification(`Contraseña de "${user.name}" restablecida.`, 'success');
    } catch {
      showNotification('No fue posible restablecer la contraseña.', 'error');
    }
  };

  // Filtered users list
  const filteredUsers = availableUsers.filter(u => {
    const matchesSearch = 
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.jobTitle && u.jobTitle.toLowerCase().includes(search.toLowerCase())) ||
      u.role.toLowerCase().includes(search.toLowerCase());

    const matchesRole = selectedRoleFilter === 'ALL' || u.role === selectedRoleFilter;
    const matchesStatus = selectedStatusFilter === 'ALL' || (u.status || 'ACTIVO') === selectedStatusFilter;
    const matchesModule = selectedModuleFilter === 'ALL' || (u.allowedModules && u.allowedModules.includes(selectedModuleFilter as AppModuleName));

    return matchesSearch && matchesRole && matchesStatus && matchesModule;
  });

  // Calculate statistics
  const totalUsers = availableUsers.length;
  const adminUsers = availableUsers.filter(u => u.role === 'ADMIN').length;
  const selectionUsers = availableUsers.filter(u => u.role === 'JEFE_SELECCION' || u.role === 'ANALISTA_SELECCION' || u.role === 'RECLUTADOR').length;
  const trainingUsers = availableUsers.filter(u => u.role === 'JEFE_FORMACION' || u.role === 'COORDINADOR_FORMACION' || u.role === 'FORMADOR').length;
  const activeUsersCount = availableUsers.filter(u => (u.status || 'ACTIVO') === 'ACTIVO').length;

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return { label: 'Super Admin', bg: 'bg-purple-100 text-purple-900 border-purple-200' };
      case 'JEFE_SELECCION':
        return { label: 'Jefe Selección', bg: 'bg-sky-100 text-sky-900 border-sky-200' };
      case 'ANALISTA_SELECCION':
        return { label: 'Analista Selección', bg: 'bg-sky-50 text-sky-800 border-sky-200' };
      case 'RECLUTADOR':
        return { label: 'Reclutador', bg: 'bg-slate-100 text-slate-800 border-slate-200' };
      case 'JEFE_FORMACION':
        return { label: 'Jefe Formación', bg: 'bg-indigo-100 text-indigo-900 border-indigo-200' };
      case 'COORDINADOR_FORMACION':
        return { label: 'Coordinador Formación', bg: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
      case 'FORMADOR':
        return { label: 'Formador / Trainer', bg: 'bg-purple-50 text-purple-800 border-purple-200' };
      case 'JEFE_OPERACIONES':
        return { label: 'Jefe Operaciones', bg: 'bg-cyan-100 text-cyan-900 border-cyan-200' };
      case 'COORDINADOR_OPERACIONES':
        return { label: 'Coordinador Operaciones', bg: 'bg-cyan-50 text-cyan-800 border-cyan-200' };
      case 'JEFE_TALENTO':
      case 'ANALISTA_TALENTO':
        return { label: 'Gestión Talento', bg: 'bg-emerald-100 text-emerald-900 border-emerald-200' };
      default:
        return { label: role, bg: 'bg-slate-100 text-slate-800 border-slate-200' };
    }
  };

  const getModuleBadge = (mod: AppModuleName) => {
    switch (mod) {
      case 'SELECCION':
        return { label: 'Selección', bg: 'bg-sky-50 text-sky-700 border-sky-200' };
      case 'FORMACION':
        return { label: 'Formación & OJT', bg: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'TALENTO':
        return { label: 'Talento & Altas', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'ANALITICA':
        return { label: 'Analítica', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'ADMINISTRACION':
        return { label: 'Admin', bg: 'bg-slate-800 text-white border-slate-700' };
      case 'OPERACIONES':
        return { label: 'Operaciones', bg: 'bg-cyan-50 text-cyan-800 border-cyan-200' };
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {feedbackMsg && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-lg animate-in slide-in-from-top-4 duration-200 ${
          feedbackMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
          feedbackMsg.type === 'info' ? 'bg-sky-50 border-sky-200 text-sky-900' :
          'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="p-1 hover:opacity-70 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sky-600" />
            Gestión de Usuarios, Roles & Control de Acceso (RBAC)
          </h2>
          <p className="text-xs text-slate-500">
            Crea usuarios, asigna roles de Contact Center y habilita vistas personalizadas por módulo.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
          >
            <UserPlus className="w-4 h-4 text-sky-400" />
            <span>Crear Nuevo Usuario</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-2xs font-bold uppercase text-slate-400 tracking-wider">Total Usuarios</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalUsers}</div>
          <div className="text-2xs text-emerald-600 font-semibold mt-0.5">{activeUsersCount} activos</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-2xs font-bold uppercase text-purple-600 tracking-wider">Administradores</div>
          <div className="text-2xl font-black text-purple-900 mt-1">{adminUsers}</div>
          <div className="text-2xs text-slate-500 mt-0.5">Acceso total</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-2xs font-bold uppercase text-sky-600 tracking-wider">Equipo Selección</div>
          <div className="text-2xl font-black text-sky-900 mt-1">{selectionUsers}</div>
          <div className="text-2xs text-slate-500 mt-0.5">Jefes, Analistas y Reclutadores</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-2xs font-bold uppercase text-indigo-600 tracking-wider">Equipo Formación</div>
          <div className="text-2xl font-black text-indigo-900 mt-1">{trainingUsers}</div>
          <div className="text-2xs text-slate-500 mt-0.5">Jefes, Coordinadores y Trainers</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-2xs font-bold uppercase text-slate-400 tracking-wider">Usuario en Sesión</div>
          <div className="text-xs font-bold text-slate-900 truncate mt-1">{currentUser.name}</div>
          <div className="text-2xs font-mono text-sky-600 truncate">{currentUser.role}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Search input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre, correo, cargo o rol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
          />
        </div>

        {/* Filter by Role */}
        <div className="flex items-center gap-2">
          <span className="text-2xs font-bold text-slate-500 uppercase">Rol:</span>
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-slate-700 focus:bg-white focus:ring-2 focus:ring-sky-500 cursor-pointer"
          >
            <option value="ALL">Todos los roles ({totalUsers})</option>
            <option value="ADMIN">Administrador</option>
            <option value="JEFE_SELECCION">Jefe de Selección</option>
            <option value="ANALISTA_SELECCION">Analista de Selección</option>
            <option value="RECLUTADOR">Reclutador</option>
            <option value="JEFE_FORMACION">Jefe de Formación</option>
            <option value="COORDINADOR_FORMACION">Coordinador Formación</option>
            <option value="FORMADOR">Formador / Trainer</option>
            <option value="JEFE_TALENTO">Gestión de Talento</option>
          </select>
        </div>

        {/* Filter by Module */}
        <div className="flex items-center gap-2">
          <span className="text-2xs font-bold text-slate-500 uppercase">Módulo:</span>
          <select
            value={selectedModuleFilter}
            onChange={(e) => setSelectedModuleFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-slate-700 focus:bg-white focus:ring-2 focus:ring-sky-500 cursor-pointer"
          >
            <option value="ALL">Todos los módulos</option>
            <option value="SELECCION">1. Selección</option>
            <option value="FORMACION">2. Formación & OJT</option>
            <option value="TALENTO">3. Gestión de Talento</option>
            <option value="ANALITICA">4. Analítica</option>
            <option value="ADMINISTRACION">5. Administración</option>
          </select>
        </div>

        {/* Filter by Status */}
        <div className="flex items-center gap-2">
          <span className="text-2xs font-bold text-slate-500 uppercase">Estado:</span>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold text-slate-700 focus:bg-white focus:ring-2 focus:ring-sky-500 cursor-pointer"
          >
            <option value="ALL">Todos</option>
            <option value="ACTIVO">Activos</option>
            <option value="INACTIVO">Inactivos</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Usuario / Colaborador</th>
                <th className="px-4 py-3">Rol del Sistema</th>
                <th className="px-4 py-3">Módulos Habilitados en Menú</th>
                <th className="px-4 py-3">Alcance / Campañas</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-sm text-slate-700">No se encontraron usuarios</p>
                    <p className="text-xs text-slate-400">Prueba ajustando los filtros de búsqueda o crea uno nuevo.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const roleBadge = getRoleBadge(user.role);
                  const isActive = (user.status || 'ACTIVO') === 'ACTIVO';
                  const isCurrent = currentUser.id === user.id;
                  const modules = user.allowedModules || (user.role === 'ADMIN' ? ['SELECCION', 'FORMACION', 'TALENTO', 'ANALITICA', 'ADMINISTRACION'] : ['SELECCION']);

                  return (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCurrent ? 'bg-sky-50/40 font-medium' : ''
                      }`}
                    >
                      {/* User Profile */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <IdentityAvatar
                            src={user.avatarUrl}
                            name={user.name}
                            className="w-10 h-10 rounded-full ring-2 ring-slate-100 shrink-0 text-2xs"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                              <span>{user.name}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 bg-sky-600 text-white rounded-full text-[9px] font-extrabold uppercase">
                                  Tú / Activo
                                </span>
                              )}
                            </div>
                            <div className="text-2xs text-slate-500 font-mono truncate">{user.nickname ? `${user.nickname} · ${user.email}` : user.email}</div>
                            <div className="text-2xs text-slate-400 truncate">
                              {user.jobTitle || 'Sin cargo definido'} {user.phone ? `• ${user.phone}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-1 rounded-lg border text-2xs font-extrabold uppercase tracking-wider inline-flex items-center gap-1 ${roleBadge.bg}`}>
                          <ShieldCheck className="w-3 h-3" />
                          <span>{roleBadge.label}</span>
                        </span>
                      </td>

                      {/* Allowed Modules */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {modules.map(mod => {
                            const badge = getModuleBadge(mod);
                            return (
                              <span
                                key={mod}
                                className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${badge.bg}`}
                              >
                                {badge.label}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Scope Campaigns */}
                      <td className="px-4 py-3.5">
                        {user.scopeCampaignIds && user.scopeCampaignIds.length > 0 ? (
                          <div className="text-2xs font-medium text-slate-700">
                            <span className="font-bold text-slate-900">{user.scopeCampaignIds.length}</span> convocatorias
                            <div className="text-[10px] text-slate-400 font-mono">
                              {user.scopeCampaignIds.slice(0, 2).join(', ')}
                              {user.scopeCampaignIds.length > 2 && ` +${user.scopeCampaignIds.length - 2}`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-2xs text-slate-400 italic">
                            {user.role === 'ADMIN' ? 'Alcance Total' : 'Según Rol'}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user)}
                          className={`px-2.5 py-1 rounded-full text-2xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                            isActive 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' 
                              : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                          }`}
                          title="Click para cambiar estado"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                          <span>{isActive ? 'Activo' : 'Inactivo'}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {isCurrent && <span className="px-2.5 py-1.5 rounded-xl text-2xs font-bold bg-sky-600 text-white">Sesión actual</span>}

                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(user)}
                            className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                            title="Editar usuario y permisos"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button type="button" onClick={() => handlePasswordReset(user)} className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer" title="Restablecer contraseña">
                            <Lock className="w-4 h-4" />
                          </button>

                          {/* Delete button (cannot delete current active user) */}
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => handleDelete(user)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RBAC Reference Architecture Card */}
      <div className="bg-slate-900 text-slate-200 p-6 rounded-2xl border border-slate-800 shadow-md space-y-4">
        <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase tracking-wider">
          <HelpCircle className="w-4 h-4" />
          <span>Matriz de Roles y Visualizaciones en TalentCC</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 bg-slate-800/70 rounded-xl border border-slate-700 space-y-1.5">
            <div className="font-bold text-sky-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>1. Administrador (Super Admin)</span>
            </div>
            <p className="text-2xs text-slate-400 leading-relaxed">
              Acceso total sin restricciones a Selección, Formación, OJT, Contrataciones, Analítica y Panel de Usuarios. Puede crear o editar cualquier usuario y simular sus vistas.
            </p>
          </div>

          <div className="p-3.5 bg-slate-800/70 rounded-xl border border-slate-700 space-y-1.5">
            <div className="font-bold text-indigo-300 flex items-center gap-1.5">
              <Building2 className="w-4 h-4" />
              <span>2. Selección & Reclutamiento</span>
            </div>
            <p className="text-2xs text-slate-400 leading-relaxed">
              <strong>Jefe / Analista</strong>: Gestionan convocatorias, cuotas, analítica y botón de traspaso "Crear Capacitación".<br />
              <strong>Reclutador</strong>: Visualiza únicamente sus convocatorias asignadas y gestiona postulantes en pipeline.
            </p>
          </div>

          <div className="p-3.5 bg-slate-800/70 rounded-xl border border-slate-700 space-y-1.5">
            <div className="font-bold text-purple-300 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4" />
              <span>3. Formación & OJT (Capacitaciones)</span>
            </div>
            <p className="text-2xs text-slate-400 leading-relaxed">
              <strong>Jefe / Coordinador</strong>: Asignan formadores y supervisan cohortes globales.<br />
              <strong>Formador (Trainer)</strong>: Ingresa a "Mis Capacitaciones", toma asistencia diaria, califica módulos y opera el piso OJT.
            </p>
          </div>
        </div>
      </div>

      {/* User Creation / Edit Modal */}
      <UserModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        userToEdit={userToEdit}
      />

    </div>
  );
};
