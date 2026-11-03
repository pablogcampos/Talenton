# Auditoría funcional del perfil Formador — preparación del piloto

Fecha: 3 de noviembre de 2026, hora de Lima.
Versión revisada: `58aac8c`.
Dictamen: **no iniciar todavía el piloto integral**. La consulta de grupos y el registro ordinario de asistencia cuentan con cobertura; el recorrido completo capacitación → evaluaciones → OJT → alta presenta bloqueos y riesgos de integridad.

## Alcance y evidencia

- Revisión de navegación y alcance FORMADOR, grupos asignados, participantes, asistencia e historial, desbloqueos, evaluaciones, OJT, resultados, altas y encuestas.
- Consulta directa de producción con transacción **READ ONLY**, sin nombres ni documentos personales en el informe.
- Suite existente del Worker: **160/160 pruebas**, 13 archivos.
- Pruebas de interfaz/lógica de asistencia: **5/5**.
- TypeScript de frontend y Worker: correcto.
- Cuatro reproducciones adicionales sobre PostgreSQL 17 aislado/PGlite y rutas reales del Worker: las cuatro confirmaron los defectos descritos. Las pruebas exploratorias se retiraron después de ejecutarse; no se modificó código funcional.
- No se realizó una sesión manual completa con una cuenta real de formador ni una prueba de carga/concurrencia del piloto. Las conclusiones combinan lectura del código, pruebas automatizadas y configuración real; no equivalen a aceptación de usuario de todas las pantallas.
- No se modificaron registros de producción ni se desplegaron cambios.

## Situación real de producción

| Elemento | Resultado |
|---|---|
| Formadores activos y habilitados | 4 |
| Grupos de capacitación no archivados | 1 |
| Grupo | CAP-2026-2026-932-98 |
| Estado del grupo | PROGRAMADA |
| Formador asignado | Sí |
| Participantes | 3 |
| Estado de los tres participantes | PENDIENTE_INICIO |
| Estado OJT de los tres | NO_INICIADO |
| Evaluaciones configuradas del grupo | **0** |

Esta configuración impide completar el recorrido normal de evaluación e inicio de OJT. La pantalla debe señalar la configuración pendiente; cero evaluaciones no significa cero tareas pendientes.

## Hallazgos prioritarios

### F01 — Alta: el grupo del piloto no está preparado y falta una acción de inicio en el espacio del formador

**Evidencia:** configuración real anterior; `src/views/MisCapacitacionesView.tsx:76`, `src/views/MisCapacitacionesView.tsx:96`; `worker/src/index.ts:537` y `worker/src/index.ts:570`.

El registro de notas depende de `evaluationsConfig`: sin configuración devuelve «La capacitación no tiene evaluaciones configuradas». El inicio de OJT exige participante EN_CAPACITACION. En las pantallas revisadas del formador no aparece una acción que ejecute la transición PENDIENTE_INICIO → EN_CAPACITACION; la función y la ruta existen, pero no están conectadas a ese inicio en la interfaz. Cambiar solamente el estado del grupo no sustituye la transición individual.

**Corrección propuesta:** configurar los módulos y sus notas mínimas con el responsable de Formación; conectar el inicio autorizado de participantes al flujo existente y mostrar claramente los pendientes de configuración. No aprobar ni iniciar automáticamente a los tres participantes reales como parte de una reparación técnica.

**Aceptación:** un usuario autorizado prepara el grupo; el formador puede recorrer el inicio y registrar cada evaluación sin utilizar llamadas manuales a la API.

### F02 — Alta: la API acepta una evaluación inventada y una aprobación incompatible con la nota

**Evidencia:** `worker/src/index.ts:549`; `worker/src/relationalRuntime.ts:273` y `:284`.

Reproducción aislada, con formador asignado: POST de evaluación con identificador no configurado, nota 0, máximo 20, mínimo 16 y resultado APROBADO. **Respuesta 201**. El servidor comprueba rangos básicos pero confía en el resultado y parámetros recibidos; el adaptador crea la definición. Es un defecto de validación del servidor, no una afirmación de que la pantalla normal envíe ese resultado por sí sola.

