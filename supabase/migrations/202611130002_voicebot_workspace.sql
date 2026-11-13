begin;
create table public.voicebot_settings (
 id boolean primary key default true check(id),
 contact_minutes integer not null default 10 check(contact_minutes between 1 and 1440),
 warning_minutes integer not null default 8 check(warning_minutes between 1 and contact_minutes),
 version bigint not null default 1, updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
insert into public.voicebot_settings(id) values(true);
alter table public.voicebot_settings enable row level security;
revoke all on public.voicebot_settings from public,anon,authenticated;
create function public.talent_voicebot_settings(p_actor uuid,p_minutes integer,p_warning integer,p_version bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result public.voicebot_settings;
begin
 if not public.talent_voicebot_has_role(p_actor,array['ADMIN']) then raise insufficient_privilege; end if;
 if p_minutes is null or p_warning is null or p_minutes not between 1 and 1440 or p_warning not between 1 and p_minutes then raise exception 'VOICEBOT_INVALID'; end if;
 update public.voicebot_settings set contact_minutes=p_minutes,warning_minutes=p_warning,version=version+1,updated_at=clock_timestamp(),updated_by=p_actor where id and version=p_version returning * into result;
 if not found then raise sqlstate 'PT409' using message='VOICEBOT_CHANGED'; end if;
 return to_jsonb(result);
end $$;
-- New outcome only; existing ingestion fields and stored states are retained.
alter table public.voicebot_leads drop constraint voicebot_disposition_check;
alter table public.voicebot_leads add constraint voicebot_disposition_check check(
 (status in ('NUEVO','EN_GESTION','DESCARTADO') and outcome is null and callback_at is null)
 or (status='CONTACTADO' and outcome is not null and outcome in ('ACEPTA_PROPUESTA','NO_ACEPTA_PROPUESTA','NO_APTO') and callback_at is null)
 or (status='NO_CONTACTADO' and outcome is not null and outcome in ('NO_RESPONDE','CORTA_LLAMADA','NUMERO_INCORRECTO') and callback_at is null)
 or (status='REPROGRAMADO' and outcome is null and callback_at is not null and isfinite(callback_at))
) not valid;
create function public.talent_voicebot_attempt(p_actor uuid,p_id uuid,p_version bigint,p_action text,p_status text,p_outcome text,p_notes text,p_callback_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare lead public.voicebot_leads; before_row public.voicebot_leads;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 select * into lead from public.voicebot_leads where id=p_id for update;
 if not found then raise exception 'VOICEBOT_NOT_FOUND'; end if;
 if lead.owner_auth_id is null or (lead.owner_auth_id<>p_actor and not public.talent_voicebot_has_role(p_actor,array['ADMIN'])) then raise insufficient_privilege; end if;
 if lead.candidate_id is not null then raise exception 'VOICEBOT_ALREADY_CONVERTED'; end if;
 if lead.version is distinct from p_version then raise sqlstate 'PT409' using message='VOICEBOT_CHANGED'; end if;
 if p_action is null or p_action not in ('ATTEMPT','SCHEDULE','DISCARD') or p_notes is null or length(p_notes)>10000 then raise exception 'VOICEBOT_INVALID'; end if;
 if p_action in ('SCHEDULE','DISCARD') and length(btrim(p_notes))<3 then raise exception 'VOICEBOT_NOTES_REQUIRED'; end if;
 before_row:=lead;
 if p_action='SCHEDULE' then p_status:='REPROGRAMADO';p_outcome:=null; end if;
 if p_action='DISCARD' then
  if p_outcome is null or p_outcome not in ('NO_ACEPTA_PROPUESTA','NO_APTO') then raise exception 'VOICEBOT_OUTCOME_REQUIRED'; end if;
  p_status:='CONTACTADO';p_callback_at:=null;
 end if;
 if p_status is null or p_status not in ('CONTACTADO','NO_CONTACTADO','REPROGRAMADO') then raise exception 'VOICEBOT_INVALID'; end if;
 if p_status='CONTACTADO' and (p_outcome is null or p_outcome not in ('ACEPTA_PROPUESTA','NO_ACEPTA_PROPUESTA','NO_APTO'))
 or p_status='NO_CONTACTADO' and (p_outcome is null or p_outcome not in ('NO_RESPONDE','CORTA_LLAMADA','NUMERO_INCORRECTO'))
 or p_status='REPROGRAMADO' and p_outcome is not null
 or p_status<>'REPROGRAMADO' and p_callback_at is not null then raise exception 'VOICEBOT_OUTCOME_REQUIRED'; end if;
 if p_status='REPROGRAMADO' and (p_callback_at is null or not isfinite(p_callback_at) or p_callback_at<=clock_timestamp()) then raise exception 'VOICEBOT_CALLBACK_REQUIRED'; end if;
 update public.voicebot_leads set status=p_status,outcome=p_outcome,management_notes=p_notes,callback_at=p_callback_at,
 management_locked_at=coalesce(management_locked_at,clock_timestamp()),version=version+1,updated_at=clock_timestamp()
 where id=p_id returning * into lead;
 insert into public.voicebot_lead_history(lead_id,actor_auth_id,action,previous_status,new_status,notes,outcome,callback_at,previous_outcome,previous_callback_at)
 values(p_id,p_actor,p_action,before_row.status,lead.status,p_notes,p_outcome,p_callback_at,before_row.outcome,before_row.callback_at);
 return public.talent_voicebot_timeline(lead);
end $$;
create function public.talent_voicebot_workspace(p_actor uuid,p_filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; config public.voicebot_settings; can_assign boolean; f_tab text:=coalesce(p_filters->>'tab','all');
 f_contact text:=coalesce(p_filters->>'contact','');
 f_search text:=coalesce(p_filters->>'search','');f_state text:=coalesce(p_filters->>'state','');f_campaign text:=coalesce(p_filters->>'campaign','');
 f_owner uuid:=nullif(p_filters->>'owner','')::uuid;f_from date:=nullif(p_filters->>'from','')::date;f_to date:=nullif(p_filters->>'to','')::date;
 f_page integer:=coalesce((p_filters->>'page')::integer,0);f_sort text:=coalesce(p_filters->>'sort','urgency');today date:=(now() at time zone 'America/Lima')::date;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 can_assign:=public.talent_voicebot_has_role(p_actor,array['ADMIN','ANALISTA_SELECCION']);
 if f_owner is not null and f_owner<>p_actor and not can_assign then raise insufficient_privilege; end if;
 if f_page<0 or f_page>100000 or length(f_search)>200 or length(f_campaign)>200 or f_from>f_to
 or f_tab not in ('mine','unassigned','followups','all') or f_sort not in ('urgency','newest','oldest')
 or f_contact not in ('','CONTACTADO','NO_CONTACTADO','REPROGRAMADO')
 or f_state not in ('','NUEVO','EN_GESTION','SEGUIMIENTO','CONVERTIDO','DESCARTADO') then raise exception 'VOICEBOT_INVALID'; end if;
 select * into config from public.voicebot_settings where id;
 with base as materialized (
 select l, l.id,l.received_at,l.owner_auth_id,l.callback_at,l.converted_at,
 case when l.candidate_id is not null then 'CONVERTIDO' when l.status='DESCARTADO' or l.outcome in ('NO_ACEPTA_PROPUESTA','NO_APTO') then 'DESCARTADO'
 when l.status='REPROGRAMADO' then 'SEGUIMIENTO' when l.status='NUEVO' then 'NUEVO' else 'EN_GESTION' end op_state,
 h.first_contact_at,h.last_management_at
 from public.voicebot_leads l left join lateral (
 select min(created_at) filter(where action in ('UPDATE','ATTEMPT')) first_contact_at,
 max(created_at) filter(where action in ('UPDATE','ATTEMPT','SCHEDULE','DISCARD')) last_management_at
 from public.voicebot_lead_history where lead_id=l.id) h on true
 where (f_search='' or l.full_name ilike '%'||f_search||'%' or l.phone ilike '%'||f_search||'%' or l.external_id ilike '%'||f_search||'%'
 or coalesce(l.payload->>'dni',l.payload->>'DNI',l.payload->>'document_number','') ilike '%'||f_search||'%')
 and (f_contact='' or l.status=f_contact) and (f_campaign='' or l.campaign_name=f_campaign) and (f_owner is null or l.owner_auth_id=f_owner)
 and (f_from is null or l.received_at>=f_from::timestamp at time zone 'America/Lima')
 and (f_to is null or l.received_at<(f_to+1)::timestamp at time zone 'America/Lima')
 ), filtered as materialized(select * from base where f_state='' or op_state=f_state),
 scoped as materialized(select * from filtered where f_tab='all' or f_tab='mine' and owner_auth_id=p_actor
 or f_tab='unassigned' and owner_auth_id is null or f_tab='followups' and op_state='SEGUIMIENTO'),
 page_rows as (
 select * from scoped order by
 case when f_sort='urgency' then case when op_state='SEGUIMIENTO' and callback_at<=now() then 0
 when first_contact_at is null and op_state not in ('CONVERTIDO','DESCARTADO') and received_at+config.contact_minutes*interval '1 minute'<now() then 1
 when op_state not in ('CONVERTIDO','DESCARTADO') then 2 else 3 end end,
 case when f_sort='urgency' then coalesce(callback_at,received_at) end asc,
 case when f_sort='newest' then received_at end desc,
 case when f_sort='oldest' then received_at end asc,id
 limit 50 offset f_page*50)
 select jsonb_build_object(
 'items',coalesce((select jsonb_agg(public.talent_voicebot_timeline(p.l)||jsonb_build_object('op_state',p.op_state,'first_contact_at',p.first_contact_at,'last_management_at',p.last_management_at)) from page_rows p),'[]'::jsonb),
 'total',(select count(*) from scoped),
 'counts',jsonb_build_object('all',(select count(*) from filtered),'mine',(select count(*) from filtered where owner_auth_id=p_actor),
 'unassigned',(select count(*) from filtered where owner_auth_id is null),'followups',(select count(*) from filtered where op_state='SEGUIMIENTO')),
 'metrics',jsonb_build_object('total',(select count(*) from scoped),
 'minePending',(select count(*) from scoped where owner_auth_id=p_actor and op_state not in ('CONVERTIDO','DESCARTADO')),
 'overSla',(select count(*) from scoped where first_contact_at is null and op_state not in ('CONVERTIDO','DESCARTADO') and received_at+config.contact_minutes*interval '1 minute'<now()),
 'convertedToday',(select count(*) from scoped where converted_at>=today::timestamp at time zone 'America/Lima' and converted_at<(today+1)::timestamp at time zone 'America/Lima'),
 'callbacksOverdue',(select count(*) from scoped where op_state='SEGUIMIENTO' and callback_at<=now())),
 'config',to_jsonb(config)-'updated_by','canAssign',can_assign,'canConfigure',public.talent_voicebot_has_role(p_actor,array['ADMIN']),
 'campaigns',coalesce((select jsonb_agg(campaign_name order by campaign_name) from (select distinct campaign_name from public.voicebot_leads where campaign_name<>'') c),'[]'::jsonb),
 'recruiters',case when can_assign then coalesce((select jsonb_agg(jsonb_build_object('id',owner_auth_id,'name',name) order by name) from (select owner_auth_id,max(owner_name) name from public.voicebot_leads where owner_auth_id is not null group by owner_auth_id) r),'[]'::jsonb) else '[]'::jsonb end,
 'serverTime',clock_timestamp()) into result;
 return result;
end $$;
revoke all on function public.talent_voicebot_settings(uuid,integer,integer,bigint),public.talent_voicebot_attempt(uuid,uuid,bigint,text,text,text,text,timestamptz),public.talent_voicebot_workspace(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.talent_voicebot_settings(uuid,integer,integer,bigint),public.talent_voicebot_attempt(uuid,uuid,bigint,text,text,text,text,timestamptz),public.talent_voicebot_workspace(uuid,jsonb) to service_role;

create function public.talent_voicebot_phone_key(p_phone text) returns text language sql immutable set search_path=pg_catalog as $$
 select case when length(n)=11 and left(n,2)='51' then right(n,9) when length(n)=13 and left(n,4)='0051' then right(n,9) else n end from (select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') n) x
$$;
revoke all on function public.talent_voicebot_phone_key(text) from public,anon,authenticated;
create or replace function talent_private.voicebot_candidate_conversion() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare lead public.voicebot_leads; actor uuid; lead_id uuid;
begin
 if nullif(new.annotations->>'voicebotLeadId','') is null then return new; end if;
 if tg_op='UPDATE' and new.annotations->>'voicebotLeadId' is not distinct from old.annotations->>'voicebotLeadId' then return new; end if;
 lead_id:=(new.annotations->>'voicebotLeadId')::uuid;
 select auth_user_id into actor from talent.profiles where company_id=new.company_id and id=nullif(current_setting('talent.actor_id',true),'');
 select * into lead from public.voicebot_leads where id=lead_id for update;
 if not found or actor is null or not public.talent_voicebot_allowed(actor) or lead.owner_auth_id is distinct from actor then raise exception 'VOICEBOT_CONVERSION_FORBIDDEN'; end if;
 if lead.candidate_id is not null then
  if lead.candidate_id=new.id and lead.candidate_company_id=new.company_id and exists(select 1 from talent.persons p where p.company_id=new.company_id and p.id=new.id and p.annotations->>'voicebotLeadId'=lead.id::text) then return new; end if;
  raise exception 'VOICEBOT_ALREADY_CONVERTED';
 end if;
 if lead.status<>'CONTACTADO' or lead.outcome is distinct from 'ACEPTA_PROPUESTA' then raise exception 'VOICEBOT_CONVERSION_NOT_READY'; end if;
 perform pg_advisory_xact_lock(hashtextextended('voicebot-conversion:'||new.company_id||':'||public.talent_voicebot_phone_key(new.phone),0));
 if exists(select 1 from talent.persons p where p.company_id=new.company_id and p.id<>new.id and public.talent_voicebot_phone_key(p.phone)=public.talent_voicebot_phone_key(new.phone) and public.talent_voicebot_phone_key(new.phone)<>'') then raise exception 'VOICEBOT_DUPLICATE_CANDIDATE'; end if;
 new.annotations:=new.annotations||jsonb_build_object('voicebotOriginal',to_jsonb(lead));
 update public.voicebot_leads set candidate_id=new.id,candidate_company_id=new.company_id,converted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=lead.id;
 insert into public.voicebot_lead_history(lead_id,actor_auth_id,action,previous_status,new_status,notes,outcome)
 values(lead.id,actor,'CONVERT',lead.status,lead.status,'Convertido a candidato',lead.outcome);
 return new;
end $$;

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
 select min(created_at) filter(where action in ('TAKE','ASSIGN')) taken_at,min(created_at) filter(where action in ('UPDATE','ATTEMPT')) managed_at
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
