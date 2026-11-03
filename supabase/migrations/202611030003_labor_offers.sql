begin;
create schema talent_offers;
revoke all on schema talent_offers from public,anon,authenticated;
create table talent_offers.templates(
 id uuid primary key default gen_random_uuid(), company_id text not null, campaign_id text not null,
 title text not null check(length(btrim(title)) between 1 and 160),
 content text not null check(length(btrim(content)) between 20 and 40000),
 created_by text not null, created_at timestamptz not null default now(),
 foreign key(company_id,campaign_id) references talent.campaigns(company_id,id));
create table talent_offers.assignments(
 company_id text not null, group_id text not null, template_id uuid not null references talent_offers.templates,
 assigned_by text not null, assigned_at timestamptz not null default now(),
 primary key(company_id,group_id),foreign key(company_id,group_id) references talent.training_groups(company_id,id));
create table talent_offers.documents(
 id uuid primary key default gen_random_uuid(),company_id text not null,group_id text not null,participant_id text not null,
 template_id uuid not null references talent_offers.templates, token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
 snapshot jsonb not null, created_at timestamptz not null default now(),signed_at timestamptz,signature jsonb,
 acceptance text, evidence_hash text,content_hash text not null, revoked_at timestamptz,
 unique(company_id,group_id,participant_id,template_id),
 foreign key(company_id,participant_id,group_id) references talent.participants(company_id,id,group_id));
create index offers_documents_group on talent_offers.documents(company_id,group_id) where revoked_at is null;
alter table talent_offers.templates enable row level security;
alter table talent_offers.assignments enable row level security;
alter table talent_offers.documents enable row level security;

create function talent_offers.allowed(p_actor uuid,p_company text,p_campaign text,p_group text default null)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,talent as $$
declare a talent.profiles;c talent.campaigns;g talent.training_groups;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 select * into c from talent.campaigns where company_id=p_company and id=p_campaign and archived_at is null;
 if not found then return false;end if;
 if exists(select 1 from talent.companies where id=p_company and catalog_managed)
 and not talent_private.org_campaign_access(p_actor,p_company,c.company_campaign_id) then return false;end if;
 if a.role='ADMIN' then return true;end if;
 if a.role in ('JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR') and exists(select 1 from talent.user_modules where company_id=p_company and user_id=a.id and module='SELECCION' and archived_at is null) then
 return a.role='JEFE_SELECCION' or exists(select 1 from talent.companies where id=p_company and catalog_managed) or c.assigned_analyst_id=a.id or exists(select 1 from talent.campaign_assignments where company_id=p_company and campaign_id=p_campaign and user_id=a.id and archived_at is null)
 or (a.role='RECLUTADOR' and exists(select 1 from talent.applications where company_id=p_company and campaign_id=p_campaign and recruiter_id=a.id and archived_at is null));
 end if;
 if p_group is not null and a.role in ('JEFE_FORMACION','COORDINADOR_FORMACION','FORMADOR') and exists(select 1 from talent.user_modules where company_id=p_company and user_id=a.id and module='FORMACION' and archived_at is null) then
 select * into g from talent.training_groups where company_id=p_company and id=p_group and campaign_id=p_campaign and archived_at is null;
 return found and (a.role='JEFE_FORMACION' or a.role='FORMADOR' and g.trainer_id=a.id or a.role='COORDINADOR_FORMACION' and (g.coordinator_id=a.id or exists(select 1 from talent.campaign_assignments where company_id=p_company and campaign_id=p_campaign and user_id=a.id and archived_at is null)));
 end if;
 return false;
exception when insufficient_privilege then return false;
end $$;

