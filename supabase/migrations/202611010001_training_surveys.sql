begin;
create schema talent_surveys;
revoke all on schema talent_surveys from public,anon,authenticated;
create table talent_surveys.surveys (
 id uuid primary key default gen_random_uuid(), token uuid not null unique default gen_random_uuid(),
 company_id text not null, group_id text not null, enabled boolean not null default false,
 created_at timestamptz not null default now(), enabled_at timestamptz,
 unique(company_id,group_id), foreign key(company_id,group_id) references talent.training_groups(company_id,id)
);
create table talent_surveys.responses (
 id uuid primary key default gen_random_uuid(), survey_id uuid not null references talent_surveys.surveys(id),
 company_id text not null, participant_id text not null, answers jsonb not null,
 positive text not null, improvement text not null, score numeric not null check(score between 4 and 20),
 context jsonb not null, created_at timestamptz not null default now(),
 unique(survey_id,participant_id), foreign key(company_id,participant_id) references talent.participants(company_id,id)
);
create table talent_surveys.audit (
 id uuid primary key default gen_random_uuid(), survey_id uuid not null references talent_surveys.surveys(id),
 action text not null, actor_id text, created_at timestamptz not null default now()
);
alter table talent_surveys.surveys enable row level security;
alter table talent_surveys.responses enable row level security;
alter table talent_surveys.audit enable row level security;
create table talent_surveys.attempts (
 token uuid not null, request_hash text not null, window_start timestamptz not null,
 attempts integer not null, primary key(token,request_hash)
);
alter table talent_surveys.attempts enable row level security;
create function public.talent_survey_attempt(p_token uuid,p_hash text) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare n integer;
begin
 if not exists(select 1 from talent_surveys.surveys where token=p_token) then return false; end if;
 delete from talent_surveys.attempts where window_start<now()-interval '1 day';
 insert into talent_surveys.attempts(token,request_hash,window_start,attempts) values(p_token,p_hash,now(),1)
 on conflict(token,request_hash) do update set
 attempts=case when talent_surveys.attempts.window_start<now()-interval '1 minute' then 1 else talent_surveys.attempts.attempts+1 end,
 window_start=case when talent_surveys.attempts.window_start<now()-interval '1 minute' then now() else talent_surveys.attempts.window_start end
 returning attempts into n;
 return n<=20;
end $$;
create function talent_surveys.sync_training() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare sid uuid;
begin
 insert into talent_surveys.surveys(company_id,group_id,enabled,enabled_at)
 values(new.company_id,new.id,new.status='FINALIZADA',case when new.status='FINALIZADA' then now() end)
 on conflict(company_id,group_id) do nothing returning id into sid;
 if sid is not null then insert into talent_surveys.audit(survey_id,action) values(sid,'CREATED'); end if;
 if new.status='FINALIZADA' then
  update talent_surveys.surveys set enabled=true,enabled_at=now() where company_id=new.company_id and group_id=new.id and not enabled returning id into sid;
  if sid is not null then insert into talent_surveys.audit(survey_id,action) values(sid,'ENABLED_ON_COMPLETION'); end if;
 end if;
 return new;
end $$;
create trigger training_survey_sync after insert or update of status on talent.training_groups for each row execute function talent_surveys.sync_training();
-- Additive initialization: existing training data is never updated.
insert into talent_surveys.surveys(company_id,group_id,enabled,enabled_at)
 select company_id,id,status='FINALIZADA',case when status='FINALIZADA' then now() end from talent.training_groups where archived_at is null;
