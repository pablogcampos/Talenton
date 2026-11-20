begin;
create table public.cinthia_free_evaluations(
 id uuid primary key default gen_random_uuid(),token text not null unique check(token ~ '^[a-f0-9]{64}$'),
 config jsonb not null,status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','PAUSED','FINISHED')),
 revision integer not null default 1,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(octet_length(config::text)<100000)
);
create table public.cinthia_free_participants(
 id uuid primary key default gen_random_uuid(),evaluation_id uuid not null references public.cinthia_free_evaluations(id),
 name text not null check(length(name) between 3 and 150),phone text not null check(phone ~ '^[0-9]{9,15}$'),email text check(length(email)<=254),
 consent_at timestamptz not null default now(),consent_version text not null default 'cinthia-free-v1',created_at timestamptz not null default now(),
 linked_lead uuid references public.voicebot_leads(id),linked_company text,linked_person text,unique(evaluation_id,phone),
 foreign key(linked_company,linked_person) references talent.persons(company_id,id)
);
alter table public.cinthia_invitations add column free_participant_id uuid references public.cinthia_free_participants(id),add column free_config jsonb,add column free_request_hash text;
-- Replace only the subject check; external participants are not fake leads or test accounts.
do $$declare c record;begin for c in select conname from pg_constraint where conrelid='public.cinthia_invitations'::regclass and contype='c' and pg_get_constraintdef(oid) like '%lead_id IS NOT NULL%' loop execute format('alter table public.cinthia_invitations drop constraint %I',c.conname);end loop;end $$;
alter table public.cinthia_invitations add check(lead_id is not null or person_id is not null or evaluation_test or free_participant_id is not null);
create unique index cinthia_free_request on public.cinthia_invitations(free_participant_id,free_request_hash) where free_participant_id is not null;
create index cinthia_free_attempts on public.cinthia_invitations(free_participant_id,created_at);
create table public.cinthia_free_rate(key text primary key,window_at timestamptz not null default now(),requests integer not null default 1);
alter table public.cinthia_free_evaluations enable row level security;
alter table public.cinthia_free_participants enable row level security;
alter table public.cinthia_free_rate enable row level security;
revoke all on public.cinthia_free_evaluations,public.cinthia_free_participants,public.cinthia_free_rate from public,anon,authenticated;

