import type { AttendanceWindowInfo } from '../../context/TalentContext';

export const limaDate = (value: Date | number = new Date()) => new Intl.DateTimeFormat('en-CA', {
 timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(value);
export const limaTime = (value: string | number) => new Intl.DateTimeFormat('es-PE', {
 timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).format(new Date(value));
export const attendanceDateLabel = (value: string) => new Intl.DateTimeFormat('es-PE', {
 timeZone: 'America/Lima', day: '2-digit', month: 'long', year: 'numeric',
}).format(new Date(value + 'T12:00:00-05:00'));
export function liveAttendanceState(info: AttendanceWindowInfo, now: number): AttendanceWindowInfo['state'] {
 if(info.state === 'UNLOCKED') return 'UNLOCKED';
 return now < Date.parse(info.startAt) ? 'UPCOMING' : now <= Date.parse(info.closesAt) ? 'OPEN' : 'LOCKED';
}
export function pastAttendanceDates(participants: {training?: {attendance?: {date:string}[]}}[], today: string) {
 return [...new Set(participants.flatMap(p => p.training?.attendance?.map(a=>a.date) ?? []))]
  .filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<today).sort().reverse();
}
