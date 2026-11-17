begin;
-- Access policy for accounts saved through Administration. Operational ownership stays separate.
create function talent_private.sync_universal_user(p_user text) returns void
language plpgsql security definer set search_path=pg_catalog,talent,talent_org as $$
declare home talent.profiles;co record;mods text[];
begin
 select * into home from talent.profiles where id=p_user and not is_context;
 if not found then raise exception 'TALENT_USER_NOT_FOUND'; end if;
 select coalesce(array_agg(module),array[]::text[]) into mods from talent.user_modules where company_id=home.company_id and user_id=home.id and archived_at is null;
 for co in select id from talent.companies where catalog_managed and status='ACTIVA' and archived_at is null loop
  insert into talent_org.user_companies(company_id,id,auth_user_id,role,enabled,all_campaigns)
  values(co.id,gen_random_uuid()::text,home.auth_user_id,home.role,home.enabled and home.status='ACTIVO' and home.archived_at is null,true)
  on conflict(company_id,auth_user_id) do update set role=excluded.role,enabled=excluded.enabled,all_campaigns=true,archived_at=null;
  -- org_sync_member creates the company profile with role defaults; replace them with the selected sections.
  update talent.user_modules set archived_at=clock_timestamp() where company_id=co.id and user_id=home.id and archived_at is null and not(module=any(mods));
  insert into talent.user_modules(company_id,id,user_id,module)
  select co.id,home.id||':module:'||m,home.id,m from unnest(mods) m
  on conflict(company_id,user_id,module) do update set archived_at=null;
  insert into talent.tenant_revisions(company_id,revision) values(co.id,1) on conflict(company_id) do update set revision=tenant_revisions.revision+1;
 end loop;
end $$;
revoke all on function talent_private.sync_universal_user(text) from public,anon,authenticated;

create or replace function public.talent_org_user_commit(p_actor uuid,p_company text,p_revision bigint,p_rows jsonb,p_resets text[],p_user text,p_grants jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,talent,talent_org as $$
begin
 if not talent_private.org_global_admin(p_actor) then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended('org:user:'||p_user,0));
 -- Preserve version-checked provisioning, including Auth-linked identity, password rules and audit.
 perform set_config('talent.org_actor','',true);
 perform public.talent_runtime_commit(p_actor,null,p_company,p_revision,p_rows,p_resets);
 if not exists(select 1 from talent.profiles where company_id=p_company and id=p_user and not is_context) then raise exception 'TALENT_USER_NOT_FOUND'; end if;
 update talent.profiles set annotations=annotations||'{"companyAccessManaged":true,"universalCompanyAccess":true}'::jsonb where company_id=p_company and id=p_user;
 perform talent_private.sync_universal_user(p_user);
end $$;
revoke all on function public.talent_org_user_commit(uuid,text,bigint,jsonb,text[],text,jsonb) from public,anon,authenticated;
grant execute on function public.talent_org_user_commit(uuid,text,bigint,jsonb,text[],text,jsonb) to service_role;

-- Future companies also inherit the same role and selected sections, including disabled accounts staying disabled.
create function talent_private.sync_universal_company() returns trigger
language plpgsql security definer set search_path=pg_catalog,talent,talent_org as $$
declare u record;
begin
 if new.catalog_managed and new.status='ACTIVA' and new.archived_at is null then
  for u in select id from talent.profiles where not is_context and annotations->>'universalCompanyAccess'='true' loop
   perform talent_private.sync_universal_user(u.id);
  end loop;
 end if;return new;
end $$;
revoke all on function talent_private.sync_universal_company() from public,anon,authenticated;
create trigger universal_company_access after insert or update of status,catalog_managed,archived_at on talent.companies for each row execute function talent_private.sync_universal_company();
-- Normalize existing accounts without changing their active/inactive state.
do $$ declare u record; begin
 for u in select id from talent.profiles where not is_context and archived_at is null and not exists(select 1 from talent_org.global_admins g where g.auth_user_id=profiles.auth_user_id and g.enabled and g.archived_at is null) loop
  update talent.profiles set annotations=annotations||'{"companyAccessManaged":true,"universalCompanyAccess":true}'::jsonb where id=u.id and not is_context;
  perform talent_private.sync_universal_user(u.id);
 end loop;
end $$;
commit;
