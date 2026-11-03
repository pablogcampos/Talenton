begin;
alter table talent.training_groups drop constraint training_groups_status_check;
alter table talent.training_groups add constraint training_groups_status_check
 check(status in ('PENDIENTE_ASIGNACION','PROGRAMADA','EN_CAPACITACION','PENDIENTE_OJT','EN_OJT','EXTENSION_OJT','FINALIZADA','CANCELADA'));
commit;
