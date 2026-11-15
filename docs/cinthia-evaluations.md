# CinthIA: evaluaciones configurables

Implementación del 15/11/2026. Seis migraciones aplicadas y verificadas en Supabase `gvwaqlvphvfzhnhlnuuv`. Worker publicado: d154ec50-3ae7-4c19-93db-53b92da96a9b.

## Funcionalidad
- Biblioteca por empresa/campaña/puestos, filtros y asistente de seis pasos. Borradores incompletos; publicación sólo con configuración válida.
- Duplicación como plantilla, versiones publicadas inmutables, desactivación y archivo.
- Competencias, comportamientos observables, pesos 100%, rúbricas 1–4 y banco reutilizable. Elegibilidad separada de la puntuación.
- Siete tipos de actividades por voz, esenciales y seguimientos acotados. Conserva Gemini Live, avatar, análisis de audio, reconexión y consentimiento.
- Asignaciones individuales desde el lead y Candidato 360 (incluye Staff), masivas desde Voicebot. Sin crear personas duplicadas. Orden inicial de leads por recepción descendente.
- Historial de invitaciones, versión, persona y postulación existente; entrevistas generales anteriores accesibles desde la ficha. WhatsApp nativo en escritorio y móvil, sin envío automático.
- Informe interno: citas exactas, notas por competencia, fortalezas, aspectos por profundizar, información no verificada, experiencia/disponibilidad declaradas y revisión humana.
- Puntuación ponderada determinista. Si falta evidencia, competencia y global no evaluables; no convierte ausencia de evidencia en cero.
- Resumen de ejecuciones, auditoría y calibración contra la última valoración humana. Pruebas excluidas de indicadores productivos.

## Archivos
- `shared/cinthiaEvaluation.ts`: contrato, validación y cálculo de resultados.
- `src/components/cinthia/{EvaluationWorkspace,EvaluationEditor,EvaluationRuntime,SubjectEvaluations,BulkEvaluationAssign}.tsx`: biblioteca, asistente, configuración, integración y asignación masiva.
- `src/views/{CinthiaView,VoicebotView,PublicCinthiaView}.tsx`, `src/components/candidates/Candidate360Modal.tsx`, `src/services/cinthia.ts`: integración con pantallas existentes.
- `worker/src/{cinthia,cinthiaLive,cinthiaQuestionFlow,cinthiaScoring,index}.ts`: API, flujo de voz, generación estructurada y cron.
- `worker/wrangler.toml`: modelo de calificación y procesador cada minuto, hasta tres trabajos en paralelo.
- Pruebas: `worker/tests/{cinthiaEvaluations,cinthiaQuestionFlow}.test.ts`, `src/components/cinthia/{Evaluations,Cinthia}.test.tsx`, `src/views/VoicebotView.test.tsx`.

## Persistencia y seguridad
Se conserva Supabase relacional como proveedor productivo, sin migrar módulos legados Firebase.
Migraciones nuevas, en orden:
1. `202611150001_cinthia_evaluations.sql`: catálogo, versiones, banco, auditoría y permisos.
2. `202611150002_cinthia_assignments.sql`: amplía invitaciones/sesiones existentes; referencias a personas/postulaciones; informes y revisiones.
3. `202611150003_cinthia_reports.sql`: cola con bloqueo atómico, reintentos limitados y analítica.
4. `202611150004_cinthia_controls.sql`: voz, límites, instantáneas, pruebas y metadatos públicos mínimos.
5. `202611150005_cinthia_legacy_isolation.sql`: endpoints anteriores excluyen evaluaciones versionadas.
6. `202611150006_cinthia_calibration.sql`: comparación humana/IA por versión y competencia.

Tablas protegidas con RLS y sin acceso directo anon/authenticated; RPC invocadas por Worker con actor autenticado y comprobación de empresa/campaña. Admin/Jefe/Analista administran evaluaciones; reclutadores asignan dentro de su alcance. Configuración global sólo Admin. Claves sólo en servidor. Evaluaciones finalizadas no cambian la decisión laboral ni el estado del candidato.

## Integraciones y validación
- Gemini Live real: prueba con voz sintética local, pregunta configurada, transcripción, despedida y confirmación automática de finalización.
- Gemini generateContent real (`gemini-3.8-flash`): JSON estructurado y evidencia literal, validación posterior del servidor. No se usaron postulantes reales en estas pruebas.
- PostgreSQL PGlite aplica todas las migraciones y prueba permisos, conflictos de edición, publicación, inmutabilidad, asignación idempotente, Staff, aislamiento de endpoints antiguos, cola y calibración.
- Pruebas React de biblioteca, asistente, ficha y WhatsApp; regresiones de Voicebot y microentrevistas anteriores.
- 44 pruebas dirigidas aprobadas: 16 React y 28 Worker/PostgreSQL/flujo de conversación. TypeScript frontend/Worker y build de producción aprobados.
- Chrome escritorio 1440px y móvil emulado 390px: biblioteca/asistente sin desbordamiento horizontal ni errores JavaScript. Capturas QA en `supabase/.local/evaluation-*.png` (ignoradas por Git).
- Esquema estructurado: https://ai.google.dev/gemini-api/docs/structured-output ; servicio: https://ai.google.dev/api/generate-content .

## Procedimiento de despliegue
1. Respaldo y aplicación de las seis migraciones al proyecto correcto, comprobando el historial de migraciones.
2. Desplegar Worker manteniendo secretos existentes y verificar cron/modelo; luego frontend Railway.
3. Prueba productiva controlada con una evaluación de prueba y comprobar informes/roles antes de asignaciones reales.
No ejecutar las migraciones históricas indiscriminadamente ni restaurar tablas productivas con los fixtures locales.

## Limitaciones explícitas
- La retención registra una política; no ejecuta eliminación automática de historiales. Requiere un proceso posterior de borrado/exportación con alcance definido.
- El modelo se cambia por configuración del servidor tras validar compatibilidad; no se ofrece un selector arbitrario en la UI.
- No se guardan grabaciones de audio. La revisión utiliza transcripción y citas.
- El canal principal sigue siendo voz; no se añadió una entrevista alternativa completa por texto.
- Pendiente prueba en teléfono físico y redes móviles reales; la emulación responsive no sustituye esa prueba.
- Dependencia de disponibilidad/cuotas de Gemini. Los informes fallidos conservan transcripción y código de error; máximo tres intentos, sin inventar resultados.
- Las rúbricas requieren validación profesional. La calibración muestra consistencia observada, no certifica validez predictiva ni autoriza decisiones automáticas.
- El build mantiene el aviso preexistente de tamaño del paquete PDF de propuestas, fuera del alcance de CinthIA.
