begin;
-- No campaign-scoped evaluation existed when this correction was prepared.
-- Refuse to reinterpret existing identifiers silently.
do $$ begin
 if exists(select 1 from public.cinthia_evaluations where campaign_id is not null) then
  raise exception 'CINTHIA_CAMPAIGN_MIGRATION_REVIEW_REQUIRED';
 end if;
end $$;
alter table public.cinthia_evaluations drop constraint cinthia_evaluations_company_id_campaign_id_fkey;
alter table public.cinthia_evaluations add constraint cinthia_evaluation_catalog_campaign_fk foreign key(company_id,campaign_id) references talent_org.company_campaigns(company_id,id);

create function public.talent_cinthia_catalog_campaign_access(p_actor uuid,p_company text,p_campaign text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public,talent,talent_org as $$
declare a talent.profiles;
begin
 if not public.talent_cinthia_evaluation_access(p_actor,p_company) then return false;end if;
 if not exists(select 1 from talent_org.company_campaigns c join talent_org.global_campaigns g on g.id=c.global_campaign_id where c.company_id=p_company and c.id=p_campaign and c.status='ACTIVA' and c.archived_at is null and g.status='ACTIVA' and g.archived_at is null) then return false;end if;
 if exists(select 1 from talent.companies where id=p_company and catalog_managed) then return talent_private.org_campaign_access(p_actor,p_company,p_campaign);end if;
 a:=talent_private.actor_profile(p_actor,p_company);
 return a.role in ('ADMIN','JEFE_SELECCION') or exists(select 1 from talent.campaigns c where c.company_id=p_company and c.company_campaign_id=p_campaign and c.archived_at is null and talent_offers.allowed(p_actor,p_company,c.id));
exception when insufficient_privilege then return false;
end $$;
revoke all on function public.talent_cinthia_catalog_campaign_access(uuid,text,text) from public,anon,authenticated;

create or replace function public.talent_cinthia_catalog(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,talent as $$
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege;end if;
 return jsonb_build_object(
 'companies',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'canWrite',public.talent_cinthia_evaluation_access(p_actor,c.id,true))) from talent.companies c where c.archived_at is null and public.talent_cinthia_evaluation_access(p_actor,c.id)),'[]'),
 'campaigns',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'companyId',c.company_id,'name',g.name) order by g.name) from talent_org.company_campaigns c join talent_org.global_campaigns g on g.id=c.global_campaign_id where public.talent_cinthia_catalog_campaign_access(p_actor,c.company_id,c.id)),'[]'),
 'items',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('versions',(select jsonb_agg(to_jsonb(v) order by v.number desc) from public.cinthia_evaluation_versions v where v.evaluation_id=e.id)) order by e.updated_at desc) from public.cinthia_evaluations e where public.talent_cinthia_evaluation_access(p_actor,e.company_id) and (e.campaign_id is null or public.talent_cinthia_catalog_campaign_access(p_actor,e.company_id,e.campaign_id))),'[]'),
 'bank',coalesce((select jsonb_agg(to_jsonb(b) order by b.name) from public.cinthia_competency_bank b where public.talent_cinthia_evaluation_access(p_actor,b.company_id)),'[]'));
end $$;

