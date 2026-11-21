begin;
alter table talent_offers.templates add column status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','REPLACED'));
alter table talent_offers.templates add column revision integer not null default 1;
alter table talent_offers.templates add column version integer;
alter table talent_offers.templates add column published_at timestamptz;
alter table talent_offers.templates add column published_by text;
alter table talent_offers.templates add column base_id uuid references talent_offers.templates;
with ranked as(select id,row_number() over(partition by company_id,coalesce('catalog:'||company_campaign_id,campaign_id),coalesce(workday,'LEGACY') order by created_at,id) v,count(*) over(partition by company_id,coalesce('catalog:'||company_campaign_id,campaign_id),coalesce(workday,'LEGACY')) n from talent_offers.templates)
update talent_offers.templates t set version=r.v,status=case when r.v=r.n then 'PUBLISHED' else 'REPLACED' end,published_at=created_at,published_by=created_by from ranked r where r.id=t.id;
create unique index offers_one_official on talent_offers.templates(company_id,(coalesce('catalog:'||company_campaign_id,campaign_id)),(coalesce(workday,'LEGACY'))) where status='PUBLISHED';
create function public.talent_offer_draft(p_actor uuid,p_company text,p_campaign text,p_title text,p_content text,p_workday text,p_id uuid default null,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a talent.profiles;t talent_offers.templates;official uuid;key text;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 if a.role not in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION') then raise insufficient_privilege;end if;
 if (left(p_campaign,8)='catalog:' and not talent_offers.catalog_allowed(p_actor,p_company,substr(p_campaign,9))) or (left(p_campaign,8)<>'catalog:' and not talent_offers.allowed(p_actor,p_company,p_campaign)) then raise insufficient_privilege;end if;
 if p_workday is null or p_workday not in ('FULL_TIME','SEMI_FULL','PART_TIME') then raise exception 'OFFER_INVALID_WORKDAY';end if;
 key:=p_company||':'||p_campaign||':'||p_workday;perform pg_advisory_xact_lock(hashtextextended(key,0));
 select id into official from talent_offers.templates where company_id=p_company and coalesce('catalog:'||company_campaign_id,campaign_id)=p_campaign and workday=p_workday and status='PUBLISHED';
 if p_id is null then
 t.id:=public.talent_offer_create_workday(p_actor,p_company,p_campaign,p_title,p_content,p_workday);
 update talent_offers.templates set base_id=official where id=t.id returning * into t;
 else
 select * into t from talent_offers.templates where id=p_id and company_id=p_company for update;
 if not found or t.status<>'DRAFT' or t.revision is distinct from p_revision then raise exception 'OFFER_DRAFT_CHANGED';end if;
 if coalesce('catalog:'||t.company_campaign_id,t.campaign_id)<>p_campaign or t.workday is distinct from p_workday then raise exception 'OFFER_INVALID_TEMPLATE';end if;
 update talent_offers.templates set title=p_title,content=p_content,revision=revision+1 where id=p_id returning * into t;
 end if;
 return to_jsonb(t);
end $$;
create function public.talent_offer_publish(p_actor uuid,p_company text,p_id uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a talent.profiles;t talent_offers.templates;official uuid;key text;v integer;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 select * into t from talent_offers.templates where id=p_id and company_id=p_company;
 if not found then raise exception 'OFFER_INVALID_TEMPLATE';end if;
 key:=coalesce('catalog:'||t.company_campaign_id,t.campaign_id);
 if a.role not in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION') or (t.company_campaign_id is not null and not talent_offers.catalog_allowed(p_actor,p_company,t.company_campaign_id)) or (t.campaign_id is not null and not talent_offers.allowed(p_actor,p_company,t.campaign_id)) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company||':'||key||':'||coalesce(t.workday,'LEGACY'),0));
 select * into t from talent_offers.templates where id=p_id for update;
 if t.status='PUBLISHED' then return to_jsonb(t);end if;
 if t.status<>'DRAFT' or t.revision is distinct from p_revision then raise exception 'OFFER_DRAFT_CHANGED';end if;
 select id into official from talent_offers.templates where company_id=p_company and coalesce('catalog:'||company_campaign_id,campaign_id)=key and workday is not distinct from t.workday and status='PUBLISHED';
 if t.base_id is distinct from official then raise exception 'OFFER_OFFICIAL_CHANGED';end if;
 select coalesce(max(version),0)+1 into v from talent_offers.templates where company_id=p_company and coalesce('catalog:'||company_campaign_id,campaign_id)=key and workday is not distinct from t.workday;
 update talent_offers.templates set status='REPLACED' where id=official;
 update talent_offers.templates set status='PUBLISHED',version=v,published_at=now(),published_by=a.id,revision=revision+1 where id=p_id returning * into t;
 return to_jsonb(t);
end $$;
-- Existing signed/issued snapshots are never rewritten. New assignments select only official templates.
do $$declare s text;begin
 s:=pg_get_functiondef('public.talent_offer_workday_plan(uuid,text,text)'::regprocedure);
 if position('tt.company_id=p_company' in s)=0 then raise exception 'MISSING_PLAN_ANCHOR';end if;
 s:=replace(s,'tt.company_id=p_company','tt.status=''PUBLISHED'' and tt.company_id=p_company');execute s;
 s:=pg_get_functiondef('public.talent_offer_assign(uuid,text,text,uuid)'::regprocedure);
 s:=replace(s,'begin','begin'||chr(10)||' if not exists(select 1 from talent_offers.templates where id=p_template and company_id=p_company and status=''PUBLISHED'') then raise exception ''OFFER_INVALID_TEMPLATE'';end if;');execute s;
 -- Serialize issuing against publication, and include version in newly issued snapshots.
 s:=pg_get_functiondef('public.talent_offer_assign_workdays(uuid,text,text,text)'::regprocedure);
 s:=replace(s,'begin','begin'||chr(10)||' lock table talent_offers.templates in share mode;');
 s:=replace(s,'''title'',t.title','''version'',t.version,''title'',t.title');execute s;
 s:=pg_get_functiondef('talent_offers.issue_legacy(text,text)'::regprocedure);
 s:=replace(s,'select * into t from talent_offers.templates where id=a.template_id;','select * into t from talent_offers.templates where id=a.template_id and status=''PUBLISHED'' for share; if not found then return;end if;');
 s:=replace(s,'''title'',t.title','''version'',t.version,''title'',t.title');execute s;
 s:=pg_get_functiondef('public.talent_offer_catalog_before_group_links(uuid,text,text)'::regprocedure);
 s:=replace(s,'to_jsonb(t)||jsonb_build_object(', 'to_jsonb(t)||jsonb_build_object(''publisherName'',(select display_name from talent.profiles where company_id=t.company_id and id=t.published_by),');execute s;
end $$;
revoke all on function public.talent_offer_draft(uuid,text,text,text,text,text,uuid,integer),public.talent_offer_publish(uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.talent_offer_draft(uuid,text,text,text,text,text,uuid,integer),public.talent_offer_publish(uuid,text,uuid,integer) to service_role;
commit;
