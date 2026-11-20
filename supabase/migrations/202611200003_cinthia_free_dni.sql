begin;
alter table public.cinthia_free_participants add column dni text check(dni ~ '^[0-9]{8}$');
create unique index cinthia_free_dni_unique on public.cinthia_free_participants(evaluation_id,dni) where dni is not null;
create or replace function public.talent_cinthia_free_public(p_token text,p_data jsonb default null,p_token_new text default null,p_rate text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.cinthia_free_evaluations;p public.cinthia_free_participants;i public.cinthia_invitations;n integer;phone_value text;dni_value text;
begin
 select * into e from public.cinthia_free_evaluations where token=p_token for update;
 if e.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;
 if e.status<>'ACTIVE' or (e.config->>'expiresAt')::timestamptz<=now() then raise exception 'CINTHIA_INVALID_STATE';end if;
 if p_data is null then return jsonb_build_object('name',e.config->>'name','description',e.config->>'description','objective',e.config->>'objective','minutes',least((e.config->>'minutes')::integer,(select (config->>'maxMinutes')::integer from public.cinthia_runtime_settings where id=true)),'consentVersion','cinthia-free-v1') || case when e.config->>'identityMode'='DNI' then jsonb_build_object('identityMode','DNI','maxAttempts',1) else '{}'::jsonb end;end if;
 if p_data->>'consent' is distinct from 'true' or p_data->>'consentVersion' is distinct from 'cinthia-free-v1' then raise exception 'CINTHIA_CONSENT_REQUIRED';end if;
 if p_rate is null or p_rate !~ '^[a-f0-9]{64}$' or p_token_new !~ '^[a-f0-9]{64}$' or coalesce(p_data->>'requestHash','') !~ '^[a-f0-9]{64}$' then raise exception 'CINTHIA_INVALID';end if;
 delete from public.cinthia_free_rate where window_at<now()-interval '1 day';
 insert into public.cinthia_free_rate(key) values(p_rate) on conflict(key) do update set requests=case when cinthia_free_rate.window_at<now()-interval '1 hour' then 1 else cinthia_free_rate.requests+1 end,window_at=case when cinthia_free_rate.window_at<now()-interval '1 hour' then now() else cinthia_free_rate.window_at end returning requests into n;
 if n>20 then raise exception 'CINTHIA_FREE_LIMIT';end if;
 phone_value:=p_data->>'phone';
 dni_value:=btrim(p_data->>'dni');
 if e.config->>'identityMode'='DNI' then
  if dni_value is null or dni_value !~ '^[0-9]{8}$' then raise exception 'CINTHIA_DNI_REQUIRED';end if;
  select * into p from public.cinthia_free_participants where evaluation_id=e.id and dni=dni_value;
  if p.id is not null then
   select * into i from public.cinthia_invitations where free_participant_id=p.id and free_request_hash=p_data->>'requestHash';
   if i.id is not null then return jsonb_build_object('token',i.token);end if;
   raise exception 'CINTHIA_DNI_ATTEMPT_USED';
  end if;
 end if;
 select * into p from public.cinthia_free_participants where evaluation_id=e.id and cinthia_free_participants.phone=phone_value;
 if p.id is not null then
  if e.config->>'identityMode'='DNI' and p.dni is distinct from dni_value then raise exception 'CINTHIA_FREE_LIMIT';end if;
  select * into i from public.cinthia_invitations where free_participant_id=p.id and free_request_hash=p_data->>'requestHash';
  if i.id is not null then return jsonb_build_object('token',i.token);end if;
  if (select count(*) from public.cinthia_invitations where free_participant_id=p.id)>=(e.config->>'maxAttempts')::integer then raise exception 'CINTHIA_FREE_LIMIT';end if;
  if exists(select 1 from public.cinthia_invitations x left join public.cinthia_sessions ss on ss.invitation_id=x.id where x.free_participant_id=p.id and x.status in ('PENDING','IN_PROGRESS') and x.expires_at>now() and (ss.deadline is null or ss.deadline>now())) then raise exception 'CINTHIA_SESSION_BUSY';end if;
 else
  if (select count(*) from public.cinthia_free_participants where evaluation_id=e.id)>=(e.config->>'participantLimit')::integer then raise exception 'CINTHIA_FREE_LIMIT';end if;
  insert into public.cinthia_free_participants(evaluation_id,name,phone,email,dni) values(e.id,btrim(p_data->>'name'),phone_value,nullif(btrim(p_data->>'email'),''),case when e.config->>'identityMode'='DNI' then dni_value else null end) returning * into p;
 end if;
 insert into public.cinthia_invitations(free_participant_id,free_config,free_request_hash,token,prepared_by,status,expires_at,consent_at,consent_version)
 values(p.id,e.config,p_data->>'requestHash',p_token_new,e.created_by,'PENDING',(e.config->>'expiresAt')::timestamptz,now(),'cinthia-free-v1') returning * into i;
 insert into public.cinthia_events(invitation_id,action) values(i.id,'PREPARED');
 return jsonb_build_object('token',i.token);
end $$;


commit;
