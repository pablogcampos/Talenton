begin;
create function public.talent_cinthia_calibration(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege;end if;
 return (with paired as(select e.id,e.name,v.number,score.key competency_id,(score.value)::integer human_score,(ai->>'score')::integer ai_score
 from public.cinthia_invitations i join public.cinthia_evaluation_versions v on v.id=i.evaluation_version_id join public.cinthia_evaluations e on e.id=v.evaluation_id
 join public.cinthia_sessions s on s.invitation_id=i.id join public.cinthia_results r on r.session_id=s.id and r.state='COMPLETE'
 join lateral(select h.* from public.cinthia_human_reviews h where h.invitation_id=i.id order by h.created_at desc,h.id desc limit 1)h on true
 cross join lateral jsonb_each_text(h.scores)score join lateral jsonb_array_elements(r.result->'competencies')ai on ai->>'competencyId'=score.key
 where not i.evaluation_test and public.talent_cinthia_evaluation_access(p_actor,e.company_id,true) and (e.campaign_id is null or talent_offers.allowed(p_actor,e.company_id,e.campaign_id)) and ai->>'score' is not null)
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select id,name,number,competency_id,count(*) samples,round(avg(abs(human_score-ai_score)),2) mean_absolute_difference,round(100.0*count(*) filter(where human_score=ai_score)/count(*),1) agreement_percent from paired group by id,name,number,competency_id)d);
end $$;
revoke all on function public.talent_cinthia_calibration(uuid) from public,anon,authenticated;
grant execute on function public.talent_cinthia_calibration(uuid) to service_role;
commit;
