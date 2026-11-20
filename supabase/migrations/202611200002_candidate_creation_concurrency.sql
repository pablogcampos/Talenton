begin;
-- Only new candidate registration uses a fresh tenant revision under the existing transaction lock.
-- Updates retain snapshot/row conflict checks. Nothing is overwritten to resolve contention.
create function public.talent_candidate_create_commit(p_actor uuid,p_company text,p_rows jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,talent as $$
declare actor talent.profiles;person jsonb;app jsonb;cmp talent.campaigns;rev bigint;item jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('runtime:'||p_company,0));
 actor:=talent_private.actor_profile(p_actor,p_company);
 if actor.role not in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR') or not exists(select 1 from talent.user_modules where company_id=p_company and user_id=actor.id and module='SELECCION' and archived_at is null) then raise insufficient_privilege;end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 2 and 10 then raise exception 'TALENT_INVALID_BATCH';end if;
 if (select count(*) from jsonb_array_elements(p_rows) x where x->>'table'='persons')<>1 or (select count(*) from jsonb_array_elements(p_rows) x where x->>'table'='applications')<>1 then raise exception 'TALENT_INVALID_BATCH';end if;
 select x->'row' into person from jsonb_array_elements(p_rows)x where x->>'table'='persons';
 select x->'row' into app from jsonb_array_elements(p_rows)x where x->>'table'='applications';
 if coalesce(person->>'id','')<> 'CAN-'||coalesce(person->>'document_number','') or coalesce(person->>'document_number','')='' or app->>'person_id' is distinct from person->>'id' or person->>'current_application_id' is distinct from app->>'id' or app->>'status' is distinct from 'ACTIVA' or app->>'stage' is distinct from 'NUEVO' then raise exception 'TALENT_INVALID_ROW';end if;
 if exists(select 1 from talent.persons where company_id=p_company and (id=person->>'id' or document_number=person->>'document_number')) then raise exception 'DUPLICATE_CANDIDATE';end if;
 select * into cmp from talent.campaigns where company_id=p_company and id=app->>'campaign_id' and archived_at is null for share;
 if cmp.id is null then raise exception 'RELATED_RECORD_INVALID';end if;
 if actor.role not in ('ADMIN','JEFE_SELECCION') and not coalesce((
  actor.role='ANALISTA_SELECCION' and cmp.assigned_analyst_id=actor.id
  or exists(select 1 from talent.campaign_assignments a where a.company_id=p_company and a.campaign_id=cmp.id and a.user_id=actor.id and a.archived_at is null and (actor.role='RECLUTADOR' or a.assignment_kind='SCOPE'))
  or talent_private.org_campaign_access(p_actor,p_company,cmp.company_campaign_id)
 ),false) then raise insufficient_privilege;end if;
 if actor.role='RECLUTADOR' and app->>'recruiter_id' is distinct from actor.id then raise insufficient_privilege;end if;
 if app->>'recruiter_id' is distinct from actor.id and not exists(select 1 from talent.profiles p join talent.user_modules m on m.company_id=p.company_id and m.user_id=p.id and m.module='SELECCION' and m.archived_at is null where p.company_id=p_company and p.id=app->>'recruiter_id' and p.role='RECLUTADOR' and p.enabled and p.status='ACTIVO' and p.archived_at is null) then raise exception 'RECRUITER_NOT_AVAILABLE';end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  if item->>'table' not in ('persons','applications','contract_events') or item->>'expected' is not null or item->'row'->>'company_id' is distinct from p_company then raise exception 'TALENT_INVALID_ROW';end if;
  if item->>'table'='contract_events' and (item->'row'->>'application_id' is distinct from app->>'id' or item->'row'->>'actor_id' is distinct from p_actor::text) then raise exception 'TALENT_INVALID_ROW';end if;
 end loop;
 select coalesce(revision,0) into rev from talent.tenant_revisions where company_id=p_company for update;
 perform public.talent_runtime_commit(p_actor,null,p_company,coalesce(rev,0),p_rows,array[]::text[]);
end $$;
revoke all on function public.talent_candidate_create_commit(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.talent_candidate_create_commit(uuid,text,jsonb) to service_role;
commit;
