begin;
alter table talent_offers.templates alter column campaign_id drop not null;
alter table talent_offers.templates add column company_campaign_id text;
alter table talent_offers.templates add constraint offer_catalog_company foreign key(company_id,company_campaign_id) references talent_org.company_campaigns(company_id,id);
alter table talent_offers.templates add constraint offer_campaign_source check ((campaign_id is not null) <> (company_campaign_id is not null));
create index offers_templates_catalog on talent_offers.templates(company_id,company_campaign_id);
-- Preserve template IDs and signed snapshots while moving linked templates to their business campaign.
update talent_offers.templates t set company_campaign_id=c.company_campaign_id,campaign_id=null
from talent.campaigns c where c.company_id=t.company_id and c.id=t.campaign_id and c.company_campaign_id is not null;
create function talent_offers.catalog_allowed(p_actor uuid,p_company text,p_catalog text,p_group text default null)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,talent as $$
declare a talent.profiles;g talent.training_groups;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 if not talent_private.org_campaign_access(p_actor,p_company,p_catalog) then return false;end if;
 if a.role='ADMIN' then return true;end if;
 if a.role in ('JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR') and exists(select 1 from talent.user_modules where company_id=p_company and user_id=a.id and module='SELECCION' and archived_at is null) then return true;end if;
 if p_group is not null then
 select grp.* into g from talent.training_groups grp join talent.campaigns c on c.company_id=grp.company_id and c.id=grp.campaign_id
 where grp.company_id=p_company and grp.id=p_group and c.company_campaign_id=p_catalog;
 return found and talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id);
 end if;
 return false;
exception when insufficient_privilege then return false;
end $$;
create or replace function public.talent_offer_create(p_actor uuid,p_company text,p_campaign text,p_title text,p_content text) returns uuid
language plpgsql security definer set search_path=pg_catalog,talent as $$
declare a talent.profiles;result uuid;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 if a.role not in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION') then raise insufficient_privilege;end if;
 if left(p_campaign,8)='catalog:' then
 if not talent_offers.catalog_allowed(p_actor,p_company,substr(p_campaign,9)) then raise insufficient_privilege;end if;
 insert into talent_offers.templates(company_id,company_campaign_id,title,content,created_by) values(p_company,substr(p_campaign,9),p_title,p_content,a.id) returning id into result;
 else
 if not talent_offers.allowed(p_actor,p_company,p_campaign) then raise insufficient_privilege;end if;
 insert into talent_offers.templates(company_id,campaign_id,title,content,created_by) values(p_company,p_campaign,p_title,p_content,a.id) returning id into result;
 end if;
 return result;
end $$;
create or replace function public.talent_offer_assign(p_actor uuid,p_company text,p_group text,p_template uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,talent as $$
declare a talent.profiles;g talent.training_groups;existing uuid;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 select * into g from talent.training_groups where company_id=p_company and id=p_group and archived_at is null for update;
 if not found or a.role not in ('ADMIN','RECLUTADOR') or not talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id) then raise insufficient_privilege;end if;
 if g.status not in ('PENDIENTE_ASIGNACION','PROGRAMADA','EN_CAPACITACION') then raise exception 'OFFER_STAGE_CLOSED';end if;
 if not exists(select 1 from talent_offers.templates where id=p_template and company_id=p_company and (campaign_id=g.campaign_id or company_campaign_id=(select c.company_campaign_id from talent.campaigns c where c.company_id=p_company and c.id=g.campaign_id))) then raise exception 'OFFER_INVALID_TEMPLATE';end if;
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
create or replace function public.talent_offer_catalog(p_actor uuid,p_company text,p_group text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,talent as $$
declare a talent.profiles;cs jsonb;gs jsonb;ts jsonb;ds jsonb;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 if p_group is null and a.role not in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR') then raise insufficient_privilege;end if;
 if p_group is not null and not exists(select 1 from talent.training_groups g where g.company_id=p_company and g.id=p_group and talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id)) then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name) order by q.name),'[]') into cs from (
 select 'catalog:'||cc.id as id,gc.name from talent_org.company_campaigns cc join talent_org.global_campaigns gc on gc.id=cc.global_campaign_id
 where cc.company_id=p_company and talent_offers.catalog_allowed(p_actor,p_company,cc.id,p_group)
 union all
 select c.id,c.title from talent.campaigns c where c.company_id=p_company and c.company_campaign_id is null and talent_offers.allowed(p_actor,p_company,c.id,p_group)
 ) q;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'code',g.code,'campaignId',g.campaign_id,'campaignKey',coalesce('catalog:'||c.company_campaign_id,g.campaign_id),'status',g.status,'templateId',assignment.template_id) order by g.created_at desc),'[]') into gs
 from talent.training_groups g join talent.campaigns c on c.company_id=g.company_id and c.id=g.campaign_id left join talent_offers.assignments assignment on assignment.company_id=g.company_id and assignment.group_id=g.id
 where g.company_id=p_company and g.archived_at is null and (p_group is null or g.id=p_group) and talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id);
 select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('campaignKey',coalesce('catalog:'||t.company_campaign_id,t.campaign_id)) order by t.created_at desc),'[]') into ts from talent_offers.templates t where t.company_id=p_company and (t.campaign_id is not null and talent_offers.allowed(p_actor,p_company,t.campaign_id,p_group) or t.company_campaign_id is not null and talent_offers.catalog_allowed(p_actor,p_company,t.company_campaign_id,p_group));
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'groupId',d.group_id,'name',d.snapshot->>'name','title',d.snapshot->>'title','signedAt',d.signed_at,'revokedAt',d.revoked_at,'token',case when d.revoked_at is null then d.token end,'contentHash',d.content_hash) order by d.created_at desc),'[]') into ds
 from talent_offers.documents d join talent.training_groups g on g.company_id=d.company_id and g.id=d.group_id
 where d.company_id=p_company and (p_group is null or d.group_id=p_group) and talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id);
 return jsonb_build_object('campaigns',cs,'groups',gs,'templates',ts,'documents',ds,'canCreate',a.role in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION'),'canAssign',a.role in ('ADMIN','RECLUTADOR'));
end $$;
revoke all on function talent_offers.catalog_allowed(uuid,text,text,text) from public,anon,authenticated;
commit;
