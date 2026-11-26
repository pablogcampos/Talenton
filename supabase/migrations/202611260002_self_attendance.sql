begin;
create table talent_private.attendance_links(id uuid primary key default gen_random_uuid(),company_id text not null,group_id text not null,day_date date not null,token text not null unique,created_by text not null,created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,closed_at timestamptz,foreign key(company_id,group_id) references talent.training_groups(company_id,id));
create index attendance_link_day on talent_private.attendance_links(company_id,group_id,day_date,created_at desc);
create table talent_private.attendance_link_attempts(key text primary key,window_at timestamptz not null,hits integer not null);
create table talent_private.attendance_changes(id uuid primary key default gen_random_uuid(),company_id text not null,attendance_id text not null,before_value jsonb not null,after_value jsonb not null,changed_at timestamptz not null default clock_timestamp());
revoke all on talent_private.attendance_links,talent_private.attendance_link_attempts,talent_private.attendance_changes from public,anon,authenticated,service_role;
create function public.talent_attendance_link_admin(p_actor uuid,p_company text,p_group text,p_date date,p_data jsonb default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a talent.profiles;g talent.training_groups;l talent_private.attendance_links;mins integer;roster jsonb;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 select * into g from talent.training_groups where company_id=p_company and id=p_group and archived_at is null;
 if not found or a.role not in ('ADMIN','JEFE_FORMACION','COORDINADOR_FORMACION','FORMADOR') or not talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended('self-attendance:'||p_company||':'||p_group||':'||p_date,0));
 if p_data->>'action'='CREATE' then
 mins:=(p_data->>'minutes')::integer;
 if mins is null or mins not between 1 and 180 or p_date is distinct from (clock_timestamp() at time zone 'America/Lima')::date or g.status not in ('PROGRAMADA','EN_CAPACITACION','EN_OJT','EXTENSION_OJT') or p_date<g.start_date or p_date>coalesce(g.ojt_end_date,g.theory_end_date)+coalesce(g.extension_days,0) then raise exception 'ATTENDANCE_LINK_INVALID';end if;
 update talent_private.attendance_links set closed_at=clock_timestamp() where company_id=p_company and group_id=p_group and day_date=p_date and closed_at is null;
 insert into talent_private.attendance_links(company_id,group_id,day_date,token,created_by,expires_at) values(p_company,p_group,p_date,replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),a.id,least(clock_timestamp()+make_interval(mins=>mins),(p_date+1)::timestamp at time zone 'America/Lima'));
 elsif p_data->>'action'='CLOSE' then
 update talent_private.attendance_links set closed_at=clock_timestamp() where company_id=p_company and group_id=p_group and day_date=p_date and closed_at is null;
 elsif p_data is not null then raise exception 'ATTENDANCE_LINK_INVALID';end if;
 select * into l from talent_private.attendance_links where company_id=p_company and group_id=p_group and day_date=p_date order by created_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'personId',n.id,'name',n.full_name,'dni',n.document_number,'status',att.status,'markedAt',att.marked_at,'source',case when att.annotations->>'source'='SELF_LINK' then 'Postulante · enlace/QR' when att.id is not null then 'Formador · manual' end,'notes',att.notes,'history',(select coalesce(jsonb_agg(jsonb_build_object('at',h.changed_at,'previous',h.before_value->>'status','status',h.after_value->>'status','reason',h.after_value->>'notes') order by h.changed_at),'[]') from talent_private.attendance_changes h where h.company_id=p_company and h.attendance_id=att.id)) order by n.full_name),'[]') into roster from talent.participants p join talent.applications app on app.company_id=p.company_id and app.id=p.application_id join talent.persons n on n.company_id=app.company_id and n.id=app.person_id left join talent.attendance att on att.company_id=p.company_id and att.participant_id=p.id and att.day_date=p_date and att.archived_at is null where p.company_id=p_company and p.group_id=p_group and p.archived_at is null;
 return jsonb_build_object('serverNow',clock_timestamp(),'link',case when l.id is null then null else jsonb_build_object('token',l.token,'expiresAt',l.expires_at,'closedAt',l.closed_at,'active',l.closed_at is null and l.expires_at>clock_timestamp()) end,'participants',roster);
