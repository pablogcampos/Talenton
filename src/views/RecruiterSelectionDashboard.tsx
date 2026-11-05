import { RecruiterCaptureResponses } from '../components/capture/RecruiterCaptureResponses';
import React, { useMemo, useState } from 'react';
import { Activity, Award, CalendarDays, CheckCircle2, Clock3, Filter, PhoneCall, Star, Target, TrendingUp, Users } from 'lucide-react';
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTalent } from '../context/TalentContext';
import { CandidateRecord } from '../types';
import { createDemoSelectionData, DEMO_SELECTION_ENABLED } from '../data/demoSelectionData';

const COLORS = ['#143A56', '#154E7D', '#4CA899', '#87C6A2', '#F68565', '#E9AA34'];
const percent = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) : 0;
const parseDate = (value?: string) => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; };
const daysBetween = (from?: string, to?: string) => { const start = parseDate(from); const end = parseDate(to); return start && end ? Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000)) : 0; };
const isApto = (candidate: CandidateRecord) => candidate.selection?.stage === 'APTO_CAPACITACION' || ['CAPACITACION', 'OJT', 'APTO_ALTA', 'GESTION_TALENTO', 'CONTRATADO'].includes(candidate.currentStage);
const isContacted = (candidate: CandidateRecord) => candidate.selection?.stage !== 'NUEVO' || (candidate.selection?.contactHistory?.length || 0) > 0;
const isEvaluated = (candidate: CandidateRecord) => ['EVALUACIONES', 'APTO_CAPACITACION'].includes(candidate.selection?.stage) || (candidate.selection?.evaluationsList?.length || 0) > 0;