Además, iniciar OJT comprueba las evaluaciones existentes, sin exigir que estén todas las configuradas.

**Corrección propuesta:** resolver definición y umbral desde la configuración persistida del grupo, rechazar identificadores ajenos, calcular el resultado en servidor y exigir el conjunto obligatorio completo para avanzar.

**Aceptación:** nota 0/20 con mínimo 16 nunca puede aprobar; una evaluación ajena se rechaza; una evaluación pendiente impide avanzar.

### F03 — Alta: se puede aprobar OJT sin haber iniciado capacitación

**Evidencia:** `worker/src/index.ts:565` y rama de resultado; `worker/src/relationalRuntime.ts:292`.

Reproducción aislada: participante PENDIENTE_INICIO, OJT NO_INICIADO y capacitación no aprobada; POST `/ojt/result` con OJT_APROBADO devuelve **201**. La rama de resultado valida el nombre del estado, pero no el estado anterior ni requisitos académicos. Al serializar OJT_APROBADO también se marca la capacitación como aprobada.

El control de empresa y grupo sigue existiendo: este hallazgo afecta las acciones de un formador autorizado sobre su grupo, no demuestra acceso a grupos ajenos.

**Corrección propuesta:** aplicar transiciones válidas también a resultados y métricas OJT; mantener separadas aprobación teórica y aprobación OJT; reutilizar requisitos del servidor.

**Aceptación:** rechazar aprobación desde pendiente/no iniciado y no modificar capacitación aprobada como consecuencia indirecta de registrar un resultado OJT.

### F04 — Alta: se pierden QA y AHT al guardar métricas OJT

**Evidencia:** `src/views/OjtView.tsx:123`; `src/context/TalentContext.tsx:924`; `worker/src/index.ts:576`.

La pantalla recoge calidad (QA) y tiempo de atención (AHT). El contexto no los incluye en el cuerpo enviado y el Worker tampoco los incorpora a la métrica. Reproducción aislada enviándolos directamente a la API: respuesta **201**, pero `qa_score` y `aht_seconds` quedan **NULL**. La tabla relacional sí tiene columnas para ambos.

**Corrección propuesta:** transportar y validar los campos completos de extremo a extremo. Verificar su lectura después de recargar. No rellenar datos históricos perdidos con valores estimados.

**Aceptación:** registrar QA 90 y AHT 240, recargar y comprobar ambos valores en pantalla y base de datos.

### F05 — Media: un desbloqueo vencido sigue apareciendo disponible

**Evidencia:** `worker/src/index.ts:470`; `src/components/training/attendanceTime.ts:13`; `supabase/migrations/202610260001_attendance_window_day.sql:24`.

Reproducción aislada: desbloqueo APROBADA con vencimiento una hora atrás; la consulta de ventana devuelve **UNLOCKED**. La interfaz conserva ese estado. PostgreSQL sí exige vigencia para una marcación fuera de la ventana ordinaria, por lo que la escritura puede fallar aunque la pantalla permita intentar guardar.

**Corrección propuesta:** calcular la vigencia usando decidedAt, expiresAt y hora de servidor; distinguir aprobado/vencido; permitir solicitar otro desbloqueo cuando corresponda.

**Aceptación:** al vencer, desaparece la edición autorizada y la interfaz coincide con la decisión de la base.

### F06 — Media: OJT registra el día siguiente desde las 19:00 de Perú

**Evidencia:** `src/views/OjtView.tsx:125`.

El formulario general de OJT usa `new Date().toISOString().split('T')[0]`, que es fecha UTC. Ejemplo verificado: **3/11/2026 a las 20:00 de Lima → envía 4/11/2026**. El espacio «Mis capacitaciones» usa fecha Lima, de modo que ambas pantallas pueden registrar días distintos en la misma sesión.

**Corrección propuesta:** usar una única función America/Lima para fechas operativas, conservando UTC para instantes de auditoría.

**Aceptación:** entre 19:00 y 21:30, ambas pantallas guardan la fecha peruana correcta.

