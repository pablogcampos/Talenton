begin;
create table public.cinthia_settings(id boolean primary key default true check(id),questions jsonb not null,revision integer not null default 1,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id));
insert into public.cinthia_settings(questions) values ('["Cuéntame sobre tu experiencia laboral.","¿Cuáles fueron tus principales responsabilidades?","Cuéntame cómo resolviste un problema en un trabajo anterior.","¿Cuál es tu disponibilidad para trabajar?","¿Qué te motiva a buscar esta oportunidad laboral?"]');
alter table public.cinthia_settings enable row level security;
revoke all on public.cinthia_settings from public,anon,authenticated;
alter table public.cinthia_sessions add column questions jsonb, add column flow jsonb not null default '{}';
update public.cinthia_sessions set questions=(select questions from public.cinthia_settings where id=true);
alter table public.cinthia_sessions alter column questions set not null;
alter table public.cinthia_sessions add constraint cinthia_flow_size check(jsonb_typeof(flow)='object' and octet_length(flow::text)<20000);
create function public.talent_cinthia_settings(p_actor uuid,p_questions jsonb default null,p_revision integer default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.cinthia_settings;
begin
 if not public.talent_voicebot_has_role(p_actor,array['ADMIN']) then raise insufficient_privilege; end if;
 select * into s from public.cinthia_settings where id=true for update;
 if p_questions is not null then
  if jsonb_typeof(p_questions)<>'array' then raise exception 'CINTHIA_INVALID'; end if;
  if jsonb_array_length(p_questions) not between 1 and 10 or exists(select 1 from jsonb_array_elements(p_questions)q where jsonb_typeof(q)<>'string' or length(btrim(q#>>'{}')) not between 5 and 500) then raise exception 'CINTHIA_INVALID'; end if;
  if p_revision is distinct from s.revision then raise exception 'CINTHIA_SETTINGS_CONFLICT'; end if;
  update public.cinthia_settings set questions=p_questions,revision=revision+1,updated_at=now(),updated_by=p_actor where id=true returning * into s;
 end if;
 return to_jsonb(s);
end $$;
revoke all on function public.talent_cinthia_settings(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.talent_cinthia_settings(uuid,jsonb,integer) to service_role;
create or replace function public.talent_cinthia_session(p_token text,p_action text,p_data jsonb default '{}',p_test boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare inv public.cinthia_invitations; s public.cinthia_sessions; conn uuid:=nullif(p_data->>'connectionId','')::uuid; result jsonb;
begin
 select * into inv from public.cinthia_invitations where token=p_token for update;
 if not found or (inv.test_mode and p_test is distinct from true) then raise exception 'CINTHIA_NOT_FOUND'; end if;
 if inv.status in ('EXPIRED','CANCELLED') or inv.expires_at<=now() then raise exception 'CINTHIA_INVALID_STATE'; end if;
 select * into s from public.cinthia_sessions where invitation_id=inv.id for update;
 if p_action='BEGIN' then
  if p_data->>'consentVersion' is distinct from 'cinthia-voice-v1' or (p_data->>'consent')::boolean is distinct from true then raise exception 'CINTHIA_CONSENT_REQUIRED'; end if;
  if inv.status='COMPLETED' then raise exception 'CINTHIA_INVALID_STATE'; end if;
  if s.id is null then
   insert into public.cinthia_sessions(invitation_id,questions,client_hash,model) values(inv.id,(select questions from public.cinthia_settings where id=true),p_data->>'clientHash',p_data->>'model') returning * into s;
   update public.cinthia_invitations set consent_at=now(),consent_version='cinthia-voice-v1',ai_session_id=s.id::text where id=inv.id;
  elsif s.client_hash is distinct from p_data->>'clientHash' then raise exception 'CINTHIA_SESSION_BUSY';
  elsif s.state='INTERRUPTED' and s.errors->-1->>'code'='SILENCE_TIMEOUT' then
   update public.cinthia_sessions set deadline=now()+interval '6 minutes',attempts=0,resume_handle=null where id=s.id returning * into s;
  end if;
 else
  if s.id is null or s.client_hash is distinct from p_data->>'clientHash' then raise exception 'CINTHIA_NOT_FOUND'; end if;
 end if;
 if p_action='RECEIPT' then
  if s.state='COMPLETED' then return jsonb_build_object('receiptId',s.id,'completedAt',s.completed_at); end if;
  return jsonb_build_object('completed',false);
 end if;
 if (s.deadline<=now() and p_action<>'INTERRUPT') or s.state='COMPLETED' then raise exception 'CINTHIA_SESSION_EXPIRED'; end if;
 if p_action='CLAIM' then
  if s.lease_until>now() or s.attempts>=4 then raise exception 'CINTHIA_SESSION_BUSY'; end if;
  if conn is null then raise exception 'CINTHIA_INVALID'; end if;
  update public.cinthia_sessions set connection_id=conn,lease_until=now()+interval '45 seconds',attempts=attempts+1,state='CONNECTING' where id=s.id returning * into s;
 elsif p_action in ('READY','SAVE','INTERRUPT','FINISH') then
  if conn is null or s.connection_id is distinct from conn or s.lease_until<=now() then raise exception 'CINTHIA_SESSION_BUSY'; end if;
  if p_action='READY' then
   update public.cinthia_sessions set state='ACTIVE',started_at=coalesce(started_at,now()),lease_until=now()+interval '45 seconds' where id=s.id returning * into s;
   if inv.started_at is null then
    update public.cinthia_invitations set status='IN_PROGRESS',started_at=now(),updated_at=now() where id=inv.id;
    insert into public.cinthia_events(invitation_id,action) values(inv.id,'STARTED');
   end if;
  elsif p_action='SAVE' then
   if p_data ? 'transcript' and (jsonb_typeof(p_data->'transcript')<>'array' or jsonb_array_length(p_data->'transcript')>400) then raise exception 'CINTHIA_INVALID'; end if;
   update public.cinthia_sessions set flow=coalesce(p_data->'flow',flow),transcript=coalesce(p_data->'transcript',transcript),resume_handle=coalesce(p_data->>'resumeHandle',resume_handle),lease_until=now()+interval '45 seconds' where id=s.id returning * into s;
  elsif p_action='INTERRUPT' then
   update public.cinthia_sessions set state='INTERRUPTED',connection_id=null,lease_until=null,
   errors=errors||jsonb_build_array(jsonb_build_object('at',now(),'code',left(coalesce(p_data->>'code','CONNECTION_LOST'),80))) where id=s.id returning * into s;
  else
   if s.state<>'ACTIVE' or s.started_at is null or (p_data->>'turnComplete')::boolean is distinct from true
    or not exists(select 1 from jsonb_array_elements(s.transcript)t where t->>'speaker'='candidate' and t->>'complete'='true' and length(btrim(t->>'text'))>0)
    or not exists(select 1 from jsonb_array_elements(s.transcript)t where t->>'speaker'='cinthia' and t->>'complete'='true' and length(btrim(t->>'text'))>0)
   then raise exception 'CINTHIA_INCOMPLETE'; end if;
   update public.cinthia_sessions set state='COMPLETED',completed_at=now(),duration_seconds=greatest(0,extract(epoch from now()-started_at)::integer),connection_id=null,lease_until=null,resume_handle=null where id=s.id returning * into s;
   update public.cinthia_invitations set status='COMPLETED',completed_at=s.completed_at,updated_at=now(),transcript_ref=s.id::text where id=inv.id;
   insert into public.cinthia_events(invitation_id,action) values(inv.id,'COMPLETED');
   return jsonb_build_object('receiptId',s.id,'completedAt',s.completed_at);
  end if;
 elsif p_action not in ('BEGIN','CLAIM','RECEIPT') then raise exception 'CINTHIA_INVALID'; end if;
 return to_jsonb(s)-'client_hash'||jsonb_build_object('context',(select jsonb_build_object('experience',left(experience,2000),'availability',left(interview_availability||' '||workday,1000),'interest',left(interest,500)) from public.voicebot_leads where id=inv.lead_id));
end $$;

create or replace function public.talent_cinthia_list(p_actor uuid,p_filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; f_state text:=coalesce(p_filters->>'state',''); f_search text:=btrim(coalesce(p_filters->>'search',''));
 f_owner uuid:=nullif(p_filters->>'owner','')::uuid; f_page integer:=coalesce((p_filters->>'page')::integer,0);
 f_from date:=nullif(p_filters->>'from','')::date; f_to date:=nullif(p_filters->>'to','')::date;
 f_interview_from date:=nullif(p_filters->>'interviewFrom','')::date; f_interview_to date:=nullif(p_filters->>'interviewTo','')::date;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 if f_owner is not null and f_owner<>p_actor and not public.talent_voicebot_has_role(p_actor,array['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION']) then raise insufficient_privilege; end if;
 if f_page not between 0 and 100000 or length(f_search)>200 or f_state not in ('','NOT_SENT','PREPARED','PENDING','IN_PROGRESS','COMPLETED','CLOSED') or f_from>f_to or f_interview_from>f_interview_to then raise exception 'CINTHIA_INVALID'; end if;
 perform public.talent_cinthia_expire();
 with base as (
 select l.id,l.full_name,l.phone,l.received_at,l.owner_auth_id,l.owner_name,
 coalesce(i.status,'NOT_SENT') state,i.updated_at,i.started_at,i.id invitation_id,i.test_mode,
 (l.owner_auth_id is null or l.owner_auth_id=p_actor or public.talent_voicebot_has_role(p_actor,array['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION'])) can_manage
 from public.voicebot_leads l left join lateral(select * from public.cinthia_invitations where lead_id=l.id order by created_at desc,id desc limit 1)i on true
 where (f_owner is null or l.owner_auth_id=f_owner)
 and (f_from is null or l.received_at>=f_from::timestamp at time zone 'America/Lima')
 and (f_to is null or l.received_at<(f_to+1)::timestamp at time zone 'America/Lima')
 and (f_interview_from is null or i.started_at>=f_interview_from::timestamp at time zone 'America/Lima')
 and (f_interview_to is null or i.started_at<(f_interview_to+1)::timestamp at time zone 'America/Lima')
 and (f_search='' or strpos(lower(l.full_name||' '||l.phone||' '||coalesce(l.payload->>'dni',l.payload->>'DNI','')),lower(f_search))>0)
 ), filtered as (select * from base where f_state='' or state=f_state or f_state='CLOSED' and state in ('EXPIRED','CANCELLED'))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by received_at desc,id desc) from (select * from filtered order by received_at desc,id desc limit 50 offset f_page*50)r),'[]'),
 'total',(select count(*) from filtered),'counts',(select jsonb_object_agg(state,n) from(select state,count(*) n from base group by state)c),
 'metrics',(select jsonb_build_object('available',count(*),'pending',count(*) filter(where state in ('PREPARED','PENDING')),'active',count(*) filter(where state='IN_PROGRESS'),'completed',count(*) filter(where state='COMPLETED')) from filtered),
 'canConfigure',public.talent_voicebot_has_role(p_actor,array['ADMIN']),
 'canFilterOwner',public.talent_voicebot_has_role(p_actor,array['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION']),
 'recruiters',case when public.talent_voicebot_has_role(p_actor,array['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION']) then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from(select distinct owner_auth_id id,owner_name name from public.voicebot_leads where owner_auth_id is not null)r),'[]'::jsonb) else '[]'::jsonb end,
 'serverTime',now()) into result;
 return result;
end $$;

commit;
