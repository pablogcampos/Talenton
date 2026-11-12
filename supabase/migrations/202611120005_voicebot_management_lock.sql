begin;
alter table public.voicebot_leads add column management_locked_at timestamptz;
update public.voicebot_leads l set management_locked_at=h.first_saved from (select lead_id,min(created_at) first_saved from public.voicebot_lead_history where action='UPDATE' group by lead_id) h where l.id=h.lead_id;
create or replace function public.talent_voicebot_manage_v2(p_actor uuid,p_id uuid,p_version bigint,p_action text,p_status text default null,p_notes text default '',p_outcome text default null,p_callback_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare lead public.voicebot_leads; previous text; actor_name text; previous_outcome text; previous_callback_at timestamptz; is_admin boolean;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 select * into lead from public.voicebot_leads where id=p_id for update;
 if not found then raise exception 'VOICEBOT_NOT_FOUND'; end if;
 if p_version is distinct from lead.version then raise sqlstate 'PT409' using message='VOICEBOT_CHANGED'; end if;
 select coalesce(talent_private.org_global_admin(p_actor),false) or exists(select 1 from talent.profiles where auth_user_id=p_actor and not is_context and role='ADMIN' and enabled and status='ACTIVO' and archived_at is null) into is_admin;
 previous:=lead.status; previous_outcome:=lead.outcome; previous_callback_at:=lead.callback_at;
 select display_name into actor_name from talent.profiles where auth_user_id=p_actor and not is_context;
 if p_action='TAKE' then
  if lead.owner_auth_id is not null or lead.status<>'NUEVO' then raise sqlstate 'PT409' using message='VOICEBOT_TAKEN'; end if;
  update public.voicebot_leads set owner_auth_id=p_actor,owner_name=actor_name,status='EN_GESTION',version=version+1,updated_at=clock_timestamp() where id=p_id returning * into lead;
 elsif p_action='UPDATE' then
  if not is_admin and lead.owner_auth_id is distinct from p_actor then raise insufficient_privilege; end if;
  if not is_admin and lead.management_locked_at is not null then raise exception 'VOICEBOT_MANAGEMENT_LOCKED'; end if;
  if lead.owner_auth_id is null then raise exception 'VOICEBOT_INVALID'; end if;
  if p_status is null or p_status not in ('CONTACTADO','NO_CONTACTADO','REPROGRAMADO') or p_notes is null or length(p_notes)>10000 then raise exception 'VOICEBOT_INVALID'; end if;
  if p_status='CONTACTADO' and (p_outcome is null or p_outcome not in ('ACEPTA_PROPUESTA','NO_ACEPTA_PROPUESTA','NO_APTO'))
   or p_status='NO_CONTACTADO' and (p_outcome is null or p_outcome not in ('NO_RESPONDE','CORTA_LLAMADA'))
   or p_status='REPROGRAMADO' and p_outcome is not null
   or p_status<>'REPROGRAMADO' and p_callback_at is not null then raise exception 'VOICEBOT_OUTCOME_REQUIRED'; end if;
  if p_status='REPROGRAMADO' and (p_callback_at is null or not isfinite(p_callback_at) or p_callback_at<=clock_timestamp()) then raise exception 'VOICEBOT_CALLBACK_REQUIRED'; end if;
  update public.voicebot_leads set management_locked_at=coalesce(management_locked_at,clock_timestamp()),status=p_status,outcome=p_outcome,callback_at=p_callback_at,management_notes=p_notes,version=version+1,updated_at=clock_timestamp() where id=p_id returning * into lead;
 else raise exception 'VOICEBOT_INVALID'; end if;
 insert into public.voicebot_lead_history(lead_id,actor_auth_id,action,previous_status,new_status,notes,outcome,callback_at,previous_outcome,previous_callback_at) values(p_id,p_actor,p_action,previous,lead.status,lead.management_notes,lead.outcome,lead.callback_at,previous_outcome,previous_callback_at);
 return public.talent_voicebot_timeline(lead);
end $$;



commit;
