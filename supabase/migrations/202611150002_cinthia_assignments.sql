begin;
alter table public.cinthia_invitations alter column lead_id drop not null;
alter table public.cinthia_invitations add column evaluation_version_id uuid references public.cinthia_evaluation_versions(id),
 add column company_id text references talent.companies(id),add column person_id text,add column application_id text,
 add column evaluation_test boolean not null default false,
 add foreign key(company_id,person_id) references talent.persons(company_id,id),
 add foreign key(company_id,application_id) references talent.applications(company_id,id),
 add check(lead_id is not null or person_id is not null or evaluation_test),
 add check(evaluation_version_id is null or company_id is not null);
drop index public.cinthia_one_active_per_lead;
create unique index cinthia_one_active_per_lead on public.cinthia_invitations(lead_id) where evaluation_version_id is null and status in ('PREPARED','PENDING','IN_PROGRESS');
create unique index cinthia_evaluation_active_lead on public.cinthia_invitations(lead_id,evaluation_version_id) where not evaluation_test and status in ('PREPARED','PENDING','IN_PROGRESS');
create unique index cinthia_evaluation_active_person on public.cinthia_invitations(company_id,person_id,evaluation_version_id) where not evaluation_test and status in ('PREPARED','PENDING','IN_PROGRESS');
create index cinthia_person_history on public.cinthia_invitations(company_id,person_id,created_at desc);
alter table public.cinthia_sessions add column evaluation_config jsonb;
create table public.cinthia_results (
 session_id uuid primary key references public.cinthia_sessions(id),state text not null default 'PENDING' check(state in ('PENDING','PROCESSING','COMPLETE','ERROR')),
 result jsonb,error_code text,model text,attempts integer not null default 0,updated_at timestamptz not null default now()
);
create table public.cinthia_human_reviews (
 id uuid primary key default gen_random_uuid(),invitation_id uuid not null references public.cinthia_invitations(id),
 actor_id uuid not null references auth.users(id),notes text not null check(length(notes) between 1 and 8000),scores jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table public.cinthia_results enable row level security;
alter table public.cinthia_human_reviews enable row level security;
revoke all on public.cinthia_results,public.cinthia_human_reviews from public,anon,authenticated;

create function public.talent_cinthia_subject_access(p_actor uuid,p_company text,p_person text default null,p_lead uuid default null) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public,talent as $$
declare a talent.profiles;l public.voicebot_leads;
begin
 if not public.talent_cinthia_evaluation_access(p_actor,p_company) then return false;end if;
 a:=talent_private.actor_profile(p_actor,p_company);
 if p_lead is not null then
  select * into l from public.voicebot_leads where id=p_lead;
  return found and public.talent_voicebot_allowed(p_actor) and (l.owner_auth_id is null or l.owner_auth_id=p_actor or a.role in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION'))
   and (l.candidate_company_id is null or l.candidate_company_id=p_company);
 end if;
 if not exists(select 1 from talent.persons where company_id=p_company and id=p_person and archived_at is null) then return false;end if;
 return a.role='ADMIN' or exists(select 1 from talent.applications app where app.company_id=p_company and app.person_id=p_person and app.archived_at is null
  and talent_offers.allowed(p_actor,p_company,app.campaign_id) and (a.role<>'RECLUTADOR' or app.recruiter_id=a.id))
  or exists(select 1 from talent.captures c where c.company_id=p_company and c.person_id=p_person and c.archived_at is null and (c.owner_id=a.id or a.role in ('ANALISTA_SELECCION','JEFE_SELECCION')));
exception when insufficient_privilege then return false;
end $$;

create function public.talent_cinthia_assign(p_actor uuid,p_version uuid,p_token text,p_person text default null,p_lead uuid default null,p_test boolean default false,p_repeat boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare v public.cinthia_evaluation_versions;e public.cinthia_evaluations;i public.cinthia_invitations;app talent.applications;l public.voicebot_leads;
begin
 select * into v from public.cinthia_evaluation_versions where id=p_version for share;
 select * into e from public.cinthia_evaluations where id=v.evaluation_id for share;
 if e.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;
 if p_test then
  if not public.talent_cinthia_evaluation_access(p_actor,e.company_id,true) then raise insufficient_privilege;end if;
  p_person:=null;p_lead:=null;
 else
  if v.published_at is null or e.status<>'PUBLISHED' then raise exception 'CINTHIA_INVALID_STATE';end if;
  if not public.talent_cinthia_subject_access(p_actor,e.company_id,p_person,p_lead) then raise insufficient_privilege;end if;
 end if;
 if e.campaign_id is not null and not talent_offers.allowed(p_actor,e.company_id,e.campaign_id) then raise insufficient_privilege;end if;
 if p_lead is not null then
  select * into l from public.voicebot_leads where id=p_lead for update;
  if l.candidate_company_id=e.company_id then p_person:=l.candidate_id;end if;
 elsif p_person is not null then perform 1 from talent.persons where company_id=e.company_id and id=p_person for update;
 end if;
 if p_person is not null then
  select * into app from talent.applications where company_id=e.company_id and person_id=p_person and status='ACTIVA' and archived_at is null and (e.campaign_id is null or campaign_id=e.campaign_id) order by created_at desc limit 1;
  if e.campaign_id is not null and app.id is null then raise exception 'CINTHIA_CAMPAIGN_MISMATCH';end if;
 end if;
 if not p_test then
  select * into i from public.cinthia_invitations where evaluation_version_id=v.id and not evaluation_test and (lead_id=p_lead or (company_id=e.company_id and person_id=p_person)) and status in ('PREPARED','PENDING','IN_PROGRESS') order by created_at desc limit 1;
  if i.id is not null then return to_jsonb(i);end if;
  if exists(select 1 from public.cinthia_invitations where evaluation_version_id=v.id and (lead_id=p_lead or (company_id=e.company_id and person_id=p_person)) and status='COMPLETED') and (not p_repeat or not public.talent_cinthia_evaluation_access(p_actor,e.company_id,true)) then raise exception 'CINTHIA_REPEAT_AUTH_REQUIRED';end if;
 end if;
 insert into public.cinthia_invitations(lead_id,person_id,application_id,company_id,evaluation_version_id,evaluation_test,token,prepared_by)
 values(p_lead,p_person,app.id,e.company_id,v.id,p_test,p_token,p_actor) returning * into i;
 insert into public.cinthia_events(invitation_id,actor_id,action) values(i.id,p_actor,'PREPARED');
 insert into public.cinthia_evaluation_audit(evaluation_id,actor_id,action,version_id) values(e.id,p_actor,case when p_test then 'TEST' else 'ASSIGN' end,v.id);
 return to_jsonb(i);
end $$;

create function public.talent_cinthia_subject(p_actor uuid,p_company text,p_person text default null,p_lead uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.talent_cinthia_subject_access(p_actor,p_company,p_person,p_lead) then raise insufficient_privilege;end if;
 perform public.talent_cinthia_expire();
 return coalesce((select jsonb_agg(jsonb_build_object('invitation',to_jsonb(i),'evaluation',e.name,'version',v.number,'config',coalesce(s.evaluation_config,v.config),
 'session',case when s.id is null then null else jsonb_build_object('id',s.id,'state',s.state,'started_at',s.started_at,'completed_at',s.completed_at,'duration_seconds',s.duration_seconds,'transcript',s.transcript) end,
 'report',to_jsonb(r),'reviews',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.cinthia_human_reviews h where h.invitation_id=i.id),'[]')) order by i.created_at desc)
 from public.cinthia_invitations i left join public.cinthia_evaluation_versions v on v.id=i.evaluation_version_id left join public.cinthia_evaluations e on e.id=v.evaluation_id
 left join public.cinthia_sessions s on s.invitation_id=i.id left join public.cinthia_results r on r.session_id=s.id
 where not i.evaluation_test and ((i.lead_id=p_lead and (i.company_id is null or i.company_id=p_company)) or (i.company_id=p_company and i.person_id=p_person)
 or (i.lead_id in(select id from public.voicebot_leads where candidate_company_id=p_company and candidate_id=p_person)))
 and (e.campaign_id is null or talent_offers.allowed(p_actor,p_company,e.campaign_id))),'[]');
end $$;

create function public.talent_cinthia_invitation_action(p_actor uuid,p_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.cinthia_invitations;
begin
 select * into i from public.cinthia_invitations where id=p_id for update;
 if i.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;
 if exists(select 1 from public.cinthia_evaluation_versions v join public.cinthia_evaluations e on e.id=v.evaluation_id where v.id=i.evaluation_version_id and e.campaign_id is not null and not talent_offers.allowed(p_actor,e.company_id,e.campaign_id)) then raise insufficient_privilege;end if;
 if not (i.evaluation_test and i.prepared_by=p_actor and public.talent_cinthia_evaluation_access(p_actor,i.company_id,true))
 and not public.talent_cinthia_subject_access(p_actor,i.company_id,i.person_id,i.lead_id) then raise insufficient_privilege;end if;
 if p_action='REVIEW' then
  if i.status<>'COMPLETED' then raise exception 'CINTHIA_INVALID_STATE';end if;
  if jsonb_typeof(coalesce(p_data->'scores','{}'))<>'object' or exists(select 1 from jsonb_each_text(coalesce(p_data->'scores','{}'))s where s.value !~ '^[1-4]$' or not exists(select 1 from public.cinthia_evaluation_versions v,jsonb_array_elements(v.config->'competencies')c where v.id=i.evaluation_version_id and c->>'id'=s.key)) then raise exception 'CINTHIA_INVALID';end if;
  insert into public.cinthia_human_reviews(invitation_id,actor_id,notes,scores) values(i.id,p_actor,p_data->>'notes',coalesce(p_data->'scores','{}'));
 elsif p_action in ('SENT','WHATSAPP_OPENED','CANCELLED') then
  if i.status not in ('PREPARED','PENDING') or i.expires_at<=now() then raise exception 'CINTHIA_INVALID_STATE';end if;
  if p_action='SENT' then update public.cinthia_invitations set status='PENDING',sent_at=coalesce(sent_at,now()),sent_by=coalesce(sent_by,p_actor),updated_at=now() where id=i.id returning * into i;
  elsif p_action='CANCELLED' then update public.cinthia_invitations set status='CANCELLED',updated_at=now() where id=i.id returning * into i;end if;
  insert into public.cinthia_events(invitation_id,actor_id,action) values(i.id,p_actor,p_action);
 else raise exception 'CINTHIA_INVALID';end if;
 return to_jsonb(i);
end $$;

create function public.talent_cinthia_snapshot() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare c jsonb;
begin
 select v.config into c from public.cinthia_invitations i join public.cinthia_evaluation_versions v on v.id=i.evaluation_version_id where i.id=new.invitation_id;
 if c is not null then
  new.evaluation_config:=c;
  select jsonb_agg(a->>'question' order by n) into new.questions from jsonb_array_elements(c->'activities') with ordinality q(a,n);
  new.deadline:=now()+make_interval(mins=>least(20,greatest(3,(c->>'minutes')::integer)));
 end if;
 return new;
end $$;
create trigger cinthia_session_snapshot before insert on public.cinthia_sessions for each row execute function public.talent_cinthia_snapshot();
create function public.talent_cinthia_queue_result() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.state='COMPLETED' and old.state<>'COMPLETED' and new.evaluation_config is not null then insert into public.cinthia_results(session_id) values(new.id) on conflict do nothing;end if;return new;
end $$;
create trigger cinthia_result_pending after update on public.cinthia_sessions for each row execute function public.talent_cinthia_queue_result();
revoke all on function public.talent_cinthia_subject_access(uuid,text,text,uuid),public.talent_cinthia_assign(uuid,uuid,text,text,uuid,boolean,boolean),public.talent_cinthia_subject(uuid,text,text,uuid),public.talent_cinthia_invitation_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.talent_cinthia_assign(uuid,uuid,text,text,uuid,boolean,boolean),public.talent_cinthia_subject(uuid,text,text,uuid),public.talent_cinthia_invitation_action(uuid,uuid,text,jsonb) to service_role;
commit;