create function public.talent_cinthia_free_public(p_token text,p_data jsonb default null,p_token_new text default null,p_rate text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.cinthia_free_evaluations;p public.cinthia_free_participants;i public.cinthia_invitations;n integer;phone_value text;
begin
 select * into e from public.cinthia_free_evaluations where token=p_token for update;
 if e.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;
 if e.status<>'ACTIVE' or (e.config->>'expiresAt')::timestamptz<=now() then raise exception 'CINTHIA_INVALID_STATE';end if;
 if p_data is null then return jsonb_build_object('name',e.config->>'name','description',e.config->>'description','objective',e.config->>'objective','minutes',least((e.config->>'minutes')::integer,(select (config->>'maxMinutes')::integer from public.cinthia_runtime_settings where id=true)),'consentVersion','cinthia-free-v1');end if;
 if p_data->>'consent' is distinct from 'true' or p_data->>'consentVersion' is distinct from 'cinthia-free-v1' then raise exception 'CINTHIA_CONSENT_REQUIRED';end if;
 if p_rate is null or p_rate !~ '^[a-f0-9]{64}$' or p_token_new !~ '^[a-f0-9]{64}$' or coalesce(p_data->>'requestHash','') !~ '^[a-f0-9]{64}$' then raise exception 'CINTHIA_INVALID';end if;
 delete from public.cinthia_free_rate where window_at<now()-interval '1 day';
 insert into public.cinthia_free_rate(key) values(p_rate) on conflict(key) do update set requests=case when cinthia_free_rate.window_at<now()-interval '1 hour' then 1 else cinthia_free_rate.requests+1 end,window_at=case when cinthia_free_rate.window_at<now()-interval '1 hour' then now() else cinthia_free_rate.window_at end returning requests into n;
 if n>20 then raise exception 'CINTHIA_FREE_LIMIT';end if;
 phone_value:=p_data->>'phone';
 select * into p from public.cinthia_free_participants where evaluation_id=e.id and cinthia_free_participants.phone=phone_value;
 if p.id is not null then
  select * into i from public.cinthia_invitations where free_participant_id=p.id and free_request_hash=p_data->>'requestHash';
  if i.id is not null then return jsonb_build_object('token',i.token);end if;
  if (select count(*) from public.cinthia_invitations where free_participant_id=p.id)>=(e.config->>'maxAttempts')::integer then raise exception 'CINTHIA_FREE_LIMIT';end if;
  if exists(select 1 from public.cinthia_invitations x left join public.cinthia_sessions ss on ss.invitation_id=x.id where x.free_participant_id=p.id and x.status in ('PENDING','IN_PROGRESS') and x.expires_at>now() and (ss.deadline is null or ss.deadline>now())) then raise exception 'CINTHIA_SESSION_BUSY';end if;
 else
  if (select count(*) from public.cinthia_free_participants where evaluation_id=e.id)>=(e.config->>'participantLimit')::integer then raise exception 'CINTHIA_FREE_LIMIT';end if;
  insert into public.cinthia_free_participants(evaluation_id,name,phone,email) values(e.id,btrim(p_data->>'name'),phone_value,nullif(btrim(p_data->>'email'),'')) returning * into p;
 end if;
 insert into public.cinthia_invitations(free_participant_id,free_config,free_request_hash,token,prepared_by,status,expires_at,consent_at,consent_version)
 values(p.id,e.config,p_data->>'requestHash',p_token_new,e.created_by,'PENDING',(e.config->>'expiresAt')::timestamptz,now(),'cinthia-free-v1') returning * into i;
 insert into public.cinthia_events(invitation_id,action) values(i.id,'PREPARED');
 return jsonb_build_object('token',i.token);
end $$;

create function public.talent_cinthia_free_admin(p_actor uuid,p_action text default 'LIST',p_id uuid default null,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
#variable_conflict use_column
declare e public.cinthia_free_evaluations;p public.cinthia_free_participants;target text;
begin
 if not public.talent_voicebot_has_role(p_actor,array['ADMIN']) then raise insufficient_privilege;end if;
 if p_action='LIST' then return coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from(select e.*,(select count(*) from public.cinthia_free_participants p where p.evaluation_id=e.id) participants,(select count(*) from public.cinthia_invitations i join public.cinthia_free_participants p on p.id=i.free_participant_id where p.evaluation_id=e.id and i.status='COMPLETED') completed from public.cinthia_free_evaluations e)x),'[]');end if;
 if p_action='SAVE' then
  if p_id is null then insert into public.cinthia_free_evaluations(token,config,created_by) values(p_data->>'token',p_data->'config',p_actor) returning * into e;
  else update public.cinthia_free_evaluations set config=p_data->'config',revision=revision+1,updated_at=now() where id=p_id and revision=(p_data->>'revision')::integer returning * into e;if not found then raise exception 'CINTHIA_CONFLICT';end if;end if;
 elsif p_action='STATE' then
  if p_data->>'status' not in ('DRAFT','ACTIVE','PAUSED','FINISHED') then raise exception 'CINTHIA_INVALID';end if;
  update public.cinthia_free_evaluations set status=p_data->>'status',revision=revision+1,updated_at=now() where id=p_id and revision=(p_data->>'revision')::integer returning * into e;if not found then raise exception 'CINTHIA_CONFLICT';end if;
 elsif p_action='PARTICIPANTS' then
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from(select p.*,e.config->>'name' evaluation,i.id invitation_id,i.status invitation_status,s.state session_state,s.started_at,s.completed_at,s.duration_seconds,s.transcript,r.state report_state,r.result,
   (select jsonb_agg(to_jsonb(h)) from public.cinthia_human_reviews h where h.invitation_id=i.id) reviews
   from public.cinthia_free_participants p join public.cinthia_free_evaluations e on e.id=p.evaluation_id join public.cinthia_invitations i on i.free_participant_id=p.id left join public.cinthia_sessions s on s.invitation_id=i.id left join public.cinthia_results r on r.session_id=s.id where p_id is null or p.evaluation_id=p_id)x),'[]');
 elsif p_action='MATCHES' then
  select * into p from public.cinthia_free_participants where id=p_id;if p.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;
  return jsonb_build_object('leads',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.full_name,'phone',l.phone)) from public.voicebot_leads l where right(regexp_replace(l.phone,'[^0-9]','','g'),9)=right(p.phone,9)),'[]'),'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'company',c.company_id,'name',c.full_name,'phone',c.phone)) from talent.persons c where c.archived_at is null and right(regexp_replace(c.phone,'[^0-9]','','g'),9)=right(p.phone,9)),'[]'));
 elsif p_action='LINK' then
  select * into p from public.cinthia_free_participants where id=p_id for update;if p.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;
  if p_data->>'lead' is not null then
   if not exists(select 1 from public.voicebot_leads l where l.id=(p_data->>'lead')::uuid and right(regexp_replace(l.phone,'[^0-9]','','g'),9)=right(p.phone,9)) then raise exception 'CINTHIA_INVALID';end if;
   update public.cinthia_free_participants set linked_lead=(p_data->>'lead')::uuid where id=p.id;
  else
   if not exists(select 1 from talent.persons c where c.id=p_data->>'person' and c.company_id=p_data->>'company' and c.archived_at is null and right(regexp_replace(c.phone,'[^0-9]','','g'),9)=right(p.phone,9)) then raise exception 'CINTHIA_INVALID';end if;
   update public.cinthia_free_participants set linked_company=p_data->>'company',linked_person=p_data->>'person' where id=p.id;
  end if;
 elsif p_action='REVIEW' then
  if not exists(select 1 from public.cinthia_invitations where id=p_id and free_participant_id is not null and status='COMPLETED') then raise exception 'CINTHIA_INVALID_STATE';end if;
  insert into public.cinthia_human_reviews(invitation_id,actor_id,notes) values(p_id,p_actor,p_data->>'notes');
 else raise exception 'CINTHIA_INVALID';end if;
 insert into public.cinthia_evaluation_audit(actor_id,action) values(p_actor,'FREE_'||p_action);
 return coalesce(to_jsonb(e),'{}');
