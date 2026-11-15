begin;
create function public.talent_cinthia_report_job(p_session uuid default null,p_result jsonb default null,p_error text default null,p_model text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.cinthia_results;s public.cinthia_sessions;
begin
 if p_result is not null or p_error is not null then
  update public.cinthia_results set state=case when p_error is null then 'COMPLETE' else 'ERROR' end,result=p_result,error_code=p_error,model=p_model,updated_at=now() where session_id=p_session and state='PROCESSING';
  return jsonb_build_object('saved',found);
 end if;
 select * into r from public.cinthia_results where (p_session is null or session_id=p_session) and attempts<3 and (state='PENDING' or state='ERROR' and updated_at<now()-interval '2 minutes' or state='PROCESSING' and updated_at<now()-interval '3 minutes') order by updated_at for update skip locked limit 1;
 if r.session_id is null then return null;end if;
 update public.cinthia_results set state='PROCESSING',attempts=attempts+1,updated_at=now() where session_id=r.session_id;
 select * into s from public.cinthia_sessions where id=r.session_id;
 return jsonb_build_object('sessionId',s.id,'config',s.evaluation_config,'transcript',s.transcript);
end $$;
create function public.talent_cinthia_analytics(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege;end if;
 return (with visible as(select e.* from public.cinthia_evaluations e where public.talent_cinthia_evaluation_access(p_actor,e.company_id) and (e.campaign_id is null or talent_offers.allowed(p_actor,e.company_id,e.campaign_id))),
 assignments as(select i.*,s.duration_seconds from public.cinthia_invitations i join public.cinthia_evaluation_versions v on v.id=i.evaluation_version_id join visible e on e.id=v.evaluation_id left join public.cinthia_sessions s on s.invitation_id=i.id where not i.evaluation_test)
 select jsonb_build_object('created',(select count(*) from visible),'published',(select count(*) from visible where status='PUBLISHED'),
 'assigned',count(*),'started',count(*) filter(where started_at is not null),'completed',count(*) filter(where status='COMPLETED'),
 'pending',count(*) filter(where status in ('PREPARED','PENDING')),'averageSeconds',round(avg(duration_seconds) filter(where status='COMPLETED')),
 'completionRate',case when count(*)=0 then 0 else round(100.0*count(*) filter(where status='COMPLETED')/count(*),1) end,
 'distribution',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select e.id,e.name,e.campaign_id,v.config->'positions' positions,count(i.id) assigned,count(i.id) filter(where i.status='COMPLETED') completed from visible e join public.cinthia_evaluation_versions v on v.evaluation_id=e.id left join public.cinthia_invitations i on i.evaluation_version_id=v.id and not i.evaluation_test group by e.id,e.name,e.campaign_id,v.config->'positions')d),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from(select a.* from public.cinthia_evaluation_audit a join visible e on e.id=a.evaluation_id order by a.created_at desc limit 100)a)) from assignments);
end $$;
revoke all on function public.talent_cinthia_report_job(uuid,jsonb,text,text),public.talent_cinthia_analytics(uuid) from public,anon,authenticated;
grant execute on function public.talent_cinthia_report_job(uuid,jsonb,text,text),public.talent_cinthia_analytics(uuid) to service_role;
commit;
