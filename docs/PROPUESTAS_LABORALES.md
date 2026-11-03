# Propuestas laborales

- Selección → Propuesta Laboral: administrador, jefe y analista crean versiones de texto por empresa y convocatoria/campaña autorizada. Cada guardado conserva versiones previas.
- Reclutador (o administrador) asigna una versión a una capacitación; solo misma empresa/campaña y antes del cierre teórico.
- Se genera un documento personalizado por participante con nombre, documento, empresa, campaña, grupo, días, fechas y texto. Nuevas incorporaciones reciben el documento automáticamente.
- Capacitación → Propuestas permite consultar estados, abrir/copiar enlaces y descargar documentos firmados. Las consultas respetan empresas, campañas y grupo asignado del formador.
- La página pública usa un enlace aleatorio de 256 bits. Para firmar exige aceptación, documento coincidente y trazos. Se limita el cuerpo y los intentos por enlace.
- Supabase conserva snapshot, SHA-256 de contenido, trazos, aceptación, fecha del servidor y hash de evidencia técnica. Es firma dibujada con aceptación; no es certificado digital.
- Descargar firmado genera un HTML autónomo con texto y firma vectorial; puede imprimirse desde el navegador. No se incorporó un servicio externo ni se afirma certificación de firma.
- Documentos firmados no pueden modificarse ni eliminarse. Una plantilla posterior no los cambia. Reemplazar una asignación sin firmas revoca sus enlaces; con firmas se rechaza.
- El grupo puede iniciar y continuar sin firma. Triggers SQL impiden cerrar teoría o avanzar a OJT con cualquier participante sin firma, incluidos reprogramados y registros archivados. No se cambian retroactivamente etapas ya cerradas.
- Nuevas tablas en esquema privado talent_offers, con RLS, sin acceso anon/authenticated. RPC solo service_role, actor obtenido desde sesión verificada y permisos resueltos en SQL.
- Tokens se mantienen privados a usuarios autorizados; no enviar registros de requests públicos a logs ni publicar enlaces de producción en documentación.
- Regla de asistencia SQL y solicitud de desbloqueo alineadas a 09:00–10:00 America/Lima.

## Validación
- Suite Worker: 169 tests, incluida creación/asignación por rol, separación de empresa/campaña, rechazo de firma inválida, rate limit, revocación, reintento, inmutabilidad y cierre con todos firmados.
- Interfaz: 10 tests de formación y TypeScript frontend/backend.
- Prueba visual local: dibujo, aceptación y confirmación sin personas reales ni escritura en producción.
- Migraciones: scripts/apply-labor-offers.mjs verifica proyecto, TLS, hash en ledger, permisos, triggers y horario. Preflight sin --execute, aplicación atómica con --execute.