create or replace function public.talent_cinthia_evaluation_save(p_actor uuid,p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.cinthia_evaluations;v public.cinthia_evaluation_versions;c jsonb:=p_data->'config';company text;campaign text;
begin
 if p_id is not null then select * into e from public.cinthia_evaluations where id=p_id for update;if not found then raise exception 'CINTHIA_NOT_FOUND';end if;end if;
 company:=coalesce(e.company_id,c->>'companyId',p_data->>'companyId');
 if not public.talent_cinthia_evaluation_access(p_actor,company,true) then raise insufficient_privilege;end if;
 if e.campaign_id is not null and not public.talent_cinthia_catalog_campaign_access(p_actor,company,e.campaign_id) then raise insufficient_privilege;end if;
 if p_action='BANK' then
  if length(btrim(p_data->>'name')) not between 1 and 150 or jsonb_typeof(p_data->'content')<>'object' then raise exception 'CINTHIA_INVALID';end if;
  insert into public.cinthia_competency_bank(company_id,name,category,content,updated_by) values(company,p_data->>'name',coalesce(p_data->>'category','General'),p_data->'content',p_actor);
  return jsonb_build_object('saved',true);
 end if;
 if p_action in ('SAVE','DUPLICATE') then
  if jsonb_typeof(c) is distinct from 'object' or length(btrim(c->>'name')) not between 1 and 150 or c->>'companyId' is distinct from company then raise exception 'CINTHIA_INVALID';end if;
  campaign:=nullif(c->>'campaignId','');
  if p_action='SAVE' and e.id is not null and campaign is distinct from e.campaign_id and exists(select 1 from public.cinthia_evaluation_versions where evaluation_id=e.id and published_at is not null) then raise exception 'CINTHIA_DUPLICATE_FOR_CAMPAIGN';end if;
  if campaign is not null and not public.talent_cinthia_catalog_campaign_access(p_actor,company,campaign) then raise insufficient_privilege;end if;
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

create or replace function public.talent_cinthia_assign(p_actor uuid,p_version uuid,p_token text,p_person text default null,p_lead uuid default null,p_test boolean default false,p_repeat boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare v public.cinthia_evaluation_versions;e public.cinthia_evaluations;i public.cinthia_invitations;app talent.applications;l public.voicebot_leads;
begin
 select * into v from public.cinthia_evaluation_versions where id=p_version for share;
 select * into e from public.cinthia_evaluations where id=v.evaluation_id for share;
 if e.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;
 if p_test then
  if not public.talent_cinthia_evaluation_access(p_actor,e.company_id,true) then raise insufficient_privilege;end if;
  p_person:=null;p_lead:=null;
 else
  if v.published_at is null or e.status<>'PUBLISHED' then raise exception 'CINTHIA_INVALID_STATE';end if;
  if not public.talent_cinthia_subject_access(p_actor,e.company_id,p_person,p_lead) then raise insufficient_privilege;end if;
 end if;
 if e.campaign_id is not null and not public.talent_cinthia_catalog_campaign_access(p_actor,e.company_id,e.campaign_id) then raise insufficient_privilege;end if;
 if p_lead is not null then
  select * into l from public.voicebot_leads where id=p_lead for update;
  if l.candidate_company_id=e.company_id then p_person:=l.candidate_id;end if;
 elsif p_person is not null then perform 1 from talent.persons where company_id=e.company_id and id=p_person for update;
 end if;
 if p_person is not null then
  select * into app from talent.applications where company_id=e.company_id and person_id=p_person and status='ACTIVA' and archived_at is null and (e.campaign_id is null or campaign_id in (select c.id from talent.campaigns c where c.company_id=e.company_id and c.company_campaign_id=e.campaign_id and c.archived_at is null)) order by created_at desc limit 1;
  if e.campaign_id is not null and app.id is null then raise exception 'CINTHIA_CAMPAIGN_MISMATCH';end if;
 end if;
 if not p_test then
  select * into i from public.cinthia_invitations where evaluation_version_id=v.id and not evaluation_test and (lead_id=p_lead or (company_id=e.company_id and person_id=p_person)) and status in ('PREPARED','PENDING','IN_PROGRESS') order by created_at desc limit 1;
  if i.id is not null then return to_jsonb(i);end if;
  if exists(select 1 from public.cinthia_invitations where evaluation_version_id=v.id and (lead_id=p_lead or (company_id=e.company_id and person_id=p_person)) and status='COMPLETED') and (not p_repeat or not public.talent_cinthia_evaluation_access(p_actor,e.company_id,true)) then raise exception 'CINTHIA_REPEAT_AUTH_REQUIRED';end if;
 end if;
 insert into public.cinthia_invitations(lead_id,person_id,application_id,company_id,evaluation_version_id,evaluation_test,token,prepared_by)
 values(p_lead,p_person,app.id,e.company_id,v.id,p_test,p_token,p_actor) returning * into i;
 insert into public.cinthia_events(invitation_id,actor_id,action) values(i.id,p_actor,'PREPARED');
 insert into public.cinthia_evaluation_audit(evaluation_id,actor_id,action,version_id) values(e.id,p_actor,case when p_test then 'TEST' else 'ASSIGN' end,v.id);
 return to_jsonb(i);
end $$;

create or replace function public.talent_cinthia_subject(p_actor uuid,p_company text,p_person text default null,p_lead uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.talent_cinthia_subject_access(p_actor,p_company,p_person,p_lead) then raise insufficient_privilege;end if;
 perform public.talent_cinthia_expire();
 return coalesce((select jsonb_agg(jsonb_build_object('invitation',to_jsonb(i),'evaluation',e.name,'version',v.number,'config',coalesce(s.evaluation_config,v.config),
 'session',case when s.id is null then null else jsonb_build_object('id',s.id,'state',s.state,'started_at',s.started_at,'completed_at',s.completed_at,'duration_seconds',s.duration_seconds,'transcript',s.transcript) end,
 'report',to_jsonb(r),'reviews',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.cinthia_human_reviews h where h.invitation_id=i.id),'[]')) order by i.created_at desc)
 from public.cinthia_invitations i left join public.cinthia_evaluation_versions v on v.id=i.evaluation_version_id left join public.cinthia_evaluations e on e.id=v.evaluation_id
 left join public.cinthia_sessions s on s.invitation_id=i.id left join public.cinthia_results r on r.session_id=s.id
 where not i.evaluation_test and ((i.lead_id=p_lead and (i.company_id is null or i.company_id=p_company)) or (i.company_id=p_company and i.person_id=p_person)
 or (i.lead_id in(select id from public.voicebot_leads where candidate_company_id=p_company and candidate_id=p_person)))
 and (e.campaign_id is null or public.talent_cinthia_catalog_campaign_access(p_actor,p_company,e.campaign_id))),'[]');
end $$;

create or replace function public.talent_cinthia_invitation_action(p_actor uuid,p_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.cinthia_invitations;
begin
 select * into i from public.cinthia_invitations where id=p_id for update;
 if i.id is null then raise exception 'CINTHIA_NOT_FOUND';end if;
 if exists(select 1 from public.cinthia_evaluation_versions v join public.cinthia_evaluations e on e.id=v.evaluation_id where v.id=i.evaluation_version_id and e.campaign_id is not null and not public.talent_cinthia_catalog_campaign_access(p_actor,e.company_id,e.campaign_id)) then raise insufficient_privilege;end if;
 if not (i.evaluation_test and i.prepared_by=p_actor and public.talent_cinthia_evaluation_access(p_actor,i.company_id,true))
 and not public.talent_cinthia_subject_access(p_actor,i.company_id,i.person_id,i.lead_id) then raise insufficient_privilege;end if;
 if p_action='REVIEW' then
  if i.status<>'COMPLETED' then raise exception 'CINTHIA_INVALID_STATE';end if;
  if jsonb_typeof(coalesce(p_data->'scores','{}'))<>'object' or exists(select 1 from jsonb_each_text(coalesce(p_data->'scores','{}'))s where s.value !~ '^[1-4]$' or not exists(select 1 from public.cinthia_evaluation_versions v,jsonb_array_elements(v.config->'competencies')c where v.id=i.evaluation_version_id and c->>'id'=s.key)) then raise exception 'CINTHIA_INVALID';end if;
  insert into public.cinthia_human_reviews(invitation_id,actor_id,notes,scores) values(i.id,p_actor,p_data->>'notes',coalesce(p_data->'scores','{}'));
 elsif p_action in ('SENT','WHATSAPP_OPENED','CANCELLED') then
  if i.status not in ('PREPARED','PENDING') or i.expires_at<=now() then raise exception 'CINTHIA_INVALID_STATE';end if;
  if p_action='SENT' then update public.cinthia_invitations set status='PENDING',sent_at=coalesce(sent_at,now()),sent_by=coalesce(sent_by,p_actor),updated_at=now() where id=i.id returning * into i;
  elsif p_action='CANCELLED' then update public.cinthia_invitations set status='CANCELLED',updated_at=now() where id=i.id returning * into i;end if;
  insert into public.cinthia_events(invitation_id,actor_id,action) values(i.id,p_actor,p_action);
 else raise exception 'CINTHIA_INVALID';end if;
 return to_jsonb(i);
end $$;

create or replace function public.talent_cinthia_analytics(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege;end if;
 return (with visible as(select e.* from public.cinthia_evaluations e where public.talent_cinthia_evaluation_access(p_actor,e.company_id) and (e.campaign_id is null or public.talent_cinthia_catalog_campaign_access(p_actor,e.company_id,e.campaign_id))),
 assignments as(select i.*,s.duration_seconds from public.cinthia_invitations i join public.cinthia_evaluation_versions v on v.id=i.evaluation_version_id join visible e on e.id=v.evaluation_id left join public.cinthia_sessions s on s.invitation_id=i.id where not i.evaluation_test)
 select jsonb_build_object('created',(select count(*) from visible),'published',(select count(*) from visible where status='PUBLISHED'),
 'assigned',count(*),'started',count(*) filter(where started_at is not null),'completed',count(*) filter(where status='COMPLETED'),
 'pending',count(*) filter(where status in ('PREPARED','PENDING')),'averageSeconds',round(avg(duration_seconds) filter(where status='COMPLETED')),
 'completionRate',case when count(*)=0 then 0 else round(100.0*count(*) filter(where status='COMPLETED')/count(*),1) end,
 'distribution',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select e.id,e.name,e.campaign_id,v.config->'positions' positions,count(i.id) assigned,count(i.id) filter(where i.status='COMPLETED') completed from visible e join public.cinthia_evaluation_versions v on v.evaluation_id=e.id left join public.cinthia_invitations i on i.evaluation_version_id=v.id and not i.evaluation_test group by e.id,e.name,e.campaign_id,v.config->'positions')d),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from(select a.* from public.cinthia_evaluation_audit a join visible e on e.id=a.evaluation_id order by a.created_at desc limit 100)a)) from assignments);