create function talent_offers.issue(p_company text,p_group text) returns void
language plpgsql security definer set search_path=pg_catalog,talent,talent_offers as $$
declare a talent_offers.assignments;t talent_offers.templates;r record;s jsonb;
begin
 select * into a from talent_offers.assignments where company_id=p_company and group_id=p_group;
 if not found then return;end if;
 select * into t from talent_offers.templates where id=a.template_id;
 for r in select p.id,p.status,n.full_name,n.document_number,g.name group_name,c.title campaign_name,co.name company_name,g.theory_days,g.start_date,g.theory_end_date
 from talent.participants p join talent.applications app on app.company_id=p.company_id and app.id=p.application_id
 join talent.persons n on n.company_id=app.company_id and n.id=app.person_id
 join talent.training_groups g on g.company_id=p.company_id and g.id=p.group_id
 join talent.campaigns c on c.company_id=g.company_id and c.id=g.campaign_id
 join talent.companies co on co.id=p.company_id where p.company_id=p_company and p.group_id=p_group
 loop
 s:=jsonb_build_object('name',r.full_name,'dni',r.document_number,'company',r.company_name,'campaign',r.campaign_name,'group',r.group_name,'days',r.theory_days,'startDate',r.start_date,'endDate',r.theory_end_date,'title',t.title,'content',replace(replace(replace(t.content,'{{nombre}}',r.full_name),'{{empresa}}',r.company_name),'{{campaña}}',r.campaign_name));
 insert into talent_offers.documents(company_id,group_id,participant_id,template_id,snapshot,content_hash)
 values(p_company,p_group,r.id,t.id,s,encode(sha256(convert_to(s::text,'UTF8')),'hex')) on conflict do nothing;
 end loop;
end $$;
create function talent_offers.new_participant() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin perform talent_offers.issue(new.company_id,new.group_id);return new;end $$;
create trigger offers_new_participant after insert on talent.participants for each row execute function talent_offers.new_participant();

create function talent_offers.require_signed(p_company text,p_group text) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from talent.participants p where p.company_id=p_company and p.group_id=p_group and not exists(
 select 1 from talent_offers.documents d where d.company_id=p.company_id and d.group_id=p.group_id and d.participant_id=p.id and d.signed_at is not null and d.revoked_at is null))
 then raise exception 'OFFER_SIGNATURES_PENDING';end if;
end $$;
create function talent_offers.theory_guard() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if tg_table_name='training_groups' then
 if new.status is distinct from old.status and old.status in ('PENDIENTE_ASIGNACION','PROGRAMADA','EN_CAPACITACION')
 and new.status in ('PENDIENTE_OJT','EN_OJT','EXTENSION_OJT','FINALIZADA') then perform talent_offers.require_signed(new.company_id,new.id);end if;
 else
 if (new.status is distinct from old.status and new.status in ('PENDIENTE_OJT','EN_OJT') and old.status not in ('PENDIENTE_OJT','EN_OJT'))
 or (new.annotations->>'theoryCompletedAt' is distinct from old.annotations->>'theoryCompletedAt' and new.annotations->>'theoryCompletedAt' is not null)
 then perform talent_offers.require_signed(new.company_id,new.group_id);end if;
 end if;
 return new;
end $$;
create trigger offers_theory_group before update on talent.training_groups for each row execute function talent_offers.theory_guard();
create trigger offers_theory_participant before update on talent.participants for each row execute function talent_offers.theory_guard();