insert into talent_surveys.audit(survey_id,action) select id,'INITIALIZED' from talent_surveys.surveys;
create function public.talent_survey_public(p_token uuid,p_data jsonb default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s talent_surveys.surveys; g talent.training_groups; pid text; doc text; points numeric; answer jsonb;
begin
 select * into s from talent_surveys.surveys where token=p_token for share;
 if not found then raise exception 'SURVEY_NOT_FOUND'; end if;
 select * into g from talent.training_groups where company_id=s.company_id and id=s.group_id;
 if p_data is null then return jsonb_build_object('name',g.name,'enabled',s.enabled); end if;
 if not s.enabled then raise exception 'SURVEY_DISABLED'; end if;
 doc:=btrim(p_data->>'document');
 if coalesce(p_data->>'documentType','') not in ('DNI','CE') or coalesce(doc,'') !~ '^[A-Za-z0-9]{6,24}$' then raise exception 'SURVEY_INVALID'; end if;
 select p.id into pid from talent.participants p join talent.applications a on a.company_id=p.company_id and a.id=p.application_id
 join talent.persons n on n.company_id=a.company_id and n.id=a.person_id
 where p.company_id=s.company_id and p.group_id=s.group_id and p.archived_at is null
 and n.archived_at is null and coalesce(n.document_type,'DNI')=p_data->>'documentType' and upper(n.document_number)=upper(doc);
 if not found then raise exception 'SURVEY_PARTICIPANT_NOT_FOUND'; end if;
 answer:=p_data->'answers';
 if jsonb_typeof(answer) is distinct from 'array' then raise exception 'SURVEY_INVALID'; end if;
 if jsonb_array_length(answer)<>8 or exists(select 1 from jsonb_array_elements(answer) x where jsonb_typeof(x)<>'number' or x::text !~ '^[1-5]$')
 or length(btrim(coalesce(p_data->>'positive',''))) not between 1 and 2000 or length(btrim(coalesce(p_data->>'improvement',''))) not between 1 and 2000 then raise exception 'SURVEY_INVALID'; end if;
 select sum(value::text::numeric)/2 into points from jsonb_array_elements(answer);
 insert into talent_surveys.responses(survey_id,company_id,participant_id,answers,positive,improvement,score,context)
 values(s.id,s.company_id,pid,answer,btrim(p_data->>'positive'),btrim(p_data->>'improvement'),points,
 jsonb_build_object('groupId',g.id,'groupName',g.name,'campaignId',g.campaign_id,'trainerId',g.trainer_id));
 return jsonb_build_object('ok',true);
end $$;
-- The Worker authorizes the exact training through the existing session and assignment scope.
create function public.talent_survey_detail(p_company text,p_group text,p_export_actor text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if p_export_actor is not null then
  insert into talent_surveys.audit(survey_id,action,actor_id) select id,'EXPORTED',p_export_actor from talent_surveys.surveys where company_id=p_company and group_id=p_group;
 end if;
 select jsonb_build_object('id',s.id,'token',s.token,'enabled',s.enabled,
 'responses',coalesce((select jsonb_agg(jsonb_build_object('answers',r.answers,'positive',r.positive,'improvement',r.improvement,'score',r.score,'context',r.context) order by r.id) from talent_surveys.responses r where r.survey_id=s.id),'[]'::jsonb),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',n.full_name,'completed',exists(select 1 from talent_surveys.responses r where r.survey_id=s.id and r.participant_id=p.id))) from talent.participants p join talent.applications a on a.company_id=p.company_id and a.id=p.application_id join talent.persons n on n.company_id=a.company_id and n.id=a.person_id where p.company_id=s.company_id and p.group_id=s.group_id and p.archived_at is null),'[]'::jsonb))
 into result from talent_surveys.surveys s where s.company_id=p_company and s.group_id=p_group;
 return result;
end;
$$;
revoke all on all functions in schema talent_surveys from public,anon,authenticated;
revoke all on function public.talent_survey_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.talent_survey_attempt(uuid,text) to service_role;
revoke all on function public.talent_survey_public(uuid,jsonb),public.talent_survey_detail(text,text,text) from public,anon,authenticated;
grant execute on function public.talent_survey_public(uuid,jsonb),public.talent_survey_detail(text,text,text) to service_role;
commit;
