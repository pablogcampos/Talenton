import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {AttendancePanel,AttendanceTable} from './AttendancePanel';
import {limaDate,limaTime,liveAttendanceState,pastAttendanceDates} from './attendanceTime';
import type {CandidateRecord} from '../../types';
import type {AttendanceWindowInfo} from '../../context/TalentContext';

const info:AttendanceWindowInfo={serverNow:'2026-11-03T14:00:00Z',startAt:'2026-11-03T14:00:00Z',closesAt:'2026-11-03T15:00:00Z',state:'OPEN',unlock:null};
describe('historial y hora de asistencia',()=>{
 it('usa Lima incluso cuando el día UTC ya cambió',()=>{
  expect(limaDate(new Date('2026-11-04T02:30:00Z'))).toBe('2026-11-03');
  expect(limaTime('2026-11-04T02:30:00Z')).toBe('21:30:00');
 });
 it('actualiza apertura y cierre aunque la respuesta original decía abierta',()=>{
  expect(liveAttendanceState(info,Date.parse('2026-11-03T13:59:59Z'))).toBe('UPCOMING');
  expect(liveAttendanceState(info,Date.parse(info.startAt))).toBe('OPEN');
  expect(liveAttendanceState(info,Date.parse(info.closesAt))).toBe('OPEN');
  expect(liveAttendanceState(info,Date.parse(info.closesAt)+1000)).toBe('LOCKED');
  const unlock = {id:'u',trainingId:'g',date:'2026-11-03',reason:'Corrección',status:'APROBADA' as const,requestedAt:info.startAt,decidedAt:info.closesAt,expiresAt:'2026-11-04T03:00:00Z'};
  expect(liveAttendanceState({...info,state:'UNLOCKED',unlock},Date.parse(info.closesAt)+1000)).toBe('UNLOCKED');
  expect(liveAttendanceState({...info,state:'UNLOCKED',unlock},Date.parse(unlock.expiresAt))).toBe('LOCKED');
  expect(liveAttendanceState({...info,state:'UNLOCKED'},Date.parse(info.closesAt)+1000)).toBe('LOCKED');
 });
 it('incluye todos los días registrados, sábados y domingos, sin límite de doce',()=>{
  const dates=Array.from({length:20},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0'));
  const result=pastAttendanceDates([{training:{attendance:dates.concat('2026-10-04','2026-11-03').map(date=>({date}))}}],'2026-11-03');
  expect(result).toHaveLength(20);expect(result[0]).toBe('2026-10-20');expect(result).toContain('2026-10-04');expect(result).toContain('2026-10-03');
 });
 it('el historial muestra estados y notas originales sin controles de edición',()=>{
  const participants=[{id:'one',fullName:'Participante',dni:'00123456',training:{attendance:[{date:'2026-10-04',status:'TARDANZA',notes:'Transporte demorado'}]}},{id:'two',fullName:'Sin registro'}] as CandidateRecord[];
  const html=renderToStaticMarkup(<AttendanceTable participants={participants} date="2026-10-04" openCandidate360={()=>{}}/>);
  expect(html).toContain('Tardanza');expect(html).toContain('Transporte demorado');expect(html).toContain('00123456');expect(html).toContain('Sin marcar');expect(html).not.toContain('<select');
 });
 it('impide marcar mientras se verifica otra fecha y muestra la hora del servidor',()=>{
  const html=renderToStaticMarkup(<AttendancePanel participants={[{id:'one',fullName:'Participante'}] as CandidateRecord[]} date="2026-11-02" setDate={()=>{}} onToday={()=>{}} windowInfo={info} loading={true} saving={false} onMark={()=>{}} onUnlock={()=>{}} onDecision={()=>{}} canDecide={false} openCandidate360={()=>{}}/>);
  expect(html).toContain('Ver asistencias pasadas');expect(html).toContain('09:00:00');expect(html).toMatch(/<select[^>]*disabled/);
 });
 it('marca la inyección y bloquea fechas anteriores sin clasificarlas como faltas',()=>{
  const person={id:'injected',fullName:'Persona',training:{injection:{date:'2026-11-05',at:'2026-11-05T14:00:00Z',userId:'a',userName:'Analista'},attendance:[]}} as unknown as CandidateRecord;
  const before=renderToStaticMarkup(<AttendanceTable participants={[person]} date="2026-11-04" openCandidate360={()=>{}} onMark={()=>{}} disabled={false}/>);
  expect(before).toContain('Inyección');expect(before).toContain('Analista');expect(before).toContain('Aún no incorporado');expect(before).toMatch(/<select[^>]*disabled/);
  const current=renderToStaticMarkup(<AttendanceTable participants={[person]} date="2026-11-05" openCandidate360={()=>{}} onMark={()=>{}} disabled={false}/>);
  expect(current).not.toMatch(/<select[^>]* disabled=""/);expect(current).toContain('Sin marcar');
 });

});
