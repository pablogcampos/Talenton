# Captación, duplicados y exportación — 20/11/2026

- Captación pública reintenta hasta tres veces un conflicto transaccional, recargando el estado y conservando el identificador idempotente. Turnstile se verifica una vez por petición HTTP; la autorización no se comparte entre peticiones. Los adjuntos fallidos se limpian antes del reintento.
- Verificación expirada o sin respuesta: se muestra recuperación sin borrar respuestas. No se omite la protección antibot.
- Registro manual: la advertencia de duplicado ofrece vincular una captación o trasladar una candidatura existente mediante los flujos autorizados. El traslado requiere confirmación, conserva el historial y cierra la participación anterior. No cambia de responsable ni evade permisos.
- Excel, hoja Candidatos: jornada y nueva columna «Turno / horario elegido», recuperadas de respuestas históricas o personalizadas. Cada envío completo permanece en Respuestas.

Validación: 12 enlaces activos, ambos orígenes Railway, HTTP 200, CORS correcto y seguridad configurada; cuatro formularios Techcenter válidos. Sin insertar postulaciones ficticias en producción. TypeScript frontend/Worker y compilación correctos. 12 pruebas frontend correctas. Backend: 115 de 118 pruebas correctas, incluyendo registro, archivos, traslado y dos conflictos consecutivos con una sola verificación Turnstile y un único registro. Las tres discrepancias son expectativas antiguas de acceso limitado por empresa/convocatoria, incompatibles con las migraciones de acceso universal; no se cambiaron permisos para satisfacerlas.
