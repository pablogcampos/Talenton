# CinthIA: evaluaciones libres

Sección exclusiva del administrador en CinthIA → Evaluaciones libres. Participantes externos, sin leads ficticios, candidatos obligatorios ni cuentas de usuario.

## Flujo y arquitectura

- Crear borrador, completar configuración/rúbrica (100%), activar y copiar `/cinthia/libre/<token>`.
- El enlace devuelve sólo nombre, descripción, objetivo general y duración. Registro con nombre, celular, correo opcional y consentimiento versionado.
- Cada intento obtiene otro token aleatorio de 256 bits. Reintentar un registro usa una clave idempotente de sesión; no entrega sesiones ajenas al conocer un celular.
- Reutiliza `cinthiaVoice`, Web Audio, avatar, WebSocket del Worker, `cinthia_sessions`, lease, transcripción y cola `cinthia_results`. Mismas claves y modelos Gemini existentes, sin nuevas dependencias.
- Modo libre sustituye únicamente la instrucción conversacional por el escenario/personaje; no usa QuestionFlow de las entrevistas. Audio bidireccional real, sin preguntas ni transcripción visible durante la conversación.
- Configuración copiada por intento; editar no cambia intentos existentes. Reanudación no extiende el plazo ni reinicia los intentos de conexión.
- Pausa después de 30 segundos de inactividad; cierre automático por duración y cierre natural mediante herramienta validada. Límite de 20 conexiones libres simultáneas, 20 registros/hora por IP/enlace y cuota global por evaluación. Intentos por celular normalizado (sin verificación SMS: no prueba identidad).
- Tablas nuevas privadas con RLS y RPC sólo para service_role; autorización administrativa vuelve a comprobarse en SQL. Los participantes nunca reciben rúbricas, configuración privada, informes de otros ni credenciales.

## Informes y límites

Se conserva el evaluador existente con evidencia literal validada. La escala de cuatro niveles se presenta como 0–100 mediante `(nivel-1)*100/3`, con ponderación configurada. Sin evidencia se muestra no evaluable y no se inventa un promedio global. Desglose, fortalezas, oportunidades, evidencias, resumen, revisión humana, filtros, consolidado y CSV con protección de fórmulas.

Vinculación administrativa por coincidencias de celular con confirmación explícita; no crea ni fusiona candidatos automáticamente. No hay decisiones definitivas de contratación.

No se almacenan grabaciones de audio, sólo transcripciones e informes, igual que CinthIA actual. Se conserva la política existente: `retentionEnforced=false`; este cambio no crea un borrado automático ni afirma que esté aplicado. Consentimiento informa uso y solicitud de eliminación. Al exportar, proteger el archivo con datos personales.

## Verificación

- TypeScript frontend y Worker; build de producción.
- Pruebas PostgreSQL/PGlite: acceso admin, borrador/pausa/vigencia, cuotas, idempotencia, no creación de leads, sesión privada, plazo fijo al reconectar, finalización y cola de informes, permiso service_role.
- Regresión de evaluaciones, flujo de preguntas, diagnósticos, plantillas, audio y reproducción existentes.
- React: conversación libre oculta preguntas/transcripción y muestra controles de voz; editor admite borrador.
- Chrome móvil emulado 390×844: bienvenida y formulario sin desbordamiento horizontal.
- Gemini real: voz sintética de prueba enviada como PCM 16kHz; dos turnos, audio de respuesta y transcripción recibidos. Respondió en personaje a las necesidades del participante. Evaluador existente generó informe con evidencia literal de esa conversación. No se usaron datos reales de participantes en esa prueba.
- La prueba real del proveedor y la prueba SQL de sesión están separadas; no sustituye una prueba de voz humana en un teléfono físico.

Migración: `node --env-file=.env.local --env-file=.env.postgres.local scripts/apply-cinthia-free.mjs --execute`. Después desplegar Worker y frontend. No modificar claves/modelos.