end $$;

create or replace function public.talent_cinthia_test_history(p_actor uuid,p_evaluation uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.cinthia_evaluations;
begin
 select * into e from public.cinthia_evaluations where id=p_evaluation;
 if not public.talent_cinthia_evaluation_access(p_actor,e.company_id,true) or (e.campaign_id is not null and not public.talent_cinthia_catalog_campaign_access(p_actor,e.company_id,e.campaign_id)) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'status',i.status,'version',v.number,'session',jsonb_build_object('transcript',s.transcript,'completed_at',s.completed_at),'report',to_jsonb(r)) order by i.created_at desc)
 from public.cinthia_invitations i join public.cinthia_evaluation_versions v on v.id=i.evaluation_version_id left join public.cinthia_sessions s on s.invitation_id=i.id left join public.cinthia_results r on r.session_id=s.id where v.evaluation_id=e.id and i.evaluation_test and i.prepared_by=p_actor),'[]');
end $$;

create or replace function public.talent_cinthia_calibration(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege;end if;
 return (with paired as(select e.id,e.name,v.number,score.key competency_id,(score.value)::integer human_score,(ai->>'score')::integer ai_score
 from public.cinthia_invitations i join public.cinthia_evaluation_versions v on v.id=i.evaluation_version_id join public.cinthia_evaluations e on e.id=v.evaluation_id
 join public.cinthia_sessions s on s.invitation_id=i.id join public.cinthia_results r on r.session_id=s.id and r.state='COMPLETE'
 join lateral(select h.* from public.cinthia_human_reviews h where h.invitation_id=i.id order by h.created_at desc,h.id desc limit 1)h on true
 cross join lateral jsonb_each_text(h.scores)score join lateral jsonb_array_elements(r.result->'competencies')ai on ai->>'competencyId'=score.key
 where not i.evaluation_test and public.talent_cinthia_evaluation_access(p_actor,e.company_id,true) and (e.campaign_id is null or public.talent_cinthia_catalog_campaign_access(p_actor,e.company_id,e.campaign_id)) and ai->>'score' is not null)
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select id,name,number,competency_id,count(*) samples,round(avg(abs(human_score-ai_score)),2) mean_absolute_difference,round(100.0*count(*) filter(where human_score=ai_score)/count(*),1) agreement_percent from paired group by id,name,number,competency_id)d);
end $$;

commit;
