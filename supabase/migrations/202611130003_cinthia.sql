begin;
-- CinthIA is sourced exclusively from the shared Voicebot inbox.
create table public.cinthia_invitations (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.voicebot_leads(id) on delete restrict,
 token text not null unique check(token ~ '^[a-f0-9]{64}$'),
 prepared_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 status text not null default 'PREPARED' check(status in ('PREPARED','PENDING','IN_PROGRESS','COMPLETED','EXPIRED','CANCELLED')),
 sent_at timestamptz, sent_by uuid references auth.users(id),
 started_at timestamptz, completed_at timestamptz,
 updated_at timestamptz not null default now(),
 test_mode boolean not null default false,
 ai_session_id text, transcript_ref text, result_ref text,
 consent_at timestamptz, consent_version text,
 check(expires_at>created_at),
 check(status<>'COMPLETED' or (completed_at is not null and started_at is not null))
);
create unique index cinthia_one_active_per_lead on public.cinthia_invitations(lead_id) where status in ('PREPARED','PENDING','IN_PROGRESS');
create index cinthia_lead_history on public.cinthia_invitations(lead_id,created_at desc);
create index cinthia_expiry on public.cinthia_invitations(expires_at) where status in ('PREPARED','PENDING','IN_PROGRESS');
create table public.cinthia_events (
 id uuid primary key default gen_random_uuid(),
 invitation_id uuid not null references public.cinthia_invitations(id) on delete restrict,
 actor_id uuid references auth.users(id),
 action text not null check(action in ('PREPARED','WHATSAPP_OPENED','SENT','STARTED','COMPLETED','EXPIRED','CANCELLED')),
 created_at timestamptz not null default now()
);
create index cinthia_events_invitation on public.cinthia_events(invitation_id,created_at);
alter table public.cinthia_invitations enable row level security;
alter table public.cinthia_events enable row level security;
revoke all on public.cinthia_invitations,public.cinthia_events from public,anon,authenticated;

create function public.talent_cinthia_expire() returns void
language sql security definer set search_path=pg_catalog,public as $$
 with expired as (update public.cinthia_invitations set status='EXPIRED',updated_at=clock_timestamp()
 where status in ('PREPARED','PENDING','IN_PROGRESS') and expires_at<=now() returning id)
 insert into public.cinthia_events(invitation_id,action) select id,'EXPIRED' from expired;
$$;
create function public.talent_cinthia_manage(p_actor uuid,p_lead uuid,p_action text,p_token text default null,p_test boolean default false,p_invitation uuid default null,p_operational boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.voicebot_leads; inv public.cinthia_invitations;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 select * into l from public.voicebot_leads where id=p_lead for update;
 if not found then raise exception 'CINTHIA_NOT_FOUND'; end if;
 if l.owner_auth_id is not null and l.owner_auth_id<>p_actor and not public.talent_voicebot_has_role(p_actor,array['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION']) then raise insufficient_privilege; end if;
 perform public.talent_cinthia_expire();
 select * into inv from public.cinthia_invitations where lead_id=p_lead order by created_at desc,id desc limit 1 for update;
 if p_action='PREPARE' then
  -- No production provider is configured in phases 1/2. Caller is a trusted Worker.
  if p_test is distinct from true and p_operational is distinct from true then raise exception 'CINTHIA_UNAVAILABLE'; end if;
  if coalesce(public.talent_voicebot_phone_key(l.phone),'') !~ '^[0-9]{7,15}$' then raise exception 'CINTHIA_PHONE_REQUIRED'; end if;
  if inv.status in ('PREPARED','PENDING','IN_PROGRESS','COMPLETED') then return to_jsonb(inv); end if;
  if inv.status='CANCELLED' then raise exception 'CINTHIA_INVALID_STATE'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'CINTHIA_INVALID'; end if;
  insert into public.cinthia_invitations(lead_id,token,prepared_by,test_mode) values(p_lead,p_token,p_actor,p_test) returning * into inv;
  insert into public.cinthia_events(invitation_id,actor_id,action) values(inv.id,p_actor,'PREPARED');
 elsif p_action in ('WHATSAPP_OPENED','SENT','CANCELLED') then
  if p_invitation is distinct from inv.id then raise exception 'CINTHIA_INVALID_STATE'; end if;
  if inv.id is null or inv.status not in ('PREPARED','PENDING','IN_PROGRESS') then raise exception 'CINTHIA_INVALID_STATE'; end if;
  if inv.test_mode and p_test is distinct from true and p_action<>'CANCELLED' then raise exception 'CINTHIA_UNAVAILABLE'; end if;
  if p_action='SENT' then
   if inv.status='PENDING' then return to_jsonb(inv); end if;
   if inv.status<>'PREPARED' then raise exception 'CINTHIA_INVALID_STATE'; end if;
   update public.cinthia_invitations set status='PENDING',sent_at=now(),sent_by=p_actor,updated_at=now() where id=inv.id returning * into inv;
  elsif p_action='CANCELLED' then
   update public.cinthia_invitations set status='CANCELLED',updated_at=now() where id=inv.id returning * into inv;
  elsif inv.status not in ('PREPARED','PENDING') then raise exception 'CINTHIA_INVALID_STATE';
  end if;
  insert into public.cinthia_events(invitation_id,actor_id,action) values(inv.id,p_actor,p_action);
 else raise exception 'CINTHIA_INVALID'; end if;
 return to_jsonb(inv);
end $$;

create function public.talent_cinthia_list(p_actor uuid,p_filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; f_state text:=coalesce(p_filters->>'state',''); f_search text:=btrim(coalesce(p_filters->>'search',''));
 f_owner uuid:=nullif(p_filters->>'owner','')::uuid; f_page integer:=coalesce((p_filters->>'page')::integer,0);
 f_from date:=nullif(p_filters->>'from','')::date; f_to date:=nullif(p_filters->>'to','')::date;
 f_interview_from date:=nullif(p_filters->>'interviewFrom','')::date; f_interview_to date:=nullif(p_filters->>'interviewTo','')::date;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 if f_owner is not null and f_owner<>p_actor and not public.talent_voicebot_has_role(p_actor,array['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION']) then raise insufficient_privilege; end if;
 if f_page not between 0 and 100000 or length(f_search)>200 or f_state not in ('','NOT_SENT','PREPARED','PENDING','IN_PROGRESS','COMPLETED','CLOSED') or f_from>f_to or f_interview_from>f_interview_to then raise exception 'CINTHIA_INVALID'; end if;
 perform public.talent_cinthia_expire();
 with base as (
 select l.id,l.full_name,l.phone,l.received_at,l.owner_auth_id,l.owner_name,
 coalesce(i.status,'NOT_SENT') state,i.updated_at,i.started_at,i.id invitation_id,i.test_mode,
 (l.owner_auth_id is null or l.owner_auth_id=p_actor or public.talent_voicebot_has_role(p_actor,array['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION'])) can_manage
 from public.voicebot_leads l left join lateral(select * from public.cinthia_invitations where lead_id=l.id order by created_at desc,id desc limit 1)i on true
 where (f_owner is null or l.owner_auth_id=f_owner)
 and (f_from is null or l.received_at>=f_from::timestamp at time zone 'America/Lima')
 and (f_to is null or l.received_at<(f_to+1)::timestamp at time zone 'America/Lima')
 and (f_interview_from is null or i.started_at>=f_interview_from::timestamp at time zone 'America/Lima')
 and (f_interview_to is null or i.started_at<(f_interview_to+1)::timestamp at time zone 'America/Lima')
 and (f_search='' or strpos(lower(l.full_name||' '||l.phone||' '||coalesce(l.payload->>'dni',l.payload->>'DNI','')),lower(f_search))>0)
 ), filtered as (select * from base where f_state='' or state=f_state or f_state='CLOSED' and state in ('EXPIRED','CANCELLED'))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by received_at desc,id desc) from (select * from filtered order by received_at desc,id desc limit 50 offset f_page*50)r),'[]'),
 'total',(select count(*) from filtered),'counts',(select jsonb_object_agg(state,n) from(select state,count(*) n from base group by state)c),
 'metrics',(select jsonb_build_object('available',count(*),'pending',count(*) filter(where state in ('PREPARED','PENDING')),'active',count(*) filter(where state='IN_PROGRESS'),'completed',count(*) filter(where state='COMPLETED')) from filtered),
 'canFilterOwner',public.talent_voicebot_has_role(p_actor,array['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION']),
 'recruiters',case when public.talent_voicebot_has_role(p_actor,array['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION']) then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from(select distinct owner_auth_id id,owner_name name from public.voicebot_leads where owner_auth_id is not null)r),'[]'::jsonb) else '[]'::jsonb end,
 'serverTime',now()) into result;
 return result;