type IconType = React.ComponentType<{ className?: string }>;
const Kpi: React.FC<{ label: string; value: string; detail: string; icon: IconType; tone: string }> = ({ label, value, detail, icon: Icon, tone }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span><span className="text-xs font-semibold text-slate-600">{label}</span></div><div className="mt-3 text-3xl font-bold text-slate-900">{value}</div><div className="mt-2 text-[11px] text-slate-500">{detail}</div></article>;
const Empty: React.FC<{ text: string }> = ({ text }) => <div className="flex h-44 items-center justify-center text-sm text-slate-400">{text}</div>;

export const RecruiterSelectionDashboard: React.FC = () => {
  const { currentUser, myAssignedCampaigns: liveAssignedCampaigns, scopedCandidates: liveCandidates } = useTalent();
  const demoData = useMemo(() => createDemoSelectionData(currentUser), [currentUser]);
  const myAssignedCampaigns = DEMO_SELECTION_ENABLED ? demoData.campaigns : liveAssignedCampaigns;
  const scopedCandidates = DEMO_SELECTION_ENABLED ? demoData.candidates : liveCandidates;
  const [period, setPeriod] = useState('ALL');
  const [campaignId, setCampaignId] = useState('ALL');

  const ownCandidates = useMemo(() => scopedCandidates.filter(candidate => candidate.recruiterId === currentUser.id), [currentUser.id, scopedCandidates]);
  const filteredCampaigns = useMemo(() => myAssignedCampaigns.filter(campaign => campaignId === 'ALL' || campaign.id === campaignId), [campaignId, myAssignedCampaigns]);
  const campaignIds = useMemo(() => new Set(filteredCampaigns.map(campaign => campaign.id)), [filteredCampaigns]);
  const filteredCandidates = useMemo(() => {
    const limit = period === 'WEEK' ? 7 : period === 'MONTH' ? 30 : null;
    return ownCandidates.filter(candidate => {
      if (!campaignIds.has(candidate.campaignId)) return false;
      if (!limit) return true;
      const applied = parseDate(candidate.applicationDate);
      return Boolean(applied && Date.now() - applied.getTime() <= limit * 86_400_000);
    });
  }, [campaignIds, ownCandidates, period]);

  const total = filteredCandidates.length;
  const contacted = filteredCandidates.filter(isContacted).length;
  const evaluated = filteredCandidates.filter(isEvaluated).length;
  const aptos = filteredCandidates.filter(isApto).length;
  const hired = filteredCandidates.filter(candidate => candidate.currentStage === 'CONTRATADO' || candidate.selection?.hiringConfirmed).length;
  const target = filteredCampaigns.reduce((sum, campaign) => sum + Number(campaign.responsibles?.find(item => item.userId === currentUser.id)?.target || 0), 0);
  const coverageBase = target || filteredCampaigns.reduce((sum, campaign) => sum + Number(campaign.vacancies || 0), 0);
  const coverage = percent(hired, coverageBase);
  const conversion = percent(aptos, total);
  const contactability = percent(contacted, total);
  const aptitude = percent(aptos, evaluated);
  const timeValues = filteredCampaigns.map(campaign => daysBetween(campaign.requestDate, campaign.endDate || new Date().toISOString())).filter(value => value > 0);
  const timeToFill = timeValues.length ? Math.round(timeValues.reduce((sum, value) => sum + value, 0) / timeValues.length) : 0;
  const sla = percent(timeValues.filter(value => value <= 30).length, timeValues.length);

  const funnel = [
    { label: 'Postulantes', value: total, color: '#143A56' },
    { label: 'Contactados', value: contacted, color: '#154E7D' },
    { label: 'Entrevistados', value: filteredCandidates.filter(candidate => ['ENTREVISTA', 'VERIFICACION_TECNICA', 'EVALUACIONES', 'APTO_CAPACITACION'].includes(candidate.selection?.stage)).length, color: '#4CA899' },
    { label: 'Evaluados', value: evaluated, color: '#E9AA34' },
    { label: 'Aptos para capacitación', value: aptos, color: '#F68565' },
  ];
  const sourceData = Object.entries(filteredCandidates.reduce<Record<string, number>>((acc, candidate) => { acc[candidate.source || 'Otro'] = (acc[candidate.source || 'Otro'] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value: Number(value) })).sort((a, b) => b.value - a.value);
  const noShow = filteredCandidates.filter(candidate => candidate.training?.status === 'NSP' || candidate.training?.attendance?.some(item => item.status === 'NSP')).length;
  const dropouts = filteredCandidates.filter(candidate => candidate.training?.status === 'DESERTO' || candidate.currentStage === 'BAJA').length;
  const trainingPopulation = filteredCandidates.filter(candidate => candidate.training?.status || ['CAPACITACION', 'OJT'].includes(candidate.currentStage)).length;
  const trainingApproved = filteredCandidates.filter(candidate => candidate.selection?.trainingPassed || ['OJT', 'APTO_ALTA', 'GESTION_TALENTO', 'CONTRATADO'].includes(candidate.currentStage)).length;
  const weekly = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day, index) => { const rows = filteredCandidates.filter(candidate => parseDate(candidate.applicationDate)?.getDay() === index); return { day, postulantes: rows.length, aptos: rows.filter(isApto).length }; });
  const activity = filteredCandidates.flatMap(candidate => (candidate.selection?.traceability || []).map(item => ({ id: `${candidate.id}-${item.id || item.date}-${item.time}`, candidate: candidate.fullName, action: item.action || `${item.previousStage} → ${item.newStage}`, date: item.date, time: item.time }))).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0, 6);

  return <div className="space-y-6 pb-12">
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className="flex h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-xs shadow-sm"><CalendarDays className="h-4 w-4 text-slate-600" /><span className="text-slate-500">Periodo</span><select value={period} onChange={event => setPeriod(event.target.value)} className="min-w-0 flex-1 bg-transparent font-semibold text-slate-800 outline-none"><option value="ALL">Histórico completo</option><option value="MONTH">Últimos 30 días</option><option value="WEEK">Últimos 7 días</option></select></label>
      <label className="flex h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-xs shadow-sm"><Filter className="h-4 w-4 text-slate-600" /><span className="text-slate-500">Mis convocatorias</span><select value={campaignId} onChange={event => setCampaignId(event.target.value)} className="min-w-0 flex-1 bg-transparent font-semibold text-slate-800 outline-none"><option value="ALL">Todas ({myAssignedCampaigns.length})</option>{myAssignedCampaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label>
    </section>

    <RecruiterCaptureResponses />
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Kpi label="% Cobertura" value={`${coverage}%`} detail={`${hired} de ${coverageBase} posiciones propias`} icon={Target} tone="bg-emerald-50 text-emerald-600" />
      <Kpi label="Time to Fill" value={`${timeToFill} días`} detail={`${filteredCampaigns.length} convocatorias`} icon={Clock3} tone="bg-sky-50 text-sky-600" />
      <Kpi label="% Conversión total" value={`${conversion}%`} detail={`${aptos} aptos de ${total}`} icon={TrendingUp} tone="bg-teal-50 text-teal-600" />
      <Kpi label="% Contactabilidad" value={`${contactability}%`} detail={`${contacted} contactados`} icon={PhoneCall} tone="bg-teal-50 text-teal-600" />
      <Kpi label="% Aptitud" value={`${aptitude}%`} detail={`${aptos} de ${evaluated} evaluados`} icon={Star} tone="bg-indigo-50 text-indigo-600" />
      <Kpi label="% Cumplimiento SLA" value={`${sla}%`} detail="Objetivo máximo: 30 días" icon={CheckCircle2} tone="bg-amber-50 text-amber-600" />
    </section>

    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.3fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold text-slate-900">Embudo de selección</h3><div className="mt-5 space-y-2">{funnel.map((item, index) => <div key={item.label} className="grid grid-cols-[1fr_58px_150px] items-center gap-3 text-xs"><div className="flex justify-center"><div className="h-9 rounded" style={{ width: `${100 - index * 12}%`, backgroundColor: item.color, clipPath: 'polygon(6% 0,94% 0,84% 100%,16% 100%)' }} /></div><strong className="text-right">{item.value}</strong><span className="text-slate-500">{item.label}</span></div>)}</div><div className="mt-4 inline-flex rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Conversión total: {conversion}%</div></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold text-slate-900">Avance de mis convocatorias</h3><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-3">Convocatoria</th><th>Requerimiento</th><th>Aptos / Req.</th><th>Cobertura</th><th>Fecha límite</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredCampaigns.map(campaign => { const rows = filteredCandidates.filter(candidate => candidate.campaignId === campaign.id); const ownTarget = Number(campaign.responsibles?.find(item => item.userId === currentUser.id)?.target || campaign.vacancies || 0); const ownAptos = rows.filter(isApto).length; const ownHired = rows.filter(candidate => candidate.currentStage === 'CONTRATADO' || candidate.selection?.hiringConfirmed).length; const ownCoverage = percent(ownHired, ownTarget); return <tr key={campaign.id}><td className="py-3"><strong>{campaign.title}</strong><div className="text-[10px] text-slate-500">Inicio: {campaign.startDate || campaign.requestDate}</div></td><td>{ownTarget}</td><td>{ownAptos} / {ownTarget}</td><td><strong>{ownCoverage}%</strong><div className="mt-1 h-1.5 w-24 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, ownCoverage)}%` }} /></div></td><td>{campaign.endDate || 'Sin definir'}</td></tr>; })}</tbody></table>{!filteredCampaigns.length && <Empty text="No tienes convocatorias para el filtro seleccionado." />}</div></article>
    </section>

    <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 text-sm font-semibold"><Award className="h-5 w-5 text-sky-700" />Rendimiento personal</h3><div className="mt-5 grid grid-cols-2 gap-3 text-center"><div className="rounded-xl bg-slate-50 p-4"><div className="text-2xl font-bold">{target}</div><span className="text-xs text-slate-500">Meta asignada</span></div><div className="rounded-xl bg-sky-50 p-4"><div className="text-2xl font-bold text-sky-700">{total}</div><span className="text-xs text-slate-500">Postulantes</span></div><div className="rounded-xl bg-emerald-50 p-4"><div className="text-2xl font-bold text-emerald-700">{aptos}</div><span className="text-xs text-slate-500">Aptos</span></div><div className="rounded-xl bg-teal-50 p-4"><div className="text-2xl font-bold text-teal-700">{hired}</div><span className="text-xs text-slate-500">Contratados</span></div></div></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold">Postulantes por origen</h3>{sourceData.length ? <div className="mt-3 h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={84}>{sourceData.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer></div> : <Empty text="Sin fuentes registradas." />}</article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-5 w-5 text-sky-700" />No Show y deserción preingreso</h3><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-rose-50 p-4"><span className="text-xs text-slate-500">No Show</span><div className="mt-2 text-3xl font-bold text-rose-600">{percent(noShow, total)}%</div><span className="text-[10px] text-slate-500">{noShow} de {total}</span></div><div className="rounded-xl bg-amber-50 p-4"><span className="text-xs text-slate-500">Deserción</span><div className="mt-2 text-3xl font-bold text-amber-600">{percent(dropouts, total)}%</div><span className="text-[10px] text-slate-500">{dropouts} de {total}</span></div></div></article>
    </section>

    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.8fr_1.15fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold">Evolución semanal</h3><div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={weekly}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} /><Line type="monotone" dataKey="postulantes" name="Postulantes" stroke="#154E7D" strokeWidth={2} /><Line type="monotone" dataKey="aptos" name="Aptos" stroke="#4CA899" strokeWidth={2} /></LineChart></ResponsiveContainer></div></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold">Calidad de ingreso</h3><div className="mt-5 space-y-4"><div className="rounded-xl border border-slate-200 p-4"><span className="text-xs text-slate-500">Aprobación en capacitación</span><div className="mt-1 text-2xl font-bold text-emerald-700">{percent(trainingApproved, trainingPopulation)}%</div><span className="text-[10px] text-slate-500">{trainingApproved} de {trainingPopulation}</span></div><div className="rounded-xl border border-slate-200 p-4"><span className="text-xs text-slate-500">Conversión a contratación</span><div className="mt-1 text-2xl font-bold text-sky-700">{percent(hired, Math.max(aptos, hired))}%</div><span className="text-[10px] text-slate-500">{hired} contratados</span></div></div></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-5 w-5 text-sky-700" />Actividad reciente</h3><div className="mt-4 divide-y divide-slate-100">{activity.map(item => <div key={item.id} className="py-3 text-xs"><div className="flex justify-between gap-3"><strong>{item.action}</strong><span className="shrink-0 text-[10px] text-slate-400">{item.date} {item.time}</span></div><div className="mt-1 text-slate-500">{item.candidate}</div></div>)}</div>{!activity.length && <Empty text="No existe actividad reciente." />}</article>
    </section>
  </div>;
};
