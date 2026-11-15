begin;
-- Configurations are immutable after publication. Existing invitations remain intact.
create table public.cinthia_evaluations (
 id uuid primary key default gen_random_uuid(), company_id text not null references talent.companies(id),
 campaign_id text, name text not null, status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','INACTIVE','ARCHIVED')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,campaign_id) references talent.campaigns(company_id,id)
);
create table public.cinthia_evaluation_versions (
 id uuid primary key default gen_random_uuid(),evaluation_id uuid not null references public.cinthia_evaluations(id),
 number integer not null check(number>0),revision integer not null default 1,config jsonb not null check(jsonb_typeof(config)='object'),
 published_at timestamptz,created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 unique(evaluation_id,number)
);
create unique index cinthia_one_draft on public.cinthia_evaluation_versions(evaluation_id) where published_at is null;
create table public.cinthia_competency_bank (
 id uuid primary key default gen_random_uuid(),company_id text not null references talent.companies(id),
 name text not null,category text not null,content jsonb not null,revision integer not null default 1,
 updated_at timestamptz not null default now(),updated_by uuid not null references auth.users(id)
);
create table public.cinthia_evaluation_audit (
 id uuid primary key default gen_random_uuid(),evaluation_id uuid references public.cinthia_evaluations(id),
 actor_id uuid not null references auth.users(id),action text not null,version_id uuid references public.cinthia_evaluation_versions(id),created_at timestamptz not null default now()
);
create index cinthia_evaluation_company on public.cinthia_evaluations(company_id,status,updated_at desc);
alter table public.cinthia_evaluations enable row level security;
alter table public.cinthia_evaluation_versions enable row level security;
alter table public.cinthia_competency_bank enable row level security;
alter table public.cinthia_evaluation_audit enable row level security;
revoke all on public.cinthia_evaluations,public.cinthia_evaluation_versions,public.cinthia_competency_bank,public.cinthia_evaluation_audit from public,anon,authenticated;

create function public.talent_cinthia_evaluation_access(p_actor uuid,p_company text,p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public,talent as $$
declare a talent.profiles;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 return a.role='ADMIN' or (a.role=any(case when p_write then array['JEFE_SELECCION','ANALISTA_SELECCION'] else array['JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR'] end)
 and exists(select 1 from talent.user_modules where company_id=p_company and user_id=a.id and module='SELECCION' and archived_at is null));
exception when insufficient_privilege then return false;
end $$;
create function public.talent_cinthia_evaluation_guard() returns trigger language plpgsql as $$
begin
 if old.published_at is not null then raise exception 'CINTHIA_VERSION_IMMUTABLE'; end if;
 return new;
end $$;
create trigger cinthia_version_immutable before update or delete on public.cinthia_evaluation_versions for each row execute function public.talent_cinthia_evaluation_guard();

create function public.talent_cinthia_catalog(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,talent as $$
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege;end if;
 return jsonb_build_object(
 'companies',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'canWrite',public.talent_cinthia_evaluation_access(p_actor,c.id,true))) from talent.companies c where c.archived_at is null and public.talent_cinthia_evaluation_access(p_actor,c.id)),'[]'),
 'campaigns',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'companyId',c.company_id,'name',c.title)) from talent.campaigns c where c.archived_at is null and public.talent_cinthia_evaluation_access(p_actor,c.company_id) and talent_offers.allowed(p_actor,c.company_id,c.id)),'[]'),
 'items',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('versions',(select jsonb_agg(to_jsonb(v) order by v.number desc) from public.cinthia_evaluation_versions v where v.evaluation_id=e.id)) order by e.updated_at desc) from public.cinthia_evaluations e where public.talent_cinthia_evaluation_access(p_actor,e.company_id) and (e.campaign_id is null or talent_offers.allowed(p_actor,e.company_id,e.campaign_id))),'[]'),
 'bank',coalesce((select jsonb_agg(to_jsonb(b) order by b.name) from public.cinthia_competency_bank b where public.talent_cinthia_evaluation_access(p_actor,b.company_id)),'[]'));
end $$;

