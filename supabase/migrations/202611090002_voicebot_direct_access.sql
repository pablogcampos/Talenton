begin;
-- Login is enabled separately, after generating a provider-only password.
create role voicebot_ingest nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 3;
grant connect on database postgres to voicebot_ingest;
grant usage on schema public to voicebot_ingest;
grant insert (external_id,occurred_at,phone,full_name,origin,company_name,campaign_name,
 workday,district,experience,interview_availability,interest,ai_reason,transcript,
 bot_notes,source_recruiter,payload) on public.voicebot_leads to voicebot_ingest;
create policy voicebot_provider_insert on public.voicebot_leads for insert to voicebot_ingest
 with check (source='voicebot' and status='NUEVO' and owner_auth_id is null
 and owner_name is null and management_notes='' and version=1);
alter role voicebot_ingest set statement_timeout='20s';
alter role voicebot_ingest set lock_timeout='5s';
alter role voicebot_ingest set idle_in_transaction_session_timeout='30s';
comment on role voicebot_ingest is 'External voicebot: insert-only reception fields in public.voicebot_leads. No memberships or read access.';
commit;
