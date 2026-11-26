# Formación autónoma

Mis capacitaciones / Capacitaciones Iniciales → Crear capacitación desde Excel. Plantilla .xlsx: DNI, Nombre completo, Celular, Correo y Jornada. Máximo 200 participantes, 2 MB; sin fórmulas. Vista previa, validación servidor y confirmación. El formador queda asignado automáticamente; coordinación/jefatura/admin seleccionan un formador habilitado.

Transacción idempotente, DNI reutilizado por empresa, rechazo de otra capacitación activa. Se conservan nombres/contactos existentes e historial; proceso previo se cierra al confirmar. Contenedor interno de convocatoria por compatibilidad, sin intervención de Selección. Importaciones privadas fuera del snapshot.

Asistencia mantiene ventanas y desbloqueos existentes. Formación asigna propuestas oficiales por jornada y gestiona documentos de sus participantes, sin publicar condiciones laborales. Firmados inmutables. Jornadas proceden del Excel.

Validado: parser; duplicados; validación sin escritura; reintentos; reutilización; permisos; flujo API+SQL de creación, bootstrap, inicio, asistencia, carga documental y asignación de propuesta como formador; TypeScript y build.
