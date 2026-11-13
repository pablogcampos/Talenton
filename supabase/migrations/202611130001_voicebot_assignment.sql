begin;
create function public.talent_voicebot_has_role(p_actor uuid,p_roles text[]) returns boolean
language sql stable security definer set search_path=pg_catalog,public,talent,talent_org as $$
 select public.talent_voicebot_allowed(p_actor) and (
 ('ADMIN'=any(p_roles) and talent_private.org_global_admin(p_actor))
 or exists(select 1 from talent_org.user_companies m join talent.companies c on c.id=m.company_id
 where m.auth_user_id=p_actor and m.enabled and m.archived_at is null and c.status='ACTIVA' and c.archived_at is null and m.role=any(p_roles))
 or exists(select 1 from talent.profiles p where p.auth_user_id=p_actor and not p.is_context and p.role=any(p_roles)
 and not exists(select 1 from talent.companies c where c.id=p.company_id and c.catalog_managed)
 and not coalesce((p.annotations->>'companyAccessManaged')::boolean,false)
 and exists(select 1 from talent.user_modules m where m.company_id=p.company_id and m.user_id=p.id and m.module='SELECCION' and m.archived_at is null)));
$$;
create function public.talent_voicebot_assignees(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,talent as $$
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 if not public.talent_voicebot_has_role(p_actor,array['ADMIN','ANALISTA_SELECCION']) then return '{"canAssign":false,"items":[]}'::jsonb; end if;
 return jsonb_build_object('canAssign',true,'items',coalesce((select jsonb_agg(jsonb_build_object('id',p.auth_user_id,'name',p.display_name) order by p.display_name)
 from talent.profiles p where not p.is_context and public.talent_voicebot_has_role(p.auth_user_id,array['RECLUTADOR'])),'[]'::jsonb));
end $$;
create function public.talent_voicebot_assign(p_actor uuid,p_id uuid,p_version bigint,p_recruiter uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare lead public.voicebot_leads; old_owner text; old_status text; new_name text;
begin
 if not public.talent_voicebot_has_role(p_actor,array['ADMIN','ANALISTA_SELECCION']) then raise insufficient_privilege; end if;
 if not public.talent_voicebot_has_role(p_recruiter,array['RECLUTADOR']) then raise exception 'VOICEBOT_INVALID_RECRUITER'; end if;
 select * into lead from public.voicebot_leads where id=p_id for update;
 if not found then raise exception 'VOICEBOT_NOT_FOUND'; end if;
 if lead.version is distinct from p_version then raise sqlstate 'PT409' using message='VOICEBOT_CHANGED'; end if;
 if lead.candidate_id is not null then raise exception 'VOICEBOT_ALREADY_CONVERTED'; end if;
 if lead.owner_auth_id=p_recruiter then return public.talent_voicebot_timeline(lead); end if;
 old_owner:=coalesce(lead.owner_name,'Sin asignar');old_status:=lead.status;
 select display_name into new_name from talent.profiles where auth_user_id=p_recruiter and not is_context;
 update public.voicebot_leads set owner_auth_id=p_recruiter,owner_name=new_name,
 status=case when status='NUEVO' then 'EN_GESTION' else status end,version=version+1,updated_at=clock_timestamp()
 where id=p_id returning * into lead;
 insert into public.voicebot_lead_history(lead_id,actor_auth_id,action,previous_status,new_status,notes)
 values(p_id,p_actor,'ASSIGN',old_status,lead.status,'Responsable: '||old_owner||' → '||new_name);
 return public.talent_voicebot_timeline(lead);
end $$;
revoke all on function public.talent_voicebot_has_role(uuid,text[]),public.talent_voicebot_assignees(uuid),public.talent_voicebot_assign(uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.talent_voicebot_assignees(uuid),public.talent_voicebot_assign(uuid,uuid,bigint,uuid) to service_role;
create or replace function public.talent_voicebot_dashboard(p_actor uuid,p_from date default null,p_to date default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 if p_from is not null and p_to is not null and p_from>p_to then raise exception 'VOICEBOT_INVALID'; end if;
 with base as (
 select l.*,h.taken_at,h.managed_at,
 extract(epoch from (h.taken_at-l.received_at)) wait_seconds,
 extract(epoch from (h.managed_at-l.received_at)) management_seconds,
 extract(epoch from (now()-l.received_at)) pending_seconds
 from public.voicebot_leads l left join lateral (
 select min(created_at) filter(where action in ('TAKE','ASSIGN')) taken_at,min(created_at) filter(where action='UPDATE') managed_at
 from public.voicebot_lead_history where lead_id=l.id) h on true
 where (p_from is null or l.received_at>=p_from::timestamp at time zone 'America/Lima')
 and (p_to is null or l.received_at<(p_to+1)::timestamp at time zone 'America/Lima')
 ), summary as (
 select count(*) total,count(*) filter(where status='NUEVO') unassigned,
 count(*) filter(where status='EN_GESTION') in_progress,
 count(*) filter(where outcome='ACEPTA_PROPUESTA') accepted,
 count(*) filter(where outcome='NO_APTO') not_suitable,
 count(*) filter(where outcome='NO_ACEPTA_PROPUESTA') declined,
 count(*) filter(where status='NO_CONTACTADO') not_contacted,
 count(*) filter(where status='REPROGRAMADO') rescheduled,
 count(*) filter(where status='REPROGRAMADO' and callback_at<=now()) callbacks_overdue,
 count(*) filter(where candidate_id is not null) converted,
 count(*) filter(where wait_seconds>=0) assigned_measured,
 count(*) filter(where wait_seconds between 0 and 600) within_sla,
 count(*) filter(where wait_seconds>600) late_assigned,
 count(*) filter(where owner_auth_id is null and pending_seconds>600) pending_over_sla,
 avg(wait_seconds) filter(where wait_seconds>=0) avg_assignment_seconds,
 avg(management_seconds) filter(where management_seconds>=0) avg_management_seconds,
 avg(pending_seconds) filter(where owner_auth_id is null and pending_seconds>=0) avg_pending_seconds,
 max(pending_seconds) filter(where owner_auth_id is null and pending_seconds>=0) longest_pending_seconds
 from base
 ), recruiters as (
 select owner_auth_id,coalesce(max(owner_name),'Sin asignar') name,count(*) total,
 count(*) filter(where outcome='ACEPTA_PROPUESTA') accepted,
 count(*) filter(where outcome='NO_APTO') not_suitable,
 count(*) filter(where wait_seconds>=0) measured,
 count(*) filter(where wait_seconds between 0 and 600) within_sla,
 avg(wait_seconds) filter(where wait_seconds>=0) avg_assignment_seconds
 from base where owner_auth_id is not null group by owner_auth_id
 ) select jsonb_build_object('summary',(select to_jsonb(s) from summary s),'recruiters',coalesce((select jsonb_agg(to_jsonb(r) order by total desc,name) from recruiters r),'[]'::jsonb),'generatedAt',now(),'slaMinutes',10) into result;
 return result;
end $$;
revoke all on function public.talent_voicebot_dashboard(uuid,date,date) from public,anon,authenticated;
grant execute on function public.talent_voicebot_dashboard(uuid,date,date) to service_role;

commit;