end $$;
create function public.talent_attendance_link_public(p_token text,p_data jsonb default null,p_hash text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare l talent_private.attendance_links;p talent.participants;g talent.training_groups;a talent.attendance;counted integer;hits integer;now_at timestamptz:=clock_timestamp();dni text;daynum integer;
begin
 select * into l from talent_private.attendance_links where token=p_token for update;
 if not found or l.closed_at is not null or l.expires_at<=clock_timestamp() then return jsonb_build_object('error','ATTENDANCE_LINK_EXPIRED');end if;
 select * into g from talent.training_groups where company_id=l.company_id and id=l.group_id and archived_at is null;
 if not found or g.status not in ('PROGRAMADA','EN_CAPACITACION','EN_OJT','EXTENSION_OJT') then return jsonb_build_object('error','ATTENDANCE_LINK_EXPIRED');end if;
 if p_data is null then return jsonb_build_object('group',g.name,'date',l.day_date,'expiresAt',l.expires_at,'serverNow',clock_timestamp());end if;
 if coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'ATTENDANCE_LINK_INVALID';end if;
 insert into talent_private.attendance_link_attempts values(p_token||':'||p_hash,now_at,1) on conflict(key) do update set hits=case when attendance_link_attempts.window_at<now_at-interval '1 minute' then 1 else attendance_link_attempts.hits+1 end,window_at=case when attendance_link_attempts.window_at<now_at-interval '1 minute' then now_at else attendance_link_attempts.window_at end returning attendance_link_attempts.hits into hits;
 if hits>60 then return jsonb_build_object('error','ATTENDANCE_LINK_RATE_LIMIT');end if;
 dni:=btrim(coalesce(p_data->>'dni',''));if dni !~ '^[0-9]{8}$' then return jsonb_build_object('error','ATTENDANCE_LINK_IDENTITY');end if;
 select count(*) into counted from talent.participants pt join talent.applications app on app.company_id=pt.company_id and app.id=pt.application_id join talent.persons n on n.company_id=app.company_id and n.id=app.person_id where pt.company_id=l.company_id and pt.group_id=l.group_id and pt.archived_at is null and n.document_number=dni and n.archived_at is null and pt.status not in ('DESERTO','NO_APTO','NSP','RETIRADO') and coalesce(pt.annotations#>>'{injection,date}',pt.annotations#>>'{trainingMeta,injection,date}',l.day_date::text)::date<=l.day_date;
 if counted<>1 then return jsonb_build_object('error','ATTENDANCE_LINK_IDENTITY');end if;
 select pt.* into p from talent.participants pt join talent.applications app on app.company_id=pt.company_id and app.id=pt.application_id join talent.persons n on n.company_id=app.company_id and n.id=app.person_id where pt.company_id=l.company_id and pt.group_id=l.group_id and pt.archived_at is null and n.document_number=dni and pt.status not in ('DESERTO','NO_APTO','NSP','RETIRADO') limit 1;
 -- Same lock order as manual runtime commits: daily link, then tenant commit mutex.
 perform pg_advisory_xact_lock(hashtextextended('runtime:'||l.company_id,0));
 select * into a from talent.attendance where company_id=l.company_id and participant_id=p.id and day_date=l.day_date;
 if found then return jsonb_build_object('alreadyRecorded',true,'markedAt',a.marked_at,'status',a.status);end if;
 if l.expires_at<=clock_timestamp() then return jsonb_build_object('error','ATTENDANCE_LINK_EXPIRED');end if;
 daynum:=l.day_date-g.start_date+1;
 insert into talent.training_days(company_id,id,group_id,day_date,phase,day_number,starts_at) values(l.company_id,l.group_id||':day:'||l.day_date,l.group_id,l.day_date,case when g.ojt_start_date is not null and l.day_date>=g.ojt_start_date then 'OJT' else 'TEORIA' end,daynum,l.day_date::timestamp at time zone 'America/Lima') on conflict(company_id,group_id,day_date) do nothing;
 perform set_config('talent.self_attendance',l.id::text,true);
 insert into talent.attendance(company_id,id,group_id,participant_id,day_date,status,marked_by,annotations) values(l.company_id,p.id||':attendance:'||l.day_date,l.group_id,p.id,l.day_date,'PRESENTE',l.created_by,jsonb_build_object('source','SELF_LINK','linkId',l.id,'dayNumber',daynum)) returning * into a;
 perform set_config('talent.self_attendance','',true);
 return jsonb_build_object('alreadyRecorded',false,'markedAt',a.marked_at,'status',a.status);
end $$;
-- Only the private public-registration RPC can authorize a time-limited exception.
do $$declare s text;begin
 s:=pg_get_functiondef('talent_private.attendance_window()'::regprocedure);
 if position('if not (timestamp_now between opens_at and closes_at)' in s)=0 then raise exception 'ATTENDANCE_WINDOW_PATCH_MISMATCH';end if;
 s:=replace(s,'if not (timestamp_now between opens_at and closes_at)', 'if not exists(select 1 from talent_private.attendance_links l where l.id::text=nullif(current_setting(''talent.self_attendance'',true),'''') and l.company_id=new.company_id and l.group_id=new.group_id and l.day_date=new.day_date and l.closed_at is null and l.expires_at>timestamp_now) and not (timestamp_now between opens_at and closes_at)');execute s;
end $$;
alter function talent_private.attendance_window() security definer;
create function talent_private.attendance_change_history() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if old.status is distinct from new.status or coalesce(old.notes,'')<>coalesce(new.notes,'') then
 if old.status is distinct from new.status and length(btrim(coalesce(new.notes,'')))<5 then raise exception 'ATTENDANCE_CORRECTION_REASON';end if;
 new.annotations:=(coalesce(new.annotations,'{}')-'linkId')||jsonb_build_object('source','MANUAL');
 insert into talent_private.attendance_changes(company_id,attendance_id,before_value,after_value) values(new.company_id,new.id,to_jsonb(old),to_jsonb(new));
 end if;return new;
end $$;
create trigger attendance_correction_history before update on talent.attendance for each row execute function talent_private.attendance_change_history();
revoke all on function talent_private.attendance_change_history() from public,anon,authenticated,service_role;
revoke all on function public.talent_attendance_link_admin(uuid,text,text,date,jsonb),public.talent_attendance_link_public(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.talent_attendance_link_admin(uuid,text,text,date,jsonb),public.talent_attendance_link_public(text,jsonb,text) to service_role;
commit;
