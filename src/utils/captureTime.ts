const zone = 'America/Lima';
export function captureDay(value?: string): string {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function formatCaptureTime(value?: string): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Sin fecha registrada';
  return new Intl.DateTimeFormat('es-PE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}
