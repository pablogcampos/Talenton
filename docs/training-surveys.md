# Encuestas de capacitación

Entrega acordada: capacitación inicial. OJT y Operaciones quedan para otra entrega.

## Integración

- Formación → Encuestas de capacitación. Reutiliza los permisos reales de Formación: administrador, jefe, coordinador dentro de su alcance y formador asignado.
- Una encuesta por empresa y capacitación, creada por trigger al insertar la capacitación. La migración inicializa también las existentes.
- Única condición de apertura: estado FINALIZADA. Es el cierre del grupo en la arquitectura actual; pasar a EN_OJT no equivale a finalizar.
- No se consultan asistencia, día 5 ni notas para responder. No hay habilitación manual. Una vez abierta, conserva disponibilidad e historial.
- Enlace público por encuesta. Documento DNI/CE cotejado con los datos actuales de la persona y pertenencia al grupo. Documento tratado como texto.
- La unicidad se garantiza en PostgreSQL por encuesta y participante estable. Cambiar el DNI no habilita otra respuesta.
- Ocho valoraciones obligatorias de 1 a 5, dos comentarios obligatorios. Puntaje = suma / 2; porcentaje = puntaje / 20 × 100.
- Resultados y comentarios separados del cumplimiento nominal. No se afirma anonimato: el servidor conserva el vínculo con el participante para evitar duplicados.
- Exportación CSV compatible con Excel, solo para administrador/jefe/coordinador autorizados. Sin identidad en las filas de respuestas; protege contra fórmulas en comentarios.
- Creación, habilitación y exportación auditadas. Contexto de grupo/campaña/formador capturado al responder.
- Refresco cada 30 segundos, al volver a la ventana y ante talent:data-changed; solo con la página visible.

## Persistencia y seguridad

Migración aditiva 202611010001_training_surveys.sql. No modifica asistencia, notas ni estados del negocio. Tablas privadas con RLS; funciones RPC solo para service_role. El Worker valida sesión y alcance con requireTrainingAccess antes de consultar resultados.

El enlace y el documento verifican pertenencia, pero no sustituyen autenticación fuerte. No se devuelven nombres en el formulario público. Se limitan envíos por enlace y origen de red mediante hash con secreto del servidor, sin guardar IP en claro. Los contadores se purgan tras un día al procesar nuevos envíos. Personas en una misma red comparten el límite de 20 intentos por minuto.

## Despliegue

Migración aplicada el 2 de noviembre de 2026 con autorización del propietario. Se inicializó la encuesta de la capacitación existente, aún deshabilitada porque el grupo no ha finalizado. Permisos RPC verificados. Worker publicado con versión 7fa64ff6-4d14-430e-8669-a40e3888105a. El frontend se publica mediante el despliegue automático del repositorio TalentOn. Requiere CAPTURE_HASH_SECRET ya utilizado por Captación.

Validación local: migraciones completas en PostgreSQL aislado (PGlite), integración Worker/RPC, compilación TypeScript y build. No equivale a una prueba con usuarios reales en producción.
