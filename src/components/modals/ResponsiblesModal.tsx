import React, { useState, useEffect } from 'react';
import { 
  X, 
  Users, 
  Target, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Percent
} from 'lucide-react';
import { useTalent } from '../../context/TalentContext';
import { CampaignCall, ConvocatoriaResponsible, UserProfile } from '../../types';

interface ResponsiblesModalProps {
  isOpen: boolean;
  onClose: () => void;
  convocatoria: CampaignCall | null;
}

export const ResponsiblesModal: React.FC<ResponsiblesModalProps> = ({
  isOpen,
  onClose,
  convocatoria
}) => {
  const { 
    updateConvocatoriaResponsibles, 
    availableUsers, 
    currentUser 
  } = useTalent();

  const [responsibles, setResponsibles] = useState<ConvocatoriaResponsible[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isDirectStaffResp, setIsDirectStaffResp] = useState(false);
  const [allowOverTarget, setAllowOverTarget] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (convocatoria) {
      setResponsibles(convocatoria.responsibles || []);
      setAllowOverTarget(convocatoria.allowOverTargetQuota || false);
      setErrorMessage('');
    }
  }, [convocatoria, isOpen]);

  if (!isOpen || !convocatoria) return null;

  const totalRQ = convocatoria.vacancies;
  const totalAssignedMetas = responsibles.reduce((acc, r) => acc + (Number(r.target) || 0), 0);
  const isOverAssigned = totalAssignedMetas > totalRQ;
  const canAuthorizeOverassignment = currentUser.role === 'JEFE_SELECCION';

  const handleAddResponsible = () => {
    setErrorMessage('');
    if (!selectedUserId) return;
    const user = availableUsers.find(u => u.id === selectedUserId);
    if (!user) return;

    if (responsibles.some(r => r.userId === user.id)) {
      setErrorMessage('Este usuario ya se encuentra asignado a la convocatoria.');
      return;
    }

    const remainingToAssign = Math.max(0, totalRQ - totalAssignedMetas);
    const initialTarget = remainingToAssign > 0 ? remainingToAssign : 1;

    const newResp: ConvocatoriaResponsible = {
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      target: initialTarget,
      hiredCount: 0,
      isDirectResponsible: isDirectStaffResp || user.role === 'ANALISTA_SELECCION'
    };

    setResponsibles(prev => [...prev, newResp]);
    setSelectedUserId('');
    setIsDirectStaffResp(false);
  };

  const handleUpdateTarget = (userId: string, newTarget: number) => {
    setErrorMessage('');
    setResponsibles(prev => prev.map(r => {
      if (r.userId === userId) {
        return { ...r, target: Math.max(0, newTarget) };
      }
      return r;
    }));
  };

  const handleRemoveResponsible = (userId: string) => {
    setErrorMessage('');
    setResponsibles(prev => prev.filter(r => r.userId !== userId));
  };

  const handleDistributeEqually = () => {
    if (responsibles.length === 0) return;
    const baseShare = Math.floor(totalRQ / responsibles.length);
    let remainder = totalRQ % responsibles.length;

    setResponsibles(prev => prev.map((r, idx) => {
      const share = baseShare + (idx < remainder ? 1 : 0);
      return { ...r, target: share };
    }));
    setErrorMessage('');
  };

  const handleSave = async () => {
    if (isOverAssigned && !allowOverTarget) {
      setErrorMessage(`La suma de metas (${totalAssignedMetas}) supera el requerimiento (${totalRQ}). Requiere autorización de sobreasignación por el Jefe de Selección.`);
      return;
    }

    await updateConvocatoriaResponsibles(convocatoria.id, responsibles, allowOverTarget);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Responsables & Metas de Selección
              </h3>
              <p className="text-xs text-slate-400">
                {convocatoria.title} ({convocatoria.company}) • RQ: <span className="font-bold text-white">{totalRQ} vacantes</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
          
          {/* Summary Quota Bar */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-700">Distribución del Requerimiento (RQ):</span>
              <span className={`font-bold ${isOverAssigned ? (allowOverTarget ? 'text-amber-700 font-extrabold' : 'text-rose-700') : 'text-slate-900'}`}>
                {totalAssignedMetas} de {totalRQ} asignadas ({Math.round((totalAssignedMetas / (totalRQ || 1)) * 100)}%)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
              <div 
                className={`h-full transition-all duration-300 ${
                  isOverAssigned 
                    ? (allowOverTarget ? 'bg-amber-500' : 'bg-rose-500') 
                    : totalAssignedMetas === totalRQ ? 'bg-emerald-500' : 'bg-sky-500'
                }`}
                style={{ width: `${Math.min(100, (totalAssignedMetas / (totalRQ || 1)) * 100)}%` }}
              />
            </div>

            {isOverAssigned && (
              <div className="mt-2.5 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>La suma de metas ({totalAssignedMetas}) supera el RQ ({totalRQ}).</span>
                  {canAuthorizeOverassignment ? (
                    <div className="mt-1 flex items-center gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-900">
                        <input
                          type="checkbox"
                          checked={allowOverTarget}
                          onChange={e => setAllowOverTarget(e.target.checked)}
                          className="w-3.5 h-3.5 text-sky-600 rounded border-slate-300"
                        />
                        Autorizar sobreasignación como Jefe de Selección
                      </label>
                    </div>
                  ) : (
                    <p className="text-2xs text-amber-700 mt-0.5">
                      Solo un Jefe de Selección puede autorizar sobreasignación de cuotas.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Add Responsible Form */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Asignar Reclutador o Analista
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-sky-500"
              >
                <option value="">-- Seleccionar usuario --</option>
                {availableUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === 'JEFE_SELECCION' ? 'Jefe' : u.role === 'ANALISTA_SELECCION' ? 'Analista' : 'Reclutador'})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddResponsible}
                disabled={!selectedUserId}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                Asignar
              </button>

              <button
                type="button"
                onClick={handleDistributeEqually}
                disabled={responsibles.length === 0}
                className="px-3 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                title="Distribuir posiciones equitativamente entre los responsables actuales"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                Distribuir Equitativamente
              </button>
            </div>

            {selectedUserId && availableUsers.find(u => u.id === selectedUserId)?.role === 'ANALISTA_SELECCION' && (
              <label className="flex items-center gap-2 text-xs text-slate-700 mt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDirectStaffResp}
                  onChange={e => setIsDirectStaffResp(e.target.checked)}
                  className="rounded text-purple-600 border-slate-300"
                />
                <span>Asignar como Responsable Directo de Proceso Staff (aparecerá en sus Mis Convocatorias)</span>
              </label>
            )}
          </div>

          {/* Table of Responsibles & Targets */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 mb-2">
              Equipo Asignado & Desempeño
            </h4>
            
            {responsibles.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                No hay selectores asignados actualmente a esta convocatoria.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Selector / Responsable</th>
                      <th className="py-2.5 px-3 text-center">Meta Asignada</th>
                      <th className="py-2.5 px-3 text-center">Ingresos</th>
                      <th className="py-2.5 px-3 text-center">Pendientes</th>
                      <th className="py-2.5 px-3 text-center">% Cumplimiento</th>
                      <th className="py-2.5 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {responsibles.map(resp => {
                      const meta = Number(resp.target) || 0;
                      const ingresos = Number(resp.hiredCount) || 0;
                      const pendientes = Math.max(0, meta - ingresos);
                      const cumplimiento = meta > 0 ? Math.round((ingresos / meta) * 100) : 0;
                      const isCompleted = ingresos >= meta && meta > 0;

                      return (
                        <tr key={resp.userId} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              {resp.userName}
                              {resp.isDirectResponsible && (
                                <span className="text-2xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold">
                                  Staff Directo
                                </span>
                              )}
                            </div>
                            <span className="text-2xs text-slate-500">
                              {resp.userRole === 'ANALISTA_SELECCION' ? 'Analista' : 'Reclutador'}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={resp.target}
                              onChange={e => handleUpdateTarget(resp.userId, Number(e.target.value))}
                              className="w-16 text-center font-bold bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-900 focus:ring-2 focus:ring-sky-500"
                            />
                          </td>

                          <td className="py-2.5 px-3 text-center font-semibold text-emerald-700">
                            {ingresos}
                          </td>

                          <td className="py-2.5 px-3 text-center font-semibold text-amber-700">
                            {pendientes}
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className={`font-bold ${isCompleted ? 'text-emerald-600' : 'text-slate-700'}`}>
                                {cumplimiento}%
                              </span>
                              {isCompleted && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" aria-label="Meta cumplida" />
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveResponsible(resp.userId)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                              title="Remover selector"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-2xs text-slate-500">
            Valores actualizados en tiempo real para el cálculo de indicadores.
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs cursor-pointer"
            >
              Guardar Asignación
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
