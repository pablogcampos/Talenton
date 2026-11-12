begin;
alter table public.voicebot_leads add column outcome text, add column callback_at timestamptz;
alter table public.voicebot_lead_history add column outcome text, add column callback_at timestamptz, add column previous_outcome text, add column previous_callback_at timestamptz;
alter table public.voicebot_leads drop constraint voicebot_leads_status_check;
alter table public.voicebot_leads add constraint voicebot_leads_status_check check(status in ('NUEVO','EN_GESTION','CONTACTADO','NO_CONTACTADO','REPROGRAMADO','DESCARTADO'));
-- Historical classifications remain unchanged. New writes must be complete.
alter table public.voicebot_leads add constraint voicebot_disposition_check check(
 (status in ('NUEVO','EN_GESTION','DESCARTADO') and outcome is null and callback_at is null)
 or (status='CONTACTADO' and outcome is not null and outcome in ('ACEPTA_PROPUESTA','NO_ACEPTA_PROPUESTA','NO_APTO') and callback_at is null)
 or (status='NO_CONTACTADO' and outcome is not null and outcome in ('NO_RESPONDE','CORTA_LLAMADA') and callback_at is null)
 or (status='REPROGRAMADO' and outcome is null and callback_at is not null and isfinite(callback_at))
) not valid;
create index voicebot_leads_callback on public.voicebot_leads(callback_at) where status='REPROGRAMADO';
create or replace function public.talent_voicebot_timeline(p_lead public.voicebot_leads) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,talent as $$
 select to_jsonb(p_lead)||jsonb_build_object('history',coalesce((
 select jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'previous_status',h.previous_status,
 'new_status',h.new_status,'created_at',h.created_at,'notes',h.notes,'outcome',h.outcome,'callback_at',h.callback_at,'previous_outcome',h.previous_outcome,'previous_callback_at',h.previous_callback_at,'actor_name',coalesce(p.display_name,'Usuario')) order by h.created_at,h.id)
 from public.voicebot_lead_history h left join talent.profiles p on p.auth_user_id=h.actor_auth_id and not p.is_context
 where h.lead_id=p_lead.id),'[]'::jsonb))
$$;
revoke all on function public.talent_voicebot_timeline(public.voicebot_leads) from public,anon,authenticated;
create or replace function public.talent_voicebot_manage_v2(p_actor uuid,p_id uuid,p_version bigint,p_action text,p_status text default null,p_notes text default '',p_outcome text default null,p_callback_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare lead public.voicebot_leads; previous text; actor_name text; previous_outcome text; previous_callback_at timestamptz;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 select * into lead from public.voicebot_leads where id=p_id for update;
 if not found then raise exception 'VOICEBOT_NOT_FOUND'; end if;
 if p_version is distinct from lead.version then raise sqlstate 'PT409' using message='VOICEBOT_CHANGED'; end if;
 previous:=lead.status; previous_outcome:=lead.outcome; previous_callback_at:=lead.callback_at;
 select display_name into actor_name from talent.profiles where auth_user_id=p_actor and not is_context;
 if p_action='TAKE' then
  if lead.owner_auth_id is not null or lead.status<>'NUEVO' then raise sqlstate 'PT409' using message='VOICEBOT_TAKEN'; end if;
  update public.voicebot_leads set owner_auth_id=p_actor,owner_name=actor_name,status='EN_GESTION',version=version+1,updated_at=clock_timestamp() where id=p_id returning * into lead;
 elsif p_action='UPDATE' then
  if lead.owner_auth_id is distinct from p_actor then raise insufficient_privilege; end if;
  if p_status is null or p_status not in ('CONTACTADO','NO_CONTACTADO','REPROGRAMADO') or p_notes is null or length(p_notes)>10000 then raise exception 'VOICEBOT_INVALID'; end if;
  if p_status='CONTACTADO' and (p_outcome is null or p_outcome not in ('ACEPTA_PROPUESTA','NO_ACEPTA_PROPUESTA','NO_APTO'))
   or p_status='NO_CONTACTADO' and (p_outcome is null or p_outcome not in ('NO_RESPONDE','CORTA_LLAMADA'))
   or p_status='REPROGRAMADO' and p_outcome is not null
   or p_status<>'REPROGRAMADO' and p_callback_at is not null then raise exception 'VOICEBOT_OUTCOME_REQUIRED'; end if;
  if p_status='REPROGRAMADO' and (p_callback_at is null or not isfinite(p_callback_at) or p_callback_at<=clock_timestamp()) then raise exception 'VOICEBOT_CALLBACK_REQUIRED'; end if;
  update public.voicebot_leads set status=p_status,outcome=p_outcome,callback_at=p_callback_at,management_notes=p_notes,version=version+1,updated_at=clock_timestamp() where id=p_id returning * into lead;
 else raise exception 'VOICEBOT_INVALID'; end if;
 insert into public.voicebot_lead_history(lead_id,actor_auth_id,action,previous_status,new_status,notes,outcome,callback_at,previous_outcome,previous_callback_at) values(p_id,p_actor,p_action,previous,lead.status,lead.management_notes,lead.outcome,lead.callback_at,previous_outcome,previous_callback_at);
 return public.talent_voicebot_timeline(lead);
end $$;


revoke all on function public.talent_voicebot_manage_v2(uuid,uuid,bigint,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.talent_voicebot_manage_v2(uuid,uuid,bigint,text,text,text,text,timestamptz) to service_role;
-- Old clients cannot bypass the new required classification.
create or replace function public.talent_voicebot_manage(p_actor uuid,p_id uuid,p_version bigint,p_action text,p_status text default null,p_notes text default '') returns jsonb
language sql security definer set search_path=pg_catalog,public as $$
 select public.talent_voicebot_manage_v2(p_actor,p_id,p_version,p_action,p_status,p_notes,null,null)
$$;
commit;
