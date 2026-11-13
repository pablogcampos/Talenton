begin;
create table public.cinthia_sessions (
 id uuid primary key default gen_random_uuid(), invitation_id uuid not null unique references public.cinthia_invitations(id),
 client_hash text not null check(client_hash ~ '^[a-f0-9]{64}$'),
 state text not null default 'CONNECTING' check(state in ('CONNECTING','ACTIVE','INTERRUPTED','COMPLETED')),
 created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
 deadline timestamptz not null default now()+interval '6 minutes',
 connection_id uuid, lease_until timestamptz, attempts integer not null default 0,
 resume_handle text, model text not null, transcript jsonb not null default '[]',
 errors jsonb not null default '[]', duration_seconds integer,
 check(jsonb_typeof(transcript)='array' and octet_length(transcript::text)<=200000),
 check(jsonb_typeof(errors)='array' and octet_length(errors::text)<=10000)
);
alter table public.cinthia_sessions enable row level security;
revoke all on public.cinthia_sessions from public,anon,authenticated;
create function public.talent_cinthia_session(p_token text,p_action text,p_data jsonb default '{}',p_test boolean default false) returns jsonb
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
   insert into public.cinthia_sessions(invitation_id,client_hash,model) values(inv.id,p_data->>'clientHash',p_data->>'model') returning * into s;
   update public.cinthia_invitations set consent_at=now(),consent_version='cinthia-voice-v1',ai_session_id=s.id::text where id=inv.id;
  elsif s.client_hash is distinct from p_data->>'clientHash' then raise exception 'CINTHIA_SESSION_BUSY';
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
   update public.cinthia_sessions set transcript=coalesce(p_data->'transcript',transcript),resume_handle=coalesce(p_data->>'resumeHandle',resume_handle),lease_until=now()+interval '45 seconds' where id=s.id returning * into s;
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
create function public.talent_cinthia_transcript(p_actor uuid,p_lead uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'invitationId',i.id,'state',s.state,'startedAt',s.started_at,'completedAt',s.completed_at,'durationSeconds',s.duration_seconds,'model',s.model,'transcript',s.transcript,'errors',s.errors) order by s.created_at desc) from public.cinthia_sessions s join public.cinthia_invitations i on i.id=s.invitation_id where i.lead_id=p_lead),'[]');
end $$;
revoke all on function public.talent_cinthia_session(text,text,jsonb,boolean),public.talent_cinthia_transcript(uuid,uuid) from public,anon,authenticated;
grant execute on function public.talent_cinthia_session(text,text,jsonb,boolean),public.talent_cinthia_transcript(uuid,uuid) to service_role;
commit;
