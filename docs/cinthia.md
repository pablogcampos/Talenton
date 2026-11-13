# CinthIA — fases 1, 2 y 3

## Estado de entrega (13/11/2026)
**Migrado, configurado y publicado en producción.** Ambas migraciones verificadas por hash en Supabase. `GEMINI_API_KEY` configurada como secreto del Worker, sin exposición al navegador. Invitaciones habilitadas tras las pruebas de desarrollo y la validación del entorno destino.

## Arquitectura
React → WebSocket del Worker Cloudflare → Gemini Live `gemini-3.8-live`. La clave principal viaja exclusivamente en la cabecera del servidor a Google. El navegador no conecta directamente con Google ni recibe esa clave. Audio PCM16 mono: captura remuestreada a 16 kHz mediante AudioWorklet, reproducción a la frecuencia indicada por Gemini (24 kHz en las pruebas). El avatar refleja audio reproducido, escucha, procesamiento, error y finalización reales.

La invitación aleatoria de 256 bits caduca en siete días. Antes de usar la API se valida invitación, consentimiento versionado y clave de sesión generada en el navegador, cuyo hash se guarda en PostgreSQL. La autenticación del socket se envía en el primer mensaje, nunca en parámetros URL. No se aceptan instrucciones, transcripciones ni estados finales enviados por el cliente.

Se conserva la bandeja y los permisos de fases anteriores: Admin, Jefe/Analista de Selección y Reclutador habilitados; visibilidad compartida equivalente a Voicebot. Gestión de invitaciones propias/sin asignar y gestión transversal para Admin/Jefe/Analista. No modifica estados, campañas ni asignaciones de Voicebot.

## Persistencia y controles
- Migraciones aditivas `202611130003_cinthia.sql` y `202611130004_cinthia_live.sql`: invitaciones, eventos y sesiones. RLS; acceso sólo mediante RPC del servidor.
- Sesión única por invitación, bloqueo transaccional, lease de conexión de 45 segundos, heartbeat de 15 segundos, máximo cuatro conexiones y seis minutos totales. Reintento automático acotado, con handle de reanudación almacenado sólo en servidor.
- Transcripción incremental de preguntas/respuestas, origen `gemini_live`, fragmentos incompletos, inicio/fin, duración, modelo, errores y vínculo al lead/invitación. Guardado incremental y antes de finalizar. No se guardan grabaciones de audio.
- Finalización transaccional: exige sesión activa, turno terminado y preguntas/respuestas completas no vacías; devuelve recibo persistido. La interfaz muestra agradecimiento sólo tras confirmar el estado del servidor. No se marca completada por desconexión ni por fallo de persistencia.
- El endpoint de recuperación de recibo no revela transcripciones, contexto ni identificadores internos mientras no exista finalización.
- Consentimiento `cinthia-voice-v1`, aviso de procesamiento por Google y controles de micrófono. Tokens de prueba sólo funcionan en localhost con flag del servidor.
- La fecha límite permite auditar la interrupción sin permitir nuevas respuestas o una finalización tardía.

## Archivos principales
- `src/services/cinthiaVoice.ts`: micrófono, PCM, reproducción, interrupciones, reconexión, recibo y limpieza de recursos.
- `src/services/cinthia.ts`: contratos y API.
- `src/views/PublicCinthiaView.tsx`: portal, consentimiento, conversación y confirmación.
- `src/views/CinthiaView.tsx`, `src/components/cinthia/*`: bandeja, avatar, ficha y transcripciones persistidas. Sin scoring.
- `worker/src/cinthia.ts`, `worker/src/cinthiaLive.ts`, integración mínima en `worker/src/index.ts`: rutas, validación y proxy de voz.
- `worker/tests/cinthia.test.ts`, `src/components/cinthia/Cinthia.test.tsx`: regresiones de datos, permisos, sesiones y portal.
- Integración previa mínima en App, tipos, Sidebar, Header, workerApi y acceso al registro original de Voicebot.

## Configuración
Servidor privado (nunca variables `VITE_`):

```text
GEMINI_API_KEY=<secreto de Google>
CINTHIA_LIVE_MODEL=gemini-3.8-live
CINTHIA_LIVE_ENABLED=true
CINTHIA_LIVE_VALIDATED=true
```

Desarrollo aislado: `CINTHIA_DEV_PREVIEW=true`, Worker localhost, base desechable y participantes de prueba autorizados. Producción no admite ese flag. `CINTHIA_LIVE_VALIDATED=true` es un bloqueo de lanzamiento administrado en servidor: desactivarlo si se necesita suspender nuevas entrevistas; el entorno destino ya fue validado. También se requieren las variables Supabase y orígenes permitidos que ya utiliza el Worker. Frontend: `VITE_ADMIN_API_URL` apuntando a ese Worker HTTPS/WSS.

La clave local no se publica automáticamente. Al desplegar: aplicar ambas migraciones, configurar el secreto del Worker de forma privada, publicar Worker/frontend y verificar el dominio, audio y persistencia en el entorno destino antes de habilitar invitaciones. Nunca ejecutar el bootstrap de tests en Supabase real.

