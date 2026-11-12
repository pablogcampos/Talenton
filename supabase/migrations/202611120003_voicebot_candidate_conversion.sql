begin;
alter table public.voicebot_leads add column candidate_id text, add column candidate_company_id text, add column converted_at timestamptz;
create function talent_private.voicebot_candidate_conversion() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare lead public.voicebot_leads; actor uuid; lead_id uuid;
begin
 if nullif(new.annotations->>'voicebotLeadId','') is null then return new; end if;
 if tg_op='UPDATE' and new.annotations->>'voicebotLeadId' is not distinct from old.annotations->>'voicebotLeadId' then return new; end if;
 lead_id:=(new.annotations->>'voicebotLeadId')::uuid;
 select auth_user_id into actor from talent.profiles where company_id=new.company_id and id=nullif(current_setting('talent.actor_id',true),'');
 select * into lead from public.voicebot_leads where id=lead_id for update;
 if not found or actor is null or not public.talent_voicebot_allowed(actor) or lead.owner_auth_id is distinct from actor then raise exception 'VOICEBOT_CONVERSION_FORBIDDEN'; end if;
 if lead.candidate_id is not null then raise exception 'VOICEBOT_ALREADY_CONVERTED'; end if;
 if lead.status<>'CONTACTADO' or lead.outcome is distinct from 'ACEPTA_PROPUESTA' then raise exception 'VOICEBOT_CONVERSION_NOT_READY'; end if;
 new.annotations:=new.annotations||jsonb_build_object('voicebotOriginal',to_jsonb(lead));
 update public.voicebot_leads set candidate_id=new.id,candidate_company_id=new.company_id,converted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=lead.id;
 insert into public.voicebot_lead_history(lead_id,actor_auth_id,action,previous_status,new_status,notes,outcome)
 values(lead.id,actor,'CONVERT',lead.status,lead.status,'Convertido a candidato',lead.outcome);
 return new;
end $$;
revoke all on function talent_private.voicebot_candidate_conversion() from public,anon,authenticated;
create trigger voicebot_candidate_conversion before insert or update on talent.persons for each row execute function talent_private.voicebot_candidate_conversion();
commit;
