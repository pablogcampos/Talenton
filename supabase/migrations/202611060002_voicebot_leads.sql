begin;
-- Shared recruitment inbox. External ingestion is intentionally not enabled yet.
create table public.voicebot_leads (
 id uuid primary key default gen_random_uuid(),
 source text not null default 'voicebot' check(length(source) between 1 and 80),
 external_id text not null check(length(btrim(external_id)) between 1 and 200),
 received_at timestamptz not null default clock_timestamp(),
 occurred_at timestamptz,
 phone text not null check(length(btrim(phone)) between 6 and 40),
 full_name text not null default '' check(length(full_name)<=300),
 origin text not null default '' check(length(origin)<=300),
 company_name text not null default '' check(length(company_name)<=200),
 campaign_name text not null default '' check(length(campaign_name)<=200),
 workday text not null default '' check(length(workday)<=200),
 district text not null default '' check(length(district)<=300),
 experience text not null default '' check(length(experience)<=10000),
 interview_availability text not null default '' check(length(interview_availability)<=3000),
 interest text not null default '' check(length(interest)<=200),
 ai_reason text not null default '' check(length(ai_reason)<=10000),
 transcript text not null default '' check(length(transcript)<=50000),
 bot_notes text not null default '' check(length(bot_notes)<=10000),
 source_recruiter text not null default '' check(length(source_recruiter)<=300),
 payload jsonb not null default '{}' check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=100000),
 status text not null default 'NUEVO' check(status in ('NUEVO','EN_GESTION','CONTACTADO','NO_CONTACTADO','DESCARTADO')),
 owner_auth_id uuid references auth.users(id),
 owner_name text,
 management_notes text not null default '' check(length(management_notes)<=10000),
 version bigint not null default 1,
 updated_at timestamptz not null default clock_timestamp(),
 unique(source,external_id)
);
create index voicebot_leads_received on public.voicebot_leads(received_at desc,id desc);
create index voicebot_leads_status_received on public.voicebot_leads(status,received_at desc);
create index voicebot_leads_owner on public.voicebot_leads(owner_auth_id);
create table public.voicebot_lead_history (
 id bigint generated always as identity primary key,
 lead_id uuid not null references public.voicebot_leads(id),
 actor_auth_id uuid not null references auth.users(id),
 action text not null, previous_status text not null, new_status text not null,
 notes text not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.voicebot_leads enable row level security;
alter table public.voicebot_lead_history enable row level security;
revoke all on public.voicebot_leads,public.voicebot_lead_history from public,anon,authenticated;

create function public.talent_voicebot_allowed(p_actor uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,talent,talent_org as $$
 select exists(select 1 from talent.profiles p where p.auth_user_id=p_actor and not p.is_context
 and p.enabled and p.status='ACTIVO' and p.archived_at is null and not p.must_change_password
 and (talent_private.org_global_admin(p_actor)
 or exists(select 1 from talent_org.user_companies m join talent.companies c on c.id=m.company_id
 where m.auth_user_id=p_actor and m.enabled and m.archived_at is null and c.status='ACTIVA' and c.archived_at is null
 and m.role in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'))
 or (not exists(select 1 from talent.companies c where c.id=p.company_id and c.catalog_managed)
 and not coalesce((p.annotations->>'companyAccessManaged')::boolean,false)
 and p.role in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR')
 and exists(select 1 from talent.user_modules m where m.company_id=p.company_id and m.user_id=p.id and m.module='SELECCION' and m.archived_at is null))))
$$;
revoke all on function public.talent_voicebot_allowed(uuid) from public,anon,authenticated;
grant execute on function public.talent_voicebot_allowed(uuid) to authenticated,service_role;
grant select on public.voicebot_leads to authenticated;
create policy voicebot_selection_read on public.voicebot_leads for select to authenticated using(public.talent_voicebot_allowed(auth.uid()));

create function public.talent_voicebot_list(p_actor uuid,p_search text default '',p_status text default '',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; total bigint;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 if p_page is null or p_page<0 or p_page>100000 or length(p_search)>200 then raise exception 'VOICEBOT_INVALID'; end if;
 select count(*) into total from public.voicebot_leads l where (p_status='' or l.status=p_status)
 and (p_search='' or position(lower(p_search) in lower(l.full_name||' '||l.phone||' '||l.external_id))>0);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.received_at desc,t.id desc),'[]') into result from (
 select * from public.voicebot_leads l where (p_status='' or l.status=p_status)
 and (p_search='' or position(lower(p_search) in lower(l.full_name||' '||l.phone||' '||l.external_id))>0)
 order by l.received_at desc,l.id desc limit 50 offset p_page*50) t;
 return jsonb_build_object('items',result,'total',total,'page',p_page,'pageSize',50);
end $$;

create function public.talent_voicebot_feed(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(t)) from (select id,received_at from public.voicebot_leads order by received_at desc,id desc limit 50) t),'[]'::jsonb));
end $$;
revoke all on function public.talent_voicebot_feed(uuid) from public,anon,authenticated;
grant execute on function public.talent_voicebot_feed(uuid) to service_role;

create function public.talent_voicebot_manage(p_actor uuid,p_id uuid,p_version bigint,p_action text,p_status text default null,p_notes text default '')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare lead public.voicebot_leads; previous text; actor_name text;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 select * into lead from public.voicebot_leads where id=p_id for update;
 if not found then raise exception 'VOICEBOT_NOT_FOUND'; end if;
 if p_version is distinct from lead.version then raise sqlstate 'PT409' using message='VOICEBOT_CHANGED'; end if;
 previous:=lead.status;
 select display_name into actor_name from talent.profiles where auth_user_id=p_actor and not is_context;
 if p_action='TAKE' then
  if lead.owner_auth_id is not null or lead.status<>'NUEVO' then raise sqlstate 'PT409' using message='VOICEBOT_TAKEN'; end if;
  update public.voicebot_leads set owner_auth_id=p_actor,owner_name=actor_name,status='EN_GESTION',version=version+1,updated_at=clock_timestamp() where id=p_id returning * into lead;
 elsif p_action='UPDATE' then
  if lead.owner_auth_id is distinct from p_actor then raise insufficient_privilege; end if;
  if p_status is null or p_status not in ('EN_GESTION','CONTACTADO','NO_CONTACTADO','DESCARTADO') or p_notes is null or length(p_notes)>10000 then raise exception 'VOICEBOT_INVALID'; end if;
  update public.voicebot_leads set status=p_status,management_notes=p_notes,version=version+1,updated_at=clock_timestamp() where id=p_id returning * into lead;
 else raise exception 'VOICEBOT_INVALID'; end if;
 insert into public.voicebot_lead_history(lead_id,actor_auth_id,action,previous_status,new_status,notes) values(p_id,p_actor,p_action,previous,lead.status,lead.management_notes);
 return to_jsonb(lead);
end $$;
revoke all on function public.talent_voicebot_list(uuid,text,text,integer),public.talent_voicebot_manage(uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.talent_voicebot_list(uuid,text,text,integer),public.talent_voicebot_manage(uuid,uuid,bigint,text,text,text) to service_role;
-- Realtime uses the read policy; no public write access or provider credentials.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.voicebot_leads;
 end if;
end $$;
commit;
