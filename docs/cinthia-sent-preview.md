# Enviadas y vista previa CinthIA

- La pestaña Enviadas corresponde a PENDING: envío confirmado mediante «Marcar como enviada», sin entrevista iniciada. PREPARED conserva enlaces preparados o abiertos en WhatsApp sin confirmación de envío. Los conteos y permisos existentes se conservan.
- El build genera dist/cinthia.html desde el mismo index compilado (mismos scripts, interfaz y recuperación de carga). Caddy lo sirve para /cinthia/*, sin ejecutar JavaScript para obtener los metadatos.
- Open Graph y Twitter utilizan public/cinthia-techcenter-preview-v1.png, 1200x630, avatar y logo originales. No se incluye nombre, teléfono, token o respuestas del postulante en la tarjeta.
- La imagen es pública; visitar el enlace para obtener la vista previa no marca la invitación como enviada ni inicia la entrevista.
- WhatsApp puede conservar tarjetas anteriores en caché. Los mensajes ya enviados no se actualizan necesariamente; comprobar compartiendo nuevamente el enlace.
- Sin migraciones ni cambios de Worker.
