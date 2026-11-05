import { describe, expect, it } from 'vitest';
import { captureDay, formatCaptureTime } from './captureTime';
describe('marca temporal de captación en Perú', () => {
  it('filtra por el día peruano incluso al cambiar el día UTC', () => {
    expect(captureDay('2026-11-06T02:15:30Z')).toBe('2026-11-05');
    expect(formatCaptureTime('2026-11-06T02:15:30Z')).toContain('21:15:30');
  });
  it('no inventa una fecha para registros inválidos', () => {
    expect(captureDay('invalid')).toBe('');
    expect(formatCaptureTime(undefined)).toBe('Sin fecha registrada');
  });
});
