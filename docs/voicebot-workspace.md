# Leads Voicebot: centro de gestión

## Alcance y archivos
- src/views/VoicebotView.tsx: bandejas, filtros, contadores, tabla y ficha de gestión.
- src/components/selection/voicebotWorkspace.ts: presentación de estado, teléfono y SLA.
- VoicebotLeadDialog.tsx: panel lateral accesible; conserva foco y desplazamiento de la bandeja.
- VoicebotBulkAssign.tsx y VoicebotSlaSettings.tsx: asignación mediante API existente y configuración Admin.
- LeadDispositionFields.tsx y LeadTimeline.tsx: número incorrecto e historial de intentos/agenda/descarte.
- worker/src/voicebot.ts: adaptadores autenticados de workspace, intentos y configuración.
- supabase/migrations/202611130002_voicebot_workspace.sql: migración compatible, sin eliminar registros.
- Pruebas: VoicebotWorkspace.test.tsx y worker/tests/relationalFlow.test.ts; CI incluye regresiones.

## Datos y permisos
Se conserva la recepción del Voicebot, el contrato de ingesta, RLS, toma atómica, asignación Admin/Analista y la integración con Candidatos.
El workspace consulta 50 registros por página; calcula métricas y contadores en servidor sobre todos los registros de los filtros, no sobre la página. Los contadores de pestañas comparten los filtros; las tarjetas corresponden a la pestaña seleccionada.
Fecha/periodo filtra recepción; Convertidos hoy además verifica la conversión durante el día peruano.

Los estados operativos son una presentación compatible:
- candidato vinculado → Convertido;
- descarte previo, No acepta propuesta o No apto → Descartado;
- Reprogramado → Seguimiento pendiente;
- Nuevo → Nuevo;
- resto → En gestión.

Cada ATTEMPT, SCHEDULE o DISCARD añade un registro con actor y hora del servidor. No modifica eventos anteriores. El reclutador responsable puede añadir intentos aun después del primer guardado; UPDATE de clientes anteriores conserva el bloqueo de edición. Admin conserva su permiso de gestión.
Agendar no se cuenta como contacto. Abrir teléfono/WhatsApp tampoco crea una gestión.
Convertidos continúan en Candidatos: no admiten nuevos intentos desde Voicebot.

## SLA y conversión
Primer contacto: 10 minutos, advertencia a los 8, configurables por Admin y validados en servidor.
Se usa la recepción y el primer UPDATE histórico o ATTEMPT. El SLA anterior de asignación permanece separado.
La conversión existente incorpora comprobación transaccional de teléfono normalizado dentro de la empresa; si hay coincidencia se bloquea para revisión en Candidatos, sin fusionar personas automáticamente.
Los datos faltantes se completan mediante el flujo de Candidatos existente.

## Límites explícitos
No hay taxonomía de prioridad: se muestra Sin configurar, sin inventar categorías.
Teléfono usa tel:; WhatsApp abre wa.me sin envío automático ni evidencia ficticia de llamada.
Seguimientos vencidos se señalan en bandeja. No se incorporó un proveedor telefónico ni notificaciones fuera de la plataforma.
El DNI se busca cuando está disponible en las claves dni, DNI o document_number del payload.
Asignación masiva usa las operaciones atómicas por lead existentes y reporta fallos individuales; no promete atomicidad del lote completo.
