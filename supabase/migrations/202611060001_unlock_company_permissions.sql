-- Match attendance approval to effective company membership and campaign scope.
begin;
create or replace function public.talent_unlock_decide(p_actor uuid,p_company text,p_unlock text,p_expected bigint,p_approve boolean,p_reason text,p_expires timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,talent as $$
declare actor talent.profiles; req talent.attendance_unlocks; grp talent.training_groups; revision bigint;
begin
 actor:=talent_private.actor_profile(p_actor,p_company);
 if actor.role not in ('ADMIN','JEFE_FORMACION','COORDINADOR_FORMACION') then raise insufficient_privilege; end if;
 select * into req from talent.attendance_unlocks where company_id=p_company and id=p_unlock for update;
 if not found then raise exception 'TALENT_UNLOCK_NOT_FOUND'; end if;
 select * into grp from talent.training_groups where company_id=p_company and id=req.group_id;
 if grp.archived_at is not null then raise exception 'TALENT_UNLOCK_NOT_FOUND'; end if;
 if exists(select 1 from talent.companies where id=p_company and catalog_managed) then
  if actor.role<>'ADMIN' then
   if not exists(select 1 from talent.user_modules where company_id=p_company and user_id=actor.id and module='FORMACION' and archived_at is null) then raise insufficient_privilege; end if;
   if actor.role='COORDINADOR_FORMACION' and grp.coordinator_id is distinct from actor.id and not exists(
    select 1 from talent.campaigns c where c.company_id=p_company and c.id=grp.campaign_id and c.archived_at is null
    and talent_private.org_campaign_access(p_actor,p_company,c.company_campaign_id)
   ) then raise insufficient_privilege using message='TALENT_CAMPAIGN_FORBIDDEN'; end if;
  end if;
 elsif actor.role='COORDINADOR_FORMACION' and grp.coordinator_id=actor.id then
  if not exists(select 1 from talent.user_modules where company_id=p_company and user_id=actor.id and module='FORMACION' and archived_at is null) then raise insufficient_privilege; end if;
 else perform talent_private.require_campaign(p_actor,p_company,grp.campaign_id,'FORMACION'); end if;
 if p_expected is null or req.version<>p_expected or req.status<>'PENDIENTE' then raise sqlstate 'PT409' using message='TALENT_UNLOCK_CONFLICT'; end if;
 if p_approve is null or p_reason is null or length(btrim(p_reason))=0 or (p_approve and (p_expires is null or p_expires<=clock_timestamp())) then raise exception 'TALENT_INVALID_UNLOCK_DECISION'; end if;
 perform set_config('talent.actor_id',actor.id,true);
 perform set_config('talent.unlock_transition',req.id,true);
 update talent.attendance_unlocks set status=case when p_approve then 'APROBADA' else 'RECHAZADA' end,decided_by=actor.id,decided_at=clock_timestamp(),decision_reason=p_reason,expires_at=case when p_approve then p_expires else null end where company_id=p_company and id=p_unlock returning version into revision;
 perform set_config('talent.unlock_transition','',true); perform set_config('talent.actor_id','',true);
 return revision;
end $$;
revoke all on function public.talent_unlock_decide(uuid,text,text,bigint,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.talent_unlock_decide(uuid,text,text,bigint,boolean,text,timestamptz) to service_role;

commit;
