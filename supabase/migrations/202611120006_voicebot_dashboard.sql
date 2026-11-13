begin;
create function public.talent_voicebot_dashboard(p_actor uuid,p_from date default null,p_to date default null) returns jsonb
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
 select min(created_at) filter(where action='TAKE') taken_at,min(created_at) filter(where action='UPDATE') managed_at
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
