type RecordValue = Record<string, unknown>;
const records = (value: unknown): RecordValue[] => Array.isArray(value) ? value.filter((item): item is RecordValue => !!item && typeof item === 'object') : [];
export const limaDay = (value: Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
/** Calendar day of the course, including weekends; never truncates long courses. */
export function trainingDayNumber(start: string, day: string) {
  const elapsed = (Date.parse(day.slice(0, 10) + 'T12:00:00Z') - Date.parse(start.slice(0, 10) + 'T12:00:00Z')) / 86400000;
  return Number.isFinite(elapsed) ? Math.max(1, Math.floor(elapsed) + 1) : 1;
}
export function unlockIsActive(unlock: unknown, now: number) {
  if (!unlock || typeof unlock !== 'object') return false;
  const value = unlock as RecordValue;
  return value.status === 'APROBADA' && Date.parse(String(value.decidedAt)) <= now && Date.parse(String(value.expiresAt)) > now;
}
export function evaluationDefinition(config: unknown, id: string) {
  return records(config).find(item => String(item.id) === id);
}
export function validEvaluationDefinition(config: RecordValue) {
  return typeof config.name === 'string' && !!config.name.trim() &&
    typeof config.maxScore === 'number' && Number.isFinite(config.maxScore) && config.maxScore > 0 &&
    typeof config.minScore === 'number' && Number.isFinite(config.minScore) && config.minScore >= 0 && config.minScore <= config.maxScore;
}
export function trainingEvaluationsApproved(config: unknown, grades: unknown) {
  const definitions = records(config);
  const evaluations = records(grades);
  return definitions.length > 0 && definitions.every(definition => validEvaluationDefinition(definition) && evaluations.some(grade =>
    String(grade.evaluationId ?? grade.definitionId) === String(definition.id) &&
    typeof grade.score === 'number' && Number.isFinite(grade.score) &&
    grade.score >= Number(definition.minScore) && grade.score <= Number(definition.maxScore) &&
    Number(grade.maxScore) === definition.maxScore));
}
