begin;
create function public.talent_training_admin_action(p_actor uuid,p_company text,p_group text,p_action text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a talent.profiles;g talent.training_groups;event jsonb;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 if a.role<>'ADMIN' then raise insufficient_privilege;end if;
 if p_action not in ('ARCHIVE','DELETE') or p_action is null then raise exception 'TRAINING_ADMIN_INVALID';end if;
 perform 1 from talent.tenant_revisions where company_id=p_company for update;
 select * into g from talent.training_groups where company_id=p_company and id=p_group and archived_at is null for update;
 if not found then raise exception 'TRAINING_ADMIN_NOT_FOUND';end if;
 if p_action='DELETE' then
  if g.status not in ('PENDIENTE_ASIGNACION','PROGRAMADA')
   or exists(select 1 from talent.participants where company_id=p_company and group_id=p_group and status<>'PENDIENTE_INICIO')
   or exists(select 1 from talent.attendance where company_id=p_company and group_id=p_group)
   or exists(select 1 from talent.evaluations where company_id=p_company and participant_id in(select id from talent.participants where company_id=p_company and group_id=p_group))
   or exists(select 1 from talent_offers.documents where company_id=p_company and group_id=p_group and signed_at is not null)
  then raise exception 'TRAINING_DELETE_HAS_ACTIVITY';end if;
  update talent.persons set current_process='SELECCION',current_stage='APTO_CAPACITACION'
  where company_id=p_company and current_application_id in(select application_id from talent.participants where company_id=p_company and group_id=p_group and archived_at is null);
  update talent.participants set archived_at=now() where company_id=p_company and group_id=p_group and archived_at is null;
  update talent_offers.documents set revoked_at=now() where company_id=p_company and group_id=p_group and signed_at is null and revoked_at is null;
 end if;
 event:=jsonb_build_object('id',gen_random_uuid()::text,'action',case when p_action='DELETE' then 'ELIMINACION_CAPACITACION' else 'ARCHIVO_CAPACITACION' end,
 'at',now(),'by',a.id,'byName',a.display_name,'notes',case when p_action='DELETE' then 'Eliminación lógica; postulantes liberados y trazabilidad conservada.' else 'Capacitación archivada con historial conservado.' end);
 insert into talent.contract_events(company_id,id,group_id,stream,actor_id,occurred_at,action,description,event_metadata)
 values(p_company,event->>'id',p_group,'group',a.id,now(),event->>'action',event->>'notes',event);
 update talent.training_groups set archived_at=now(),annotations=annotations||jsonb_build_object('adminDisposition',p_action,'adminDispositionAt',now(),'adminDispositionBy',a.id) where company_id=p_company and id=p_group;
 return jsonb_build_object('ok',true,'action',p_action);
end $$;
revoke all on function public.talent_training_admin_action(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.talent_training_admin_action(uuid,text,text,text) to service_role;
-- Previously issued individual URLs must also respect archived groups.
alter function public.talent_offer_public(text,jsonb,text) rename to talent_offer_public_before_archive;
revoke all on function public.talent_offer_public_before_archive(text,jsonb,text) from public,anon,authenticated,service_role;
create function public.talent_offer_public(p_token text,p_data jsonb default null,p_evidence text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from talent_offers.documents d join talent.training_groups g on g.company_id=d.company_id and g.id=d.group_id where d.token=p_token and g.archived_at is null for update of g;
 if not found then raise exception 'OFFER_NOT_FOUND';end if;
 return public.talent_offer_public_before_archive(p_token,p_data,p_evidence);
end $$;
revoke all on function public.talent_offer_public(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.talent_offer_public(text,jsonb,text) to service_role;
commit;
