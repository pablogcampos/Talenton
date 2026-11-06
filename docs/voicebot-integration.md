# Leads Voicebot

## Tabla de recepción

Proyecto Supabase: `gvwaqlvphvfzhnhlnuuv`.
Tabla: `public.voicebot_leads`.

Es una bandeja global compartida de Selección: administrador, jefe, analista y reclutador activos pueden consultar los mismos leads. No depende de la empresa seleccionada. Los perfiles de Formación, Operaciones y Talento no tienen acceso por su rol. Los leads no crean candidatos ni convocatorias automáticamente.

El proveedor todavía no tiene credenciales ni permisos. La conexión externa es una etapa posterior: crear una identidad exclusiva con INSERT únicamente sobre las columnas de recepción; no entregar la clave `service_role`, la contraseña principal de PostgreSQL ni permisos sobre otras tablas. No se habilitan escrituras anónimas.

## Contrato para el proveedor

Obligatorios: `external_id` (ID estable de la llamada/lead, máximo 200 caracteres) y `phone` (texto, 6–40 caracteres). `source` identifica al proveedor y por defecto es `voicebot`.

La combinación `(source, external_id)` es única. Un reintento debe usar el mismo ID y tratar la colisión como un registro ya recibido, sin sobrescribirlo. Una nueva llamada puede tener otro ID aunque coincida el teléfono.

| Columna | Contenido |
| --- | --- |
| `occurred_at` | Fecha y hora de la llamada, ISO 8601 con zona, por ejemplo `2026-11-06T15:30:00-05:00` |
| `full_name`, `phone` | Nombre y teléfono como texto |
| `origin` | Origen del lead |
| `company_name`, `campaign_name` | Empresa y campaña informadas, opcionales; no conceden permisos |
| `workday` | Jornada: Fulltime, Semifull o Part time; el Excel la denominaba Modalidad |
| `district`, `experience` | Distrito y experiencia declarada |
| `interview_availability` | Disponibilidad para entrevista |
| `interest`, `ai_reason` | Interés y explicación de la clasificación |
| `transcript`, `bot_notes` | Lo que dijo la persona y notas del bot |
| `source_recruiter` | Reclutador informado por el proveedor; no asigna al responsable de la plataforma |
| `payload` | Objeto JSON para conservar columnas adicionales originales, máximo 100 KB |

`received_at` lo genera Supabase. El proveedor no debe escribir `id`, `received_at`, `status`, `owner_auth_id`, `owner_name`, `management_notes`, `version` ni `updated_at`.

Ejemplo de datos (sin enviarlo a producción):

```json
{
  "source": "voicebot",
  "external_id": "llamada-12345",
  "phone": "+51999111222",
  "full_name": "Persona de ejemplo",
  "occurred_at": "2026-11-06T15:30:00-05:00",
  "workday": "Semifull",
  "interest": "Alto",
  "experience": "Experiencia en ventas",
  "interview_availability": "Mañana por la tarde",
  "payload": {}
}
```

## Gestión y alertas

- Tomar lead asigna al usuario autenticado de forma atómica; dos personas no pueden tomar el mismo lead.
- Su responsable registra estado y notas. El resto conserva visibilidad, pero no puede sobrescribir su gestión.
- Los cambios usan versión para rechazar actualizaciones desfasadas y dejan historial en `public.voicebot_lead_history`.
- La tabla está incorporada a `supabase_realtime`, con SELECT condicionado por RLS. No se conceden INSERT/UPDATE/DELETE al cliente autenticado.
- La plataforma muestra alertas con la sesión abierta; “Activar sonido” habilita audio mediante interacción del usuario. No son notificaciones con el navegador cerrado. La reconexión tiene consulta de respaldo cada 30 segundos.
- La bandeja usa páginas de 50 registros y búsqueda por nombre, teléfono o ID externo. El detalle conserva todos los campos de recepción y el JSON adicional.

## Despliegue

Aplicar `scripts/apply-voicebot-leads.mjs --execute` con las variables de conexión de Supabase del entorno; luego publicar Worker y frontend. El script verifica proyecto, TLS y hash de migración. No importar el Excel como si fueran llamadas nuevas sin una solicitud explícita.
