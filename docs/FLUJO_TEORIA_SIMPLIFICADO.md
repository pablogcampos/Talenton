# Capacitación: inicio grupal y nota final

Cambio solicitado el 3 de noviembre de 2026.

- El formador asignado puede iniciar los participantes pendientes del grupo con una sola acción. No se requiere configurar evaluaciones.
- Los reprogramados, retirados y participantes de otras etapas no se inician automáticamente.
- Se elimina la pestaña Evaluaciones del espacio de capacitaciones del formador y la configuración de módulos del resumen.
- En Resumen, «Finalizar etapa teórica» abre los campos de nota final para todos los participantes en capacitación. Escala: 0 a 20. No se aplica un umbral de aprobación para pasar al estado pendiente solicitado.
- El servidor exige una nota válida por participante activo, sin duplicados ni identificadores ajenos. Guarda el lote en la transacción relacional existente; una petición incompleta no modifica participantes.
- Al cerrar teoría, grupo y participantes activos quedan en PENDIENTE_OJT, mostrado como «Pendiente a OJT».
- Iniciar OJT es una acción posterior. Al iniciar el primer participante, el grupo pasa a EN_OJT. Los demás mantienen su estado pendiente hasta que se inicien.
- Se conserva el historial anterior. Las evaluaciones antiguas no condicionan el nuevo cierre. Los participantes que ya estaban en OJT conservan compatibilidad con su aprobación histórica.
- La nota final y el momento de cierre persisten en el participante, con trazabilidad de quién realizó la acción, y se incluyen en la información del candidato.
- La encuesta mantiene su regla: se habilita cuando la capacitación queda FINALIZADA. Cerrar teoría no finaliza toda la capacitación.

## Validación

Suite Worker: 167 pruebas aprobadas antes de añadir el caso de tres participantes; posteriormente, los 32 casos de integración aprobaron, incluido ese caso adicional.
Interfaz: 10 pruebas aprobadas. TypeScript frontend/backend y build aprobados.
Se verificó el inicio/cierre sin módulos, notas inválidas, nota cero, conservación de registros históricos, rechazo entre empresas, omisiones, duplicados y conservación de reprogramados.

## Publicación

Requiere aplicar primero `supabase/migrations/202611030002_training_theory_stage.sql` para admitir el estado del grupo y después desplegar Worker y frontend.
No se modifican estados de grupos o participantes reales al aplicar esta migración.
Esta entrega está preparada localmente; no publicada.