end $$;

-- Snapshot external configuration into the existing audio session and never extend its duration on reconnect.
create function public.talent_cinthia_free_snapshot() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare c jsonb;
begin
 select free_config into c from public.cinthia_invitations where id=new.invitation_id;
 if c is not null then
  if tg_op='INSERT' then new.evaluation_config:=c;new.questions:='[]';new.deadline:=now()+make_interval(mins=>least((c->>'minutes')::integer,(new.runtime_config->>'maxMinutes')::integer));
  else new.deadline:=old.deadline;new.attempts:=greatest(old.attempts,new.attempts);end if;
 end if;return new;
end $$;
create trigger zzz_cinthia_free_snapshot before insert or update on public.cinthia_sessions for each row execute function public.talent_cinthia_free_snapshot();
-- Guard the same session RPC, keeping its existing implementation untouched for ordinary interviews.
alter function public.talent_cinthia_session(text,text,jsonb,boolean) rename to talent_cinthia_session_core;
revoke all on function public.talent_cinthia_session_core(text,text,jsonb,boolean) from public,anon,authenticated,service_role;
create function public.talent_cinthia_session(p_token text,p_action text,p_data jsonb default '{}',p_test boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.cinthia_free_evaluations;i public.cinthia_invitations;s public.cinthia_sessions;
begin
 select * into i from public.cinthia_invitations where token=p_token;
 if i.free_participant_id is not null then
  select f.* into e from public.cinthia_free_evaluations f join public.cinthia_free_participants p on p.evaluation_id=f.id where p.id=i.free_participant_id;
  if p_action not in ('INTERRUPT','RECEIPT') and (e.status<>'ACTIVE' or (e.config->>'expiresAt')::timestamptz<=now()) then raise exception 'CINTHIA_INVALID_STATE';end if;
  if p_action='CLAIM' then
   perform pg_advisory_xact_lock(hashtextextended('cinthia:free:concurrency',0));
   if (select count(*) from public.cinthia_sessions ss join public.cinthia_invitations ii on ii.id=ss.invitation_id where ii.free_participant_id is not null and ss.lease_until>now())>=20 then raise exception 'CINTHIA_FREE_LIMIT';end if;
  end if;
  if p_action='FREE_FINISH' then
   select * into s from public.cinthia_sessions where invitation_id=i.id for update;
   if s.id is null or s.client_hash is distinct from p_data->>'clientHash' or s.connection_id is distinct from (p_data->>'connectionId')::uuid or s.state<>'ACTIVE' or s.lease_until<=now() then raise exception 'CINTHIA_SESSION_BUSY';end if;
   if p_data ? 'transcript' and (jsonb_typeof(p_data->'transcript')<>'array' or jsonb_array_length(p_data->'transcript')>400) then raise exception 'CINTHIA_INVALID';end if;
   update public.cinthia_sessions set transcript=coalesce(p_data->'transcript',transcript),state='COMPLETED',completed_at=now(),duration_seconds=greatest(0,extract(epoch from now()-s.started_at)::integer),connection_id=null,lease_until=null,resume_handle=null where id=s.id;
   update public.cinthia_invitations set status='COMPLETED',completed_at=now(),updated_at=now() where id=i.id;
   insert into public.cinthia_events(invitation_id,action) values(i.id,'COMPLETED');
   return jsonb_build_object('receiptId',s.id,'completedAt',now());
  end if;
 end if;
 return public.talent_cinthia_session_core(p_token,p_action,p_data,p_test);
end $$;
revoke all on function public.talent_cinthia_free_public(text,jsonb,text,text),public.talent_cinthia_free_admin(uuid,text,uuid,jsonb),public.talent_cinthia_session(text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.talent_cinthia_free_public(text,jsonb,text,text),public.talent_cinthia_free_admin(uuid,text,uuid,jsonb),public.talent_cinthia_session(text,text,jsonb,boolean) to service_role;
alter function public.talent_cinthia_public_metadata(text) rename to talent_cinthia_public_metadata_core;
revoke all on function public.talent_cinthia_public_metadata_core(text) from public,anon,authenticated,service_role;
create function public.talent_cinthia_public_metadata(p_token text) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select case when i.free_participant_id is null then public.talent_cinthia_public_metadata_core(p_token) else jsonb_build_object('free',true,'evaluationName',i.free_config->>'name','objective',i.free_config->>'objective','minutes',least((i.free_config->>'minutes')::integer,(r.config->>'maxMinutes')::integer)) end from public.cinthia_invitations i cross join public.cinthia_runtime_settings r where i.token=p_token;
$$;
revoke all on function public.talent_cinthia_public_metadata(text) from public,anon,authenticated;
grant execute on function public.talent_cinthia_public_metadata(text) to service_role;
commit;