end $$;
create function public.talent_cinthia_detail(p_actor uuid,p_lead uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.voicebot_leads;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 select * into l from public.voicebot_leads where id=p_lead;
 if not found then raise exception 'CINTHIA_NOT_FOUND'; end if;
 perform public.talent_cinthia_expire();
 return jsonb_build_object('lead',to_jsonb(l),'invitations',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('prepared_name',(select display_name from talent.profiles where auth_user_id=i.prepared_by and not is_context limit 1),'sent_name',(select display_name from talent.profiles where auth_user_id=i.sent_by and not is_context limit 1)) order by created_at desc,id desc) from public.cinthia_invitations i where lead_id=p_lead),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('actor_name',(select display_name from talent.profiles where auth_user_id=e.actor_id and not is_context limit 1)) order by created_at,id) from public.cinthia_events e where invitation_id in (select id from public.cinthia_invitations where lead_id=p_lead)),'[]'),
 'can_manage',l.owner_auth_id is null or l.owner_auth_id=p_actor or public.talent_voicebot_has_role(p_actor,array['ADMIN','JEFE_SELECCION','ANALISTA_SELECCION']));
end $$;
create function public.talent_cinthia_public(p_token text,p_test boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare inv public.cinthia_invitations;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'CINTHIA_NOT_FOUND'; end if;
 perform public.talent_cinthia_expire();
 select * into inv from public.cinthia_invitations where token=p_token;
 if not found or inv.test_mode and p_test is distinct from true then raise exception 'CINTHIA_NOT_FOUND'; end if;
 -- No lead PII, history, internal identifiers, or results are returned publicly.
 return jsonb_build_object('status',inv.status,'expires_at',inv.expires_at,'completed_at',inv.completed_at,'test_mode',inv.test_mode,'serviceAvailable',false);
end $$;
revoke all on function public.talent_cinthia_expire(),public.talent_cinthia_manage(uuid,uuid,text,text,boolean,uuid,boolean),public.talent_cinthia_list(uuid,jsonb),public.talent_cinthia_detail(uuid,uuid),public.talent_cinthia_public(text,boolean) from public,anon,authenticated;
grant execute on function public.talent_cinthia_manage(uuid,uuid,text,text,boolean,uuid,boolean),public.talent_cinthia_list(uuid,jsonb),public.talent_cinthia_detail(uuid,uuid),public.talent_cinthia_public(text,boolean) to service_role;
commit;
