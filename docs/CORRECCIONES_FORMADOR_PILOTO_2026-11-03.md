# Correcciones del perfil Formador

Seguimiento de AUDITORIA_FORMADOR_PILOTO_2026-11-03.md.

## Cambios implementados

- F01: control para que los responsables configuren módulos y notas mínimas; aviso explícito cuando faltan evaluaciones; inicio individual del participante desde Resumen, habilitado después de iniciar el grupo.
- F02: definición y escala de evaluación tomadas del grupo; resultado calculado en servidor; rechazo de identificadores ajenos y de snapshots enviados por el cliente; OJT exige todas las evaluaciones aprobadas.
- F03: métricas y resultados requieren OJT iniciado; iniciar OJT exige capacitación en curso y evaluaciones completas. Aprobar OJT ya no establece por sí solo la aprobación teórica.
- F04: QA, AHT y métricas adicionales se transportan, validan y persisten.
- F05: vencimiento verificado con hora de servidor y actualizado en pantalla. Solicitud/renovación y decisión usan RPC autorizados. La renovación conserva trazabilidad y no permite que el formador apruebe su propia solicitud.
- F06: registro diario de OJT usa America/Lima, incluso después de las 19:00.
- F07: número de día calculado desde el inicio sin recorte a doce días ni exclusión automática de sábados. Es numeración de días calendario; no se inventa un cronograma de sesiones a partir de un horario de texto libre.
- F08: «Aprobar OJT» separado de «Enviar a Gestión de Talento». Ambas pantallas utilizan el mismo panel y los requisitos consultados al servidor para el envío.

## Validación

- Worker: 166 pruebas aprobadas en 14 archivos.
- Componentes de asistencia y preparación: 9 pruebas aprobadas.
- TypeScript frontend y Worker: aprobado.
- Build de producción: aprobado.
- Migración ejecutada en PostgreSQL aislado durante la integración. Incluye controles de acceso, solicitud duplicada, renovación vencida y aprobación.
- Sin ensayo manual integral con una cuenta real y sin cambios de datos en producción.

## Despliegue pendiente

1. Aplicar supabase/migrations/202611030001_training_unlock_renewal.sql.
2. Desplegar Worker.
3. Publicar frontend.
4. Responsable de Formación: configurar las evaluaciones y notas mínimas del grupo real, iniciar el grupo y confirmar el inicio de sus participantes.
5. Realizar el ensayo completo del piloto.

No se iniciaron ni aprobaron participantes reales automáticamente. No se rellenaron métricas históricas perdidas con valores estimados. Esta entrega queda preparada localmente; no se ha migrado ni publicado.