### F07 — Media: el número de día de asistencia se reinicia incorrectamente

**Evidencia:** `src/views/MisCapacitacionesView.tsx:21` y `:73`; `worker/src/relationalRuntime.ts:293`.

El cálculo excluye sábados y domingos y limita el listado a 12 días. Una fecha que no aparece acaba con dayNumber=1. Reproducción del cálculo: sábado 31/10/2026 y viernes 13/11/2026, en un curso iniciado 26/10 y terminado 20/11, dan ambos **día 1**. La fecha de asistencia se mantiene, pero la numeración enviada es errónea.

**Corrección propuesta:** calcular desde el cronograma real, sin límite artificial y contemplando sábados cuando el curso los incluye.

**Aceptación:** un curso de más de 12 sesiones y uno de lunes a sábado conservan secuencia correcta.

### F08 — Media: «Apto para alta» tiene significados y validaciones distintos entre pantallas

**Evidencia:** `src/views/MisCapacitacionesView.tsx:111`; `src/views/OjtView.tsx:159`; `src/context/TalentContext.tsx:913`; `worker/src/index.ts:705`.

«Resultado final» habilita el pase con promedio y OJT, pero el servidor de alta exige además documentación y cuenta sueldo. En el módulo OJT, «Aprobar Apto para Alta» llama al resultado OJT_APROBADO, no al pase efectivo a Gestión de Talento. Puede dar sensación de finalización sin haber realizado el mismo proceso.

**Corrección propuesta:** separar claramente «Aprobar OJT» y «Enviar a Gestión de Talento»; usar la elegibilidad calculada por servidor para mostrar requisitos pendientes y habilitar la segunda acción. Mantener los requisitos actuales hasta una decisión de negocio explícita.

**Aceptación:** ambos puntos de entrada muestran el mismo estado y pendientes; ningún botón promete una transición diferente de la que guarda.

## Controles que sí tienen respaldo en la revisión

- Restricción del formador al módulo Formación y a grupos asignados en navegación, bootstrap y rutas de gestión; la suite cubre rechazo entre empresas. Falta ampliar la matriz de pruebas con un segundo formador de la misma empresa.
- Existencia/membresía del participante comprobada antes de operaciones sobre el grupo.
- Horario ordinario de marcación 09:00–21:30 de Lima, con protección en base de datos y pruebas de límites.
- Historial de asistencia y presentación de fechas anteriores en modo de consulta; cinco pruebas de la implementación actual.
- Registro atómico de asistencia masiva ante un participante inexistente.
- Validación de documentos y cuenta sueldo antes del pase efectivo a Gestión de Talento.
- Deserción con motivo y trazabilidad, ruta de habilidades y feedback con control de acceso: revisadas estáticamente; no se realizó aceptación manual completa de sus formularios.
- Encuesta habilitada por FINALIZADA, restricciones por empresa, prevención de respuesta duplicada y exportación restringida a gestores, cubiertas por integración. No se cambió esta regla.

## Secuencia recomendada antes del piloto

1. Corregir F02/F03 para proteger decisiones; F04 para evitar pérdida de información.
2. Completar F01 mediante configuración real autorizada y acciones de inicio existentes.
3. Corregir F05–F08 y convertir las reproducciones en pruebas permanentes que exijan el comportamiento correcto.
4. Ejecutar un ensayo completo con datos de prueba: dos formadores de la misma empresa y uno de otra; grupo ajeno rechazado; inicio; asistencia e historial; desbloqueo y vencimiento; todas las notas; OJT; persistencia de métricas; alta; finalización y encuesta.
5. Comprobar horarios 08:59, 09:00, 19:00, 21:30 y 21:31 de Lima; reconexión, recarga, doble envío y error de red sin perder datos.
6. Liberar el piloto integral cuando el recorrido pueda terminar desde la interfaz y todas las verificaciones anteriores pasen.

La auditoría no determina que los datos históricos hayan sido corregidos ni que todos los defectos se hayan presentado en producción. Distingue configuración real, defectos reproducidos y hallazgos por revisión estática.