create function public.talent_cinthia_evaluation_save(p_actor uuid,p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.cinthia_evaluations;v public.cinthia_evaluation_versions;c jsonb:=p_data->'config';company text;campaign text;
begin
 if p_id is not null then select * into e from public.cinthia_evaluations where id=p_id for update;if not found then raise exception 'CINTHIA_NOT_FOUND';end if;end if;
 company:=coalesce(e.company_id,c->>'companyId',p_data->>'companyId');
 if not public.talent_cinthia_evaluation_access(p_actor,company,true) then raise insufficient_privilege;end if;
 if e.campaign_id is not null and not talent_offers.allowed(p_actor,company,e.campaign_id) then raise insufficient_privilege;end if;
 if p_action='BANK' then
  if length(btrim(p_data->>'name')) not between 1 and 150 or jsonb_typeof(p_data->'content')<>'object' then raise exception 'CINTHIA_INVALID';end if;
  insert into public.cinthia_competency_bank(company_id,name,category,content,updated_by) values(company,p_data->>'name',coalesce(p_data->>'category','General'),p_data->'content',p_actor);
  return jsonb_build_object('saved',true);
 end if;
 if p_action in ('SAVE','DUPLICATE') then
  if jsonb_typeof(c) is distinct from 'object' or length(btrim(c->>'name')) not between 1 and 150 or c->>'companyId' is distinct from company then raise exception 'CINTHIA_INVALID';end if;
  campaign:=nullif(c->>'campaignId','');
  if p_action='SAVE' and e.id is not null and campaign is distinct from e.campaign_id and exists(select 1 from public.cinthia_evaluation_versions where evaluation_id=e.id and published_at is not null) then raise exception 'CINTHIA_DUPLICATE_FOR_CAMPAIGN';end if;
  if campaign is not null and not talent_offers.allowed(p_actor,company,campaign) then raise insufficient_privilege;end if;
  if p_action='DUPLICATE' or e.id is null then
   insert into public.cinthia_evaluations(company_id,campaign_id,name,created_by) values(company,campaign,c->>'name',p_actor) returning * into e;
   insert into public.cinthia_evaluation_versions(evaluation_id,number,config,created_by) values(e.id,1,c,p_actor) returning * into v;
  else
   if e.status='ARCHIVED' then raise exception 'CINTHIA_INVALID_STATE';end if;
   select * into v from public.cinthia_evaluation_versions where evaluation_id=e.id and published_at is null for update;
   if v.id is not null then
    if v.revision is distinct from (p_data->>'revision')::integer then raise exception 'CINTHIA_CONFLICT';end if;
    update public.cinthia_evaluation_versions set config=c,revision=revision+1 where id=v.id returning * into v;
   else
    insert into public.cinthia_evaluation_versions(evaluation_id,number,config,created_by) select e.id,coalesce(max(number),0)+1,c,p_actor from public.cinthia_evaluation_versions where evaluation_id=e.id returning * into v;
   end if;
   update public.cinthia_evaluations set name=c->>'name',campaign_id=campaign,updated_at=now() where id=e.id returning * into e;
  end if;
 elsif p_action='PUBLISH' then
  select * into v from public.cinthia_evaluation_versions where evaluation_id=e.id and published_at is null for update;
  if v.id is null or v.revision is distinct from (p_data->>'revision')::integer then raise exception 'CINTHIA_CONFLICT';end if;
  -- The Worker validates the full typed schema. The database additionally protects core scoring invariants.
  c:=v.config;
  if jsonb_array_length(c->'competencies')=0 or jsonb_array_length(c->'activities')=0 or (select sum((x->>'weight')::numeric) from jsonb_array_elements(c->'competencies')x)<>100 then raise exception 'CINTHIA_INVALID';end if;
  update public.cinthia_evaluation_versions set published_at=now() where id=v.id returning * into v;
  update public.cinthia_evaluations set status='PUBLISHED',updated_at=now() where id=e.id returning * into e;
 elsif p_action in ('INACTIVE','ARCHIVED') then
  if e.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;
  update public.cinthia_evaluations set status=p_action,updated_at=now() where id=e.id returning * into e;
 else raise exception 'CINTHIA_INVALID';end if;
 insert into public.cinthia_evaluation_audit(evaluation_id,actor_id,action,version_id) values(e.id,p_actor,p_action,v.id);
 return jsonb_build_object('evaluation',to_jsonb(e),'version',to_jsonb(v));
end $$;
revoke all on function public.talent_cinthia_evaluation_access(uuid,text,boolean),public.talent_cinthia_catalog(uuid),public.talent_cinthia_evaluation_save(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.talent_cinthia_catalog(uuid),public.talent_cinthia_evaluation_save(uuid,text,uuid,jsonb) to service_role;
commit;