create function public.talent_offer_catalog(p_actor uuid,p_company text,p_group text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,talent as $$
declare a talent.profiles;cs jsonb;gs jsonb;ts jsonb;ds jsonb;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 if p_group is null and a.role not in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR') then raise insufficient_privilege;end if;
 if p_group is not null and not exists(select 1 from talent.training_groups g where g.company_id=p_company and g.id=p_group and talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id)) then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.title) order by c.title),'[]') into cs from talent.campaigns c
 where c.company_id=p_company and talent_offers.allowed(p_actor,p_company,c.id,p_group);
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'code',g.code,'campaignId',g.campaign_id,'status',g.status,'templateId',assignment.template_id) order by g.created_at desc),'[]') into gs
 from talent.training_groups g left join talent_offers.assignments assignment on assignment.company_id=g.company_id and assignment.group_id=g.id
 where g.company_id=p_company and g.archived_at is null and (p_group is null or g.id=p_group) and talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') into ts from talent_offers.templates t where t.company_id=p_company and talent_offers.allowed(p_actor,p_company,t.campaign_id,p_group);
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'groupId',d.group_id,'name',d.snapshot->>'name','title',d.snapshot->>'title','signedAt',d.signed_at,'revokedAt',d.revoked_at,'token',case when d.revoked_at is null then d.token end,'contentHash',d.content_hash) order by d.created_at desc),'[]') into ds
 from talent_offers.documents d join talent.training_groups g on g.company_id=d.company_id and g.id=d.group_id
 where d.company_id=p_company and (p_group is null or d.group_id=p_group) and talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id);
 return jsonb_build_object('campaigns',cs,'groups',gs,'templates',ts,'documents',ds,'canCreate',a.role in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION'),'canAssign',a.role in ('ADMIN','RECLUTADOR'));
end $$;
create function public.talent_offer_create(p_actor uuid,p_company text,p_campaign text,p_title text,p_content text) returns uuid
language plpgsql security definer set search_path=pg_catalog,talent as $$
declare a talent.profiles;result uuid;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 if a.role not in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION') or not talent_offers.allowed(p_actor,p_company,p_campaign) then raise insufficient_privilege;end if;
 insert into talent_offers.templates(company_id,campaign_id,title,content,created_by) values(p_company,p_campaign,p_title,p_content,a.id) returning id into result;
 return result;
end $$;
create function public.talent_offer_assign(p_actor uuid,p_company text,p_group text,p_template uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,talent as $$
declare a talent.profiles;g talent.training_groups;existing uuid;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 select * into g from talent.training_groups where company_id=p_company and id=p_group and archived_at is null for update;
 if not found or a.role not in ('ADMIN','RECLUTADOR') or not talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id) then raise insufficient_privilege;end if;
 if g.status not in ('PENDIENTE_ASIGNACION','PROGRAMADA','EN_CAPACITACION') then raise exception 'OFFER_STAGE_CLOSED';end if;
 if not exists(select 1 from talent_offers.templates where id=p_template and company_id=p_company and campaign_id=g.campaign_id) then raise exception 'OFFER_INVALID_TEMPLATE';end if;
 select template_id into existing from talent_offers.assignments where company_id=p_company and group_id=p_group;
 if existing is distinct from p_template and exists(select 1 from talent_offers.documents where company_id=p_company and group_id=p_group and signed_at is not null) then raise exception 'OFFER_ALREADY_SIGNED';end if;
 if existing is distinct from p_template then
 update talent_offers.documents set revoked_at=now() where company_id=p_company and group_id=p_group and signed_at is null and revoked_at is null;
 end if;
 insert into talent_offers.assignments(company_id,group_id,template_id,assigned_by) values(p_company,p_group,p_template,a.id)
 on conflict(company_id,group_id) do update set template_id=excluded.template_id,assigned_by=excluded.assigned_by,assigned_at=now();
 perform talent_offers.issue(p_company,p_group);
 -- Una plantilla revocada no se reutiliza: debe generarse una nueva versión.
 if exists(select 1 from talent_offers.documents where company_id=p_company and group_id=p_group and template_id=p_template and revoked_at is not null) then raise exception 'OFFER_REVOKED_VERSION';end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.talent_offer_document(p_actor uuid,p_company text,p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare d talent_offers.documents;campaign text;
begin
 select * into d from talent_offers.documents where company_id=p_company and id=p_id;
 select campaign_id into campaign from talent.training_groups where company_id=p_company and id=d.group_id;
 if d.id is null or not talent_offers.allowed(p_actor,p_company,campaign,d.group_id) then raise insufficient_privilege;end if;
 return (to_jsonb(d)-'token');
end $$;
create table talent_offers.attempts(token text primary key, window_at timestamptz not null, attempts integer not null);
create function public.talent_offer_public(p_token text,p_data jsonb default null,p_evidence text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare d talent_offers.documents;n integer;stroke jsonb;point jsonb;points integer:=0;
begin
 select * into d from talent_offers.documents where token=p_token and revoked_at is null;
 if not found then raise exception 'OFFER_NOT_FOUND';end if;
 perform 1 from talent.training_groups where company_id=d.company_id and id=d.group_id for update;
 select * into d from talent_offers.documents where token=p_token and revoked_at is null for update;
 if not found then raise exception 'OFFER_NOT_FOUND';end if;
 if p_data is not null then
 if d.signed_at is not null then return jsonb_build_object('signed',true,'signedAt',d.signed_at);end if;
 -- El contador se confirma también en intentos rechazados; nunca registrar DNI ni firma en logs.
 insert into talent_offers.attempts values(p_token,clock_timestamp(),1)
 on conflict(token) do update set attempts=case when talent_offers.attempts.window_at<clock_timestamp()-interval '15 minutes' then 1 else talent_offers.attempts.attempts+1 end,
 window_at=case when talent_offers.attempts.window_at<clock_timestamp()-interval '15 minutes' then clock_timestamp() else talent_offers.attempts.window_at end returning attempts into n;
 if n>10 then return jsonb_build_object('error','OFFER_RATE_LIMITED');end if;
 if p_data->>'dni' is distinct from d.snapshot->>'dni' or length(coalesce(d.snapshot->>'dni',''))<5 or p_data->'accepted' is distinct from 'true'::jsonb or p_data->>'contentHash' is distinct from d.content_hash then return jsonb_build_object('error','OFFER_INVALID_SIGNATURE');end if;
 if jsonb_typeof(p_data->'signature') is distinct from 'array' or jsonb_array_length(p_data->'signature') not between 1 and 100 then return jsonb_build_object('error','OFFER_INVALID_SIGNATURE');end if;
 for stroke in select value from jsonb_array_elements(p_data->'signature') loop
 if jsonb_typeof(stroke) is distinct from 'array' then return jsonb_build_object('error','OFFER_INVALID_SIGNATURE');end if;
 for point in select value from jsonb_array_elements(stroke) loop
 if jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point)<>2 or jsonb_typeof(point->0)<>'number' or jsonb_typeof(point->1)<>'number' then return jsonb_build_object('error','OFFER_INVALID_SIGNATURE');end if;
 if (point->>0)::numeric not between 0 and 600 or (point->>1)::numeric not between 0 and 200 then return jsonb_build_object('error','OFFER_INVALID_SIGNATURE');end if;
 points:=points+1;
 end loop;end loop;
 if points not between 10 and 5000 or length(coalesce(p_evidence,''))<>64 then return jsonb_build_object('error','OFFER_INVALID_SIGNATURE');end if;
 update talent_offers.documents set signed_at=clock_timestamp(),signature=p_data->'signature',acceptance='He leído y acepto íntegramente esta propuesta laboral y sus condiciones.',evidence_hash=p_evidence where id=d.id returning * into d;
 end if;
 return jsonb_build_object('id',d.id,'snapshot',d.snapshot-'dni','signedAt',d.signed_at,'signature',d.signature,'acceptance',d.acceptance,'contentHash',d.content_hash);
end $$;
create function talent_offers.immutable_signed() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' or old.signed_at is not null or new.snapshot is distinct from old.snapshot or new.content_hash is distinct from old.content_hash or new.token is distinct from old.token then raise exception 'OFFER_IMMUTABLE';end if;
 return new;
end $$;
create trigger offers_immutable before update or delete on talent_offers.documents for each row execute function talent_offers.immutable_signed();
revoke all on all tables in schema talent_offers from public,anon,authenticated;
revoke all on all functions in schema talent_offers from public,anon,authenticated;
revoke all on function public.talent_offer_catalog(uuid,text,text),public.talent_offer_create(uuid,text,text,text,text),public.talent_offer_assign(uuid,text,text,uuid),public.talent_offer_document(uuid,text,uuid),public.talent_offer_public(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.talent_offer_catalog(uuid,text,text),public.talent_offer_create(uuid,text,text,text,text),public.talent_offer_assign(uuid,text,text,uuid),public.talent_offer_document(uuid,text,uuid),public.talent_offer_public(text,jsonb,text) to service_role;
commit;
