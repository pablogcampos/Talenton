begin;
alter table talent_offers.templates add column workday text check(workday in ('FULL_TIME','SEMI_FULL','PART_TIME'));
create index offers_template_workday on talent_offers.templates(company_id,company_campaign_id,workday,created_at desc);
create table talent_offers.workday_groups(
 company_id text not null,group_id text not null,assigned_by text not null,assigned_at timestamptz not null default now(),
 primary key(company_id,group_id),foreign key(company_id,group_id) references talent.training_groups(company_id,id));
alter table talent_offers.workday_groups enable row level security;
revoke all on talent_offers.workday_groups from public,anon,authenticated;

create function talent_offers.normalize_workday(value text) returns text language sql immutable set search_path=pg_catalog as $$
 select case regexp_replace(lower(coalesce(value,'')),'[^a-z]','','g')
 when 'fulltime' then 'FULL_TIME' when 'full' then 'FULL_TIME'
 when 'semifull' then 'SEMI_FULL' when 'semiful' then 'SEMI_FULL'
 when 'parttime' then 'PART_TIME' when 'part' then 'PART_TIME' else null end
$$;
create function talent_offers.person_workday(p_company text,p_person text,p_campaign text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,talent as $$
declare raw text;source text;catalog text;
begin
 select company_campaign_id into catalog from talent.campaigns where company_id=p_company and id=p_campaign;
 select coalesce(c.annotations#>>'{applicant,formSubmission,answers,workday}',c.annotations#>>'{applicant,techCenterAnswers,workday}'),'Formulario'
 into raw,source from talent.captures c
 where c.company_id=p_company and c.person_id=p_person and c.archived_at is null and not c.conflict
 and (coalesce(c.annotations#>>'{applicant,techCenterAnswers,preferredCampaignId}','') in ('',coalesce(catalog,''),p_campaign))
 and nullif(btrim(coalesce(c.annotations#>>'{applicant,formSubmission,answers,workday}',c.annotations#>>'{applicant,techCenterAnswers,workday}')),'') is not null
 order by c.received_at desc,c.id desc limit 1;
 if raw is null then
 select annotations->>'workSchedule','Perfil del candidato' into raw,source from talent.persons where company_id=p_company and id=p_person;
 end if;
 return jsonb_build_object('workday',talent_offers.normalize_workday(raw),'raw',raw,'source',source);
end $$;

create function public.talent_offer_create_workday(p_actor uuid,p_company text,p_campaign text,p_title text,p_content text,p_workday text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare result uuid;
begin
 if p_workday is null or p_workday not in ('FULL_TIME','SEMI_FULL','PART_TIME') then raise exception 'OFFER_INVALID_WORKDAY';end if;
 result:=public.talent_offer_create(p_actor,p_company,p_campaign,p_title,p_content);
 update talent_offers.templates set workday=p_workday where id=result;
 return result;
end $$;

-- Legacy group assignments remain readable, but cannot override jornada routing.
alter function talent_offers.issue(text,text) rename to issue_legacy;
create function talent_offers.issue(p_company text,p_group text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from talent_offers.workday_groups where company_id=p_company and group_id=p_group) then return;end if;
 perform talent_offers.issue_legacy(p_company,p_group);
end $$;
alter function public.talent_offer_assign(uuid,text,text,uuid) rename to talent_offer_assign_legacy;
create function public.talent_offer_assign(p_actor uuid,p_company text,p_group text,p_template uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from talent.training_groups where company_id=p_company and id=p_group for update;
 if exists(select 1 from talent_offers.workday_groups where company_id=p_company and group_id=p_group)
 or exists(select 1 from talent_offers.templates where id=p_template and workday is not null) then raise exception 'OFFER_USE_WORKDAY_ASSIGNMENT';end if;
 return public.talent_offer_assign_legacy(p_actor,p_company,p_group,p_template);
end $$;
revoke all on function public.talent_offer_assign_legacy(uuid,text,text,uuid) from public,anon,authenticated,service_role;

create function public.talent_offer_workday_plan(p_actor uuid,p_company text,p_group text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,talent,talent_offers as $$
declare a talent.profiles;g talent.training_groups;catalog text;rows jsonb;
begin
 a:=talent_private.actor_profile(p_actor,p_company);
 select * into g from talent.training_groups where company_id=p_company and id=p_group and archived_at is null;
 if not found or a.role not in ('ADMIN','RECLUTADOR') or not talent_offers.allowed(p_actor,p_company,g.campaign_id,g.id) then raise insufficient_privilege;end if;
 if g.status not in ('PENDIENTE_ASIGNACION','PROGRAMADA','EN_CAPACITACION') then raise exception 'OFFER_STAGE_CLOSED';end if;
 select company_campaign_id into catalog from talent.campaigns where company_id=p_company and id=g.campaign_id;
 select coalesce(jsonb_agg(jsonb_build_object(
 'participantId',p.id,'name',n.full_name,'workday',w.value->>'workday','raw',w.value->>'raw','source',w.value->>'source',
 'templateId',t.id,'title',t.title,'documentId',d.id,
 'status',case when d.signed_at is not null then 'SIGNED'
 when w.value->>'workday' is null then 'MISSING_WORKDAY'
 when t.id is null then 'MISSING_TEMPLATE'
 when d.template_id=t.id then 'ASSIGNED'
 when exists(select 1 from talent_offers.documents old where old.company_id=p_company and old.group_id=p_group and old.participant_id=p.id and old.template_id=t.id and old.revoked_at is not null) then 'REVOKED_VERSION'
 else 'READY' end) order by p.id),'[]') into rows
 from talent.participants p join talent.applications app on app.company_id=p.company_id and app.id=p.application_id
 join talent.persons n on n.company_id=app.company_id and n.id=app.person_id
 cross join lateral (select talent_offers.person_workday(p_company,n.id,g.campaign_id) value) w
 left join lateral (select * from talent_offers.templates tt where tt.company_id=p_company
 and (tt.campaign_id=g.campaign_id or tt.company_campaign_id=catalog) and tt.workday=w.value->>'workday'
 order by tt.created_at desc,tt.id desc limit 1) t on true
 left join lateral (select * from talent_offers.documents dd where dd.company_id=p_company and dd.group_id=p_group and dd.participant_id=p.id and dd.revoked_at is null order by dd.signed_at desc nulls last,dd.created_at desc,dd.id desc limit 1) d on true
 where p.company_id=p_company and p.group_id=p_group;
 return jsonb_build_object('participants',rows,'hash',encode(sha256(convert_to(rows::text,'UTF8')),'hex'));
end $$;

create function public.talent_offer_assign_workdays(p_actor uuid,p_company text,p_group text,p_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,talent,talent_offers as $$
declare plan jsonb;item jsonb;a talent.profiles;r record;t talent_offers.templates;s jsonb;assigned integer:=0;
begin
 perform 1 from talent.training_groups where company_id=p_company and id=p_group for update;
 -- Lock the exact sources while validating and issuing the reviewed plan.
 perform 1 from talent.participants where company_id=p_company and group_id=p_group for share;
 perform 1 from talent.persons n join talent.applications app on app.company_id=n.company_id and app.person_id=n.id join talent.participants p on p.company_id=app.company_id and p.application_id=app.id where p.company_id=p_company and p.group_id=p_group for share of n,app;
 plan:=public.talent_offer_workday_plan(p_actor,p_company,p_group);
 if p_hash is distinct from plan->>'hash' then raise exception 'OFFER_PLAN_CHANGED';end if;
 a:=talent_private.actor_profile(p_actor,p_company);
 insert into talent_offers.workday_groups(company_id,group_id,assigned_by) values(p_company,p_group,a.id)
 on conflict(company_id,group_id) do update set assigned_by=excluded.assigned_by,assigned_at=now();
 for item in select value from jsonb_array_elements(plan->'participants') loop
 if item->>'status' in ('MISSING_WORKDAY','MISSING_TEMPLATE','REVOKED_VERSION') then
 -- Never leave an incompatible unsigned link active after the mass assignment.
 update talent_offers.documents set revoked_at=now() where company_id=p_company and group_id=p_group and participant_id=item->>'participantId' and signed_at is null and revoked_at is null;
 elsif item->>'status'='READY' then
 select * into t from talent_offers.templates where id=(item->>'templateId')::uuid;
 select n.full_name,n.document_number,g.name group_name,c.title campaign_name,co.name company_name,g.theory_days,g.start_date,g.theory_end_date
 into r from talent.participants p join talent.applications app on app.company_id=p.company_id and app.id=p.application_id
 join talent.persons n on n.company_id=app.company_id and n.id=app.person_id
 join talent.training_groups g on g.company_id=p.company_id and g.id=p.group_id
 join talent.campaigns c on c.company_id=g.company_id and c.id=g.campaign_id join talent.companies co on co.id=p.company_id
 where p.company_id=p_company and p.id=item->>'participantId' and p.group_id=p_group;
 s:=jsonb_build_object('name',r.full_name,'dni',r.document_number,'company',r.company_name,'campaign',r.campaign_name,'group',r.group_name,
 'days',r.theory_days,'startDate',r.start_date,'endDate',r.theory_end_date,'title',t.title,
 'workday',t.workday,'workdaySource',item->>'source','workdayDeclared',item->>'raw',
 'content',replace(replace(replace(t.content,'{{nombre}}',r.full_name),'{{empresa}}',r.company_name),'{{campaña}}',r.campaign_name));
 update talent_offers.documents set revoked_at=now() where company_id=p_company and group_id=p_group and participant_id=item->>'participantId' and signed_at is null and revoked_at is null;
 insert into talent_offers.documents(company_id,group_id,participant_id,template_id,snapshot,content_hash)
 values(p_company,p_group,item->>'participantId',t.id,s,encode(sha256(convert_to(s::text,'UTF8')),'hex'));
 assigned:=assigned+1;
 end if;
 end loop;
 return public.talent_offer_workday_plan(p_actor,p_company,p_group)||jsonb_build_object('assigned',assigned);
end $$;
revoke all on all functions in schema talent_offers from public,anon,authenticated;
revoke all on function public.talent_offer_create_workday(uuid,text,text,text,text,text),public.talent_offer_assign(uuid,text,text,uuid),public.talent_offer_workday_plan(uuid,text,text),public.talent_offer_assign_workdays(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.talent_offer_create_workday(uuid,text,text,text,text,text),public.talent_offer_assign(uuid,text,text,uuid),public.talent_offer_workday_plan(uuid,text,text),public.talent_offer_assign_workdays(uuid,text,text,text) to service_role;
commit;
