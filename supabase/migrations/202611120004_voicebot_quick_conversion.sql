begin;
create or replace function talent_private.voicebot_candidate_conversion() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare lead public.voicebot_leads; actor uuid; lead_id uuid;
begin
 if nullif(new.annotations->>'voicebotLeadId','') is null then return new; end if;
 if tg_op='UPDATE' and new.annotations->>'voicebotLeadId' is not distinct from old.annotations->>'voicebotLeadId' then return new; end if;
 lead_id:=(new.annotations->>'voicebotLeadId')::uuid;
 select auth_user_id into actor from talent.profiles where company_id=new.company_id and id=nullif(current_setting('talent.actor_id',true),'');
 select * into lead from public.voicebot_leads where id=lead_id for update;
 if not found or actor is null or not public.talent_voicebot_allowed(actor) or lead.owner_auth_id is distinct from actor then raise exception 'VOICEBOT_CONVERSION_FORBIDDEN'; end if;
 if lead.candidate_id is not null then
  if lead.candidate_id=new.id and lead.candidate_company_id=new.company_id and exists(select 1 from talent.persons p where p.company_id=new.company_id and p.id=new.id and p.annotations->>'voicebotLeadId'=lead.id::text) then return new; end if;
  raise exception 'VOICEBOT_ALREADY_CONVERTED';
 end if;
 if lead.status<>'CONTACTADO' or lead.outcome is distinct from 'ACEPTA_PROPUESTA' then raise exception 'VOICEBOT_CONVERSION_NOT_READY'; end if;
 new.annotations:=new.annotations||jsonb_build_object('voicebotOriginal',to_jsonb(lead));
 update public.voicebot_leads set candidate_id=new.id,candidate_company_id=new.company_id,converted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=lead.id;
 insert into public.voicebot_lead_history(lead_id,actor_auth_id,action,previous_status,new_status,notes,outcome)
 values(lead.id,actor,'CONVERT',lead.status,lead.status,'Convertido a candidato',lead.outcome);
 return new;
end $$;

create function public.talent_voicebot_convert(p_actor uuid,p_id uuid,p_version bigint,p_company text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare lead public.voicebot_leads; actor talent.profiles; person text;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 actor:=talent_private.actor_profile(p_actor,p_company);
 if actor.role not in ('ADMIN','JEFE_SELECCION','ANALISTA_SELECCION','RECLUTADOR') then raise insufficient_privilege; end if;
 select * into lead from public.voicebot_leads where id=p_id for update;
 if not found then raise exception 'VOICEBOT_NOT_FOUND'; end if;
 if lead.owner_auth_id is distinct from p_actor then raise insufficient_privilege; end if;
 if lead.candidate_id is not null then return public.talent_voicebot_timeline(lead); end if;
 if lead.version<>p_version then raise sqlstate 'PT409' using message='VOICEBOT_CHANGED'; end if;
 if lead.status<>'CONTACTADO' or lead.outcome is distinct from 'ACEPTA_PROPUESTA' then raise exception 'VOICEBOT_CONVERSION_NOT_READY'; end if;
 person:='VB-'||lead.id::text;
 perform set_config('talent.actor_id',actor.id,true);
 insert into talent.persons(company_id,id,full_name,phone,district,owner_id,capture_only,current_stage,current_process,source_name,general_observations,annotations)
 values(p_company,person,coalesce(nullif(lead.full_name,''),'Nombre pendiente'),lead.phone,lead.district,actor.id,true,'SELECCION','SELECCION','Voicebot',concat_ws(E'\n',nullif(lead.experience,''),nullif(lead.management_notes,'')),jsonb_build_object('voicebotLeadId',lead.id,'pendingCompletion',true));
 perform set_config('talent.actor_id','',true);
 insert into talent.tenant_revisions(company_id,revision) values(p_company,1) on conflict(company_id) do update set revision=talent.tenant_revisions.revision+1;
 select * into lead from public.voicebot_leads where id=p_id;
 return public.talent_voicebot_timeline(lead);
end $$;
revoke all on function public.talent_voicebot_convert(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.talent_voicebot_convert(uuid,uuid,bigint,text) to service_role;
commit;
