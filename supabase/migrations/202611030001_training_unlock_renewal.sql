-- Reuse the unique group/day request without bypassing decision permissions.
begin;
create or replace function talent_private.unlock_guard() returns trigger
language plpgsql set search_path=pg_catalog,talent as $$
declare renewing boolean;
begin
 if tg_op='INSERT' and new.status<>'PENDIENTE' then raise exception 'TALENT_UNLOCK_MUST_START_PENDING'; end if;
 if tg_op='UPDATE' then
  renewing := current_setting('talent.unlock_renewal',true)=new.id
    and new.status='PENDIENTE'
    and (old.status='RECHAZADA' or (old.status='APROBADA' and old.expires_at<=clock_timestamp()));
  if new.group_id is distinct from old.group_id or new.day_date is distinct from old.day_date
     or (new.requested_by is distinct from old.requested_by and not coalesce(renewing,false))
    then raise exception 'TALENT_UNLOCK_SCOPE_IMMUTABLE'; end if;
  if new.status is distinct from old.status and not coalesce(renewing,false)
    and (old.status<>'PENDIENTE' or new.status not in ('APROBADA','RECHAZADA')
      or current_setting('talent.unlock_transition',true) is distinct from new.id)
    then raise exception 'TALENT_USE_UNLOCK_RPC'; end if;
 end if;
 if new.status='APROBADA' and (new.expires_at is null or new.decided_at is null or new.decided_by is null or new.expires_at<=new.decided_at)
   then raise exception 'TALENT_UNLOCK_EXPIRY_REQUIRED'; end if;
 return new;
end $$;

create function public.talent_unlock_request(p_actor uuid,p_company text,p_group text,p_day date,p_reason text)
returns text language plpgsql security definer set search_path=pg_catalog,talent as $$
declare actor talent.profiles; grp talent.training_groups; req talent.attendance_unlocks; request_id text; instant timestamptz:=clock_timestamp();
begin
 actor:=talent_private.actor_profile(p_actor,p_company);
 select * into grp from talent.training_groups where company_id=p_company and id=p_group and archived_at is null for update;
 if not found or actor.role<>'FORMADOR' or grp.trainer_id is distinct from actor.id
   or not exists(select 1 from talent.user_modules where company_id=p_company and user_id=actor.id and module='FORMACION' and archived_at is null)
   then raise insufficient_privilege; end if;
 if p_day is null or p_reason is null or length(btrim(p_reason))<5 then raise exception 'TALENT_INVALID_UNLOCK_REASON'; end if;
 if instant<=((p_day::text||' 21:30:00')::timestamp at time zone 'America/Lima') then raise exception 'TALENT_ATTENDANCE_NOT_LOCKED'; end if;
 select * into req from talent.attendance_unlocks where company_id=p_company and group_id=p_group and day_date=p_day for update;
 if found then
  if req.status='PENDIENTE' or (req.status='APROBADA' and req.expires_at>instant) then
   raise sqlstate 'PT409' using message='TALENT_UNLOCK_CONFLICT';
  end if;
  request_id:=req.id;
  perform set_config('talent.actor_id',actor.id,true);
  perform set_config('talent.unlock_renewal',request_id,true);
  update talent.attendance_unlocks set status='PENDIENTE',requested_by=actor.id,reason=btrim(p_reason),
    decided_by=null,decided_at=null,expires_at=null,decision_reason=null,
    annotations=coalesce(annotations,'{}'::jsonb)||jsonb_build_object('requestedAt',instant,
      'audit',coalesce(annotations->'audit','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'action','RENOVADA','at',instant,'by',actor.id,'previousStatus',req.status,'previousExpiresAt',req.expires_at,'reason',p_reason)))
    where company_id=p_company and id=request_id;
  perform set_config('talent.unlock_renewal','',true);
 else
  request_id:=regexp_replace(p_group,'[^a-zA-Z0-9_-]','_','g')||'--'||p_day::text;
  perform set_config('talent.actor_id',actor.id,true);
  insert into talent.training_days(company_id,id,group_id,day_date,phase,day_number,starts_at)
   values(p_company,p_group||':day:'||p_day::text,p_group,p_day,
     case when grp.ojt_start_date is not null and p_day>=grp.ojt_start_date then 'OJT' else 'TEORIA' end,
     greatest(1,p_day-grp.start_date+1),
     (p_day+coalesce(grp.start_time,substring(grp.schedule from '[0-9]{2}:[0-9]{2}')::time,time '09:00')) at time zone 'America/Lima')
   on conflict(company_id,group_id,day_date) do nothing;
  insert into talent.attendance_unlocks(company_id,id,group_id,day_date,requested_by,reason,status,annotations)
   values(p_company,request_id,p_group,p_day,actor.id,btrim(p_reason),'PENDIENTE',
     jsonb_build_object('requestedAt',instant,'audit',jsonb_build_array(jsonb_build_object('action','SOLICITADA','at',instant,'by',actor.id,'reason',p_reason))));
 end if;
 perform set_config('talent.actor_id','',true);
 return request_id;
end $$;
revoke all on function public.talent_unlock_request(uuid,text,text,date,text) from public,anon,authenticated;
grant execute on function public.talent_unlock_request(uuid,text,text,date,text) to service_role;
revoke all on function talent_private.unlock_guard() from public,anon,authenticated,service_role;
commit;
