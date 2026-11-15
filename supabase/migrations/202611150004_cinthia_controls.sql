begin;
create table public.cinthia_runtime_settings (
 id boolean primary key default true check(id),revision integer not null default 1,
 config jsonb not null default '{"voice":"Kore","maxMinutes":20,"maxFollowups":2,"instructions":"Mantén una conversación natural, profesional y respetuosa.","retentionDays":365,"retentionEnforced":false}',
 updated_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
insert into public.cinthia_runtime_settings(id) values(true);
alter table public.cinthia_runtime_settings enable row level security;
revoke all on public.cinthia_runtime_settings from public,anon,authenticated;
create function public.talent_cinthia_runtime(p_actor uuid,p_config jsonb default null,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.cinthia_runtime_settings;admin boolean;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege;end if;
 admin:=public.talent_voicebot_has_role(p_actor,array['ADMIN']);
 select * into s from public.cinthia_runtime_settings where id=true for update;
 if p_config is not null then
  if not admin then raise insufficient_privilege;end if;
  if s.revision is distinct from p_revision then raise exception 'CINTHIA_CONFLICT';end if;
  if p_config->>'voice' not in ('Kore','Aoede','Puck','Charon','Fenrir') or (p_config->>'maxMinutes')::integer not between 3 and 20 or (p_config->>'maxFollowups')::integer not between 0 and 2 or length(p_config->>'instructions')>4000 or (p_config->>'retentionDays')::integer not between 30 and 3650 then raise exception 'CINTHIA_INVALID';end if;
  update public.cinthia_runtime_settings set config=p_config||'{"retentionEnforced":false}'::jsonb,revision=revision+1,updated_by=p_actor,updated_at=now() where id=true returning * into s;
  insert into public.cinthia_evaluation_audit(actor_id,action) values(p_actor,'RUNTIME_SETTINGS');
 end if;
 return to_jsonb(s)||jsonb_build_object('canEdit',admin);
end $$;
-- Add session controls without rewriting the legacy session procedure or changing its lease protocol.
alter table public.cinthia_sessions add column runtime_config jsonb;
create function public.talent_cinthia_runtime_snapshot() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare c jsonb;
begin
 select config into c from public.cinthia_runtime_settings where id=true;
 if tg_op='INSERT' then new.runtime_config:=c;
 elsif new.runtime_config is null then return new;
 else c:=new.runtime_config;end if;
 if new.evaluation_config is not null and (tg_op='INSERT' or new.deadline is distinct from old.deadline) then
  new.deadline:=now()+make_interval(mins=>least((c->>'maxMinutes')::integer,(new.evaluation_config->>'minutes')::integer));
 end if;
 return new;
end $$;
create trigger zz_cinthia_runtime_snapshot before insert or update on public.cinthia_sessions for each row execute function public.talent_cinthia_runtime_snapshot();

create function public.talent_cinthia_test_history(p_actor uuid,p_evaluation uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.cinthia_evaluations;
begin
 select * into e from public.cinthia_evaluations where id=p_evaluation;
 if not public.talent_cinthia_evaluation_access(p_actor,e.company_id,true) or (e.campaign_id is not null and not talent_offers.allowed(p_actor,e.company_id,e.campaign_id)) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'status',i.status,'version',v.number,'session',jsonb_build_object('transcript',s.transcript,'completed_at',s.completed_at),'report',to_jsonb(r)) order by i.created_at desc)
 from public.cinthia_invitations i join public.cinthia_evaluation_versions v on v.id=i.evaluation_version_id left join public.cinthia_sessions s on s.invitation_id=i.id left join public.cinthia_results r on r.session_id=s.id where v.evaluation_id=e.id and i.evaluation_test and i.prepared_by=p_actor),'[]');
end $$;
create function public.talent_cinthia_public_metadata(p_token text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select case when v.id is null then '{}'::jsonb else jsonb_build_object('evaluationName',v.config->>'name','minutes',least((v.config->>'minutes')::integer,(r.config->>'maxMinutes')::integer),'evaluationTest',i.evaluation_test) end
 from public.cinthia_invitations i left join public.cinthia_evaluation_versions v on v.id=i.evaluation_version_id cross join public.cinthia_runtime_settings r where i.token=p_token;
$$;
revoke all on function public.talent_cinthia_runtime(uuid,jsonb,integer),public.talent_cinthia_test_history(uuid,uuid),public.talent_cinthia_public_metadata(text) from public,anon,authenticated;
grant execute on function public.talent_cinthia_runtime(uuid,jsonb,integer),public.talent_cinthia_test_history(uuid,uuid),public.talent_cinthia_public_metadata(text) to service_role;
commit;