## Pruebas realmente ejecutadas
- Conexión directa de diagnóstico con Gemini Live real: setup y audio.
- Proxy Worker local + PostgreSQL PGlite con todas las migraciones: pregunta hablada, respuesta PCM de prueba, transcripción real y repregunta contextual. Recibo y estado COMPLETED persistidos.
- Chrome con dispositivo de micrófono virtual y respuesta hablada sintética en español: consentimiento, permiso concedido, AudioWorklet, audio de Gemini reproducido, transcripción, botón Finalizar y agradecimiento. 75 buffers de audio reproducidos en la ejecución aprobada; sesión de prueba de 56 segundos, no evaluación humana de una entrevista de 3–5 minutos.
- Chrome: permiso de micrófono denegado con aviso correcto; vista móvil de 390 px sin desbordamiento horizontal; cierre forzado del socket y recuperación real con contexto/transcripción conservados.
- Ficha del reclutador renderizada con datos de la sesión real guardada en la base aislada: transcripción y duración visibles. La autorización de esa visualización usa un adaptador local de prueba; los permisos reales se validan en SQL/tests.
- PostgreSQL/Worker: consentimiento, aislamiento por clave de sesión, acceso anónimo denegado, cancelación/expiración, duplicados, concurrencia, reconexión, fragmentos incompletos, guardado y recibo idempotente. 62 pruebas aprobadas incluyendo regresiones relacionales; 9 de React/notificaciones aprobadas.
- TypeScript frontend/Worker y build aprobados. Advertencia preexistente de tamaño del bundle PDF; no se modificó ese módulo.

Comandos reproducibles sin consumo de Gemini:

```text
npm run check
npm --prefix worker run check
npm --prefix worker test -- tests/cinthia.test.ts tests/relationalFlow.test.ts --testTimeout=20000
node node_modules/vitest/vitest.mjs run src/components/cinthia/Cinthia.test.tsx src/components/selection/VoicebotNotifications.test.tsx
npm run build
```

## Errores encontrados y corregidos
- Mensajes binarios Blob del WebSocket no aceptados por TextDecoder: lectura compatible de texto/Blob/ArrayBuffer.
- Timeout de conexión que seguía activo después del upgrade: cancelación del temporizador al abrir el socket.
- Consulta prematura del recibo que devolvía datos internos: respuesta mínima `completed:false`.
- Consentimiento sin versión admitido por semántica NULL de SQL: comparación estricta.
- Reintentos y callbacks de sockets anteriores: cierre/aislamiento del socket y recuperación acotada.
- Una prueba inicial de Chrome fue interrumpida por recarga automática de Vite al editar tests; repetida sin ediciones pasó hasta la confirmación final.

## Pendientes de lanzamiento
Piloto humano con micrófono físico (incluido móvil real) para revisar voz, latencia y cobertura de los cinco temas en 3–5 minutos. La duración objetivo y los temas están definidos en las instrucciones de CinthIA; la finalización manual puede producir entrevistas más breves. No se ha implementado calificación automática ni WhatsApp API. La conservación y eliminación de transcripciones debe seguir la política del responsable de datos; esta fase no incorpora borrado automático.

Referencias oficiales consultadas: [API Live](https://ai.google.dev/api/live), [gestión de sesiones](https://ai.google.dev/gemini-api/docs/live-api/session-management), [capacidades de voz](https://ai.google.dev/gemini-api/docs/live-guide).

## Validación de publicación
- Supabase: migraciones 202611130003/202611130004 aplicadas y hashes comprobados mediante `scripts/apply-cinthia.mjs`.
- Worker publicado: `45ea5fb1-4d78-49fc-9384-88f8d930ee9e`.
- Railway: despliegue `99c5ac84-318d-411c-8e52-718da2248a8c`, estado SUCCESS, dominio `talent-ontech.up.railway.app`.
- Chrome contra el dominio productivo: micrófono virtual, Gemini real, 75 buffers reproducidos, respuesta transcrita y finalización confirmada. Registro reservado: «PRUEBA Killadata - NO LLAMAR»; no se enviaron mensajes ni se usaron postulantes reales.
- API pública: enlace válido 200 y disponible, enlace inexistente 404, origen ajeno 403, cabecera no-store.

## Corrección de reconexión móvil (13/11/2026)
Se observó una sesión ACTIVE con lease antiguo y sin cierre registrado. Los reintentos del navegador se agotaban antes de los 45 segundos del lease. El proxy espera hasta 48 segundos, sin robar una sesión activa; el cliente admite ese tiempo de recuperación. Audio agrupado en 100 ms y transcripciones enviadas sólo al cambiar, reduciendo mensajes y escrituras. No se confirmó la causa inicial del corte móvil. 12 pruebas de servidor y 7 de interfaz aprobadas; tipos y build correctos. No requiere migración. El límite total de seis minutos se conserva: una sesión vencida no se reactiva automáticamente ni se marca completada.
