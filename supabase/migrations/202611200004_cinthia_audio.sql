begin;
create table public.cinthia_audio_consents(invitation_id uuid primary key references public.cinthia_invitations(id) on delete cascade,client_hash text not null,accepted_at timestamptz not null default now(),version text not null default 'cinthia-audio-v1');
create table public.cinthia_audio_parts(id uuid primary key,invitation_id uuid not null references public.cinthia_invitations(id) on delete cascade,object_key text not null unique,started_at timestamptz not null,duration_ms integer not null check(duration_ms between 1 and 60000),created_at timestamptz not null default now());
alter table public.cinthia_audio_consents enable row level security;
alter table public.cinthia_audio_parts enable row level security;
revoke all on public.cinthia_audio_consents,public.cinthia_audio_parts from public,anon,authenticated;
create function public.talent_cinthia_audio(p_action text,p_token text default null,p_hash text default null,p_actor uuid default null,p_id uuid default null,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.cinthia_invitations;s public.cinthia_sessions;a public.cinthia_audio_parts;
begin
 if p_action in ('LIST','READ') then
  if not public.talent_voicebot_has_role(p_actor,array['ADMIN']) then raise insufficient_privilege;end if;
  if p_action='LIST' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'started_at',started_at,'duration_ms',duration_ms) order by started_at) from public.cinthia_audio_parts where invitation_id=p_id),'[]');end if;
  select * into a from public.cinthia_audio_parts where id=p_id;if a.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;return jsonb_build_object('objectKey',a.object_key);
 end if;
 select * into i from public.cinthia_invitations where token=p_token;
 if i.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;
 if p_action='INFO' then return jsonb_build_object('recordAudio',coalesce((i.free_config->>'recordAudio')::boolean,false));end if;
 if i.free_config->>'recordAudio' is distinct from 'true' then raise exception 'CINTHIA_INVALID_STATE';end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'CINTHIA_INVALID';end if;
 if p_action='CONSENT' then
  if p_data->>'accepted' is distinct from 'true' or p_data->>'version' is distinct from 'cinthia-audio-v1' then raise exception 'CINTHIA_CONSENT_REQUIRED';end if;
  if i.status in ('COMPLETED','CANCELLED','EXPIRED') or i.expires_at<=now() then raise exception 'CINTHIA_INVALID_STATE';end if;
  if exists(select 1 from public.cinthia_sessions where invitation_id=i.id and client_hash<>p_hash) then raise exception 'CINTHIA_SESSION_BUSY';end if;
  insert into public.cinthia_audio_consents(invitation_id,client_hash) values(i.id,p_hash) on conflict(invitation_id) do nothing;
 end if;
 if not exists(select 1 from public.cinthia_audio_consents where invitation_id=i.id and client_hash=p_hash) then raise exception 'CINTHIA_CONSENT_REQUIRED';end if;
 if p_action in ('CONSENT','CHECK') then return jsonb_build_object('invitationId',i.id);end if;
 if p_action='APPEND' then
  select * into s from public.cinthia_sessions where invitation_id=i.id;
  if s.client_hash is distinct from p_hash or s.connection_id::text is distinct from p_data->>'connectionId' then raise exception 'CINTHIA_SESSION_BUSY';end if;
  if p_data->>'objectKey' is distinct from 'cinthia/audio/'||i.id::text||'/'||p_id::text||'.wav' then raise exception 'CINTHIA_INVALID';end if;
  insert into public.cinthia_audio_parts(id,invitation_id,object_key,started_at,duration_ms) values(p_id,i.id,p_data->>'objectKey',(p_data->>'startedAt')::timestamptz,(p_data->>'durationMs')::integer) on conflict(id) do nothing;
  return '{}'::jsonb;
 end if;
 raise exception 'CINTHIA_INVALID';
end $$;
revoke all on function public.talent_cinthia_audio(text,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.talent_cinthia_audio(text,text,text,uuid,uuid,jsonb) to service_role;
do $body$ declare definition text;begin
 select pg_get_functiondef('public.talent_cinthia_free_public(text,jsonb,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'''consentVersion'',''cinthia-free-v1'')','''consentVersion'',''cinthia-free-v1'',''recordAudio'',coalesce((e.config->>''recordAudio'')::boolean,false))');
 execute definition;
end $body$;
commit;
