begin;
create or replace function public.talent_voicebot_timeline(p_lead public.voicebot_leads) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,talent as $$
 select to_jsonb(p_lead)||jsonb_build_object('history',coalesce((
 select jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'previous_status',h.previous_status,
 'new_status',h.new_status,'created_at',h.created_at,'notes',h.notes,'actor_name',coalesce(p.display_name,'Usuario')) order by h.created_at,h.id)
 from public.voicebot_lead_history h left join talent.profiles p on p.auth_user_id=h.actor_auth_id and not p.is_context
 where h.lead_id=p_lead.id),'[]'::jsonb))
$$;
revoke all on function public.talent_voicebot_timeline(public.voicebot_leads) from public,anon,authenticated;
create index if not exists voicebot_history_lead_time on public.voicebot_lead_history(lead_id,created_at,id);
create or replace function public.talent_voicebot_list(p_actor uuid,p_search text default '',p_status text default '',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; total bigint;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 if p_page is null or p_page<0 or p_page>100000 or length(p_search)>200 then raise exception 'VOICEBOT_INVALID'; end if;
 select count(*) into total from public.voicebot_leads l where (p_status='' or l.status=p_status)
 and (p_search='' or position(lower(p_search) in lower(l.full_name||' '||l.phone||' '||l.external_id))>0);
 select coalesce(jsonb_agg(public.talent_voicebot_timeline(t.lead) order by t.received_at desc,t.id desc),'[]') into result from (
 select l as lead,l.received_at,l.id from public.voicebot_leads l where (p_status='' or l.status=p_status)
 and (p_search='' or position(lower(p_search) in lower(l.full_name||' '||l.phone||' '||l.external_id))>0)
 order by l.received_at desc,l.id desc limit 50 offset p_page*50) t;
 return jsonb_build_object('items',result,'total',total,'page',p_page,'pageSize',50);
end $$;

create or replace function public.talent_voicebot_manage(p_actor uuid,p_id uuid,p_version bigint,p_action text,p_status text default null,p_notes text default '')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,talent as $$
declare lead public.voicebot_leads; previous text; actor_name text;
begin
 if not public.talent_voicebot_allowed(p_actor) then raise insufficient_privilege; end if;
 select * into lead from public.voicebot_leads where id=p_id for update;
 if not found then raise exception 'VOICEBOT_NOT_FOUND'; end if;
 if p_version is distinct from lead.version then raise sqlstate 'PT409' using message='VOICEBOT_CHANGED'; end if;
 previous:=lead.status;
 select display_name into actor_name from talent.profiles where auth_user_id=p_actor and not is_context;
 if p_action='TAKE' then
  if lead.owner_auth_id is not null or lead.status<>'NUEVO' then raise sqlstate 'PT409' using message='VOICEBOT_TAKEN'; end if;
  update public.voicebot_leads set owner_auth_id=p_actor,owner_name=actor_name,status='EN_GESTION',version=version+1,updated_at=clock_timestamp() where id=p_id returning * into lead;
 elsif p_action='UPDATE' then
  if lead.owner_auth_id is distinct from p_actor then raise insufficient_privilege; end if;
  if p_status is null or p_status not in ('EN_GESTION','CONTACTADO','NO_CONTACTADO','DESCARTADO') or p_notes is null or length(p_notes)>10000 then raise exception 'VOICEBOT_INVALID'; end if;
  update public.voicebot_leads set status=p_status,management_notes=p_notes,version=version+1,updated_at=clock_timestamp() where id=p_id returning * into lead;
 else raise exception 'VOICEBOT_INVALID'; end if;
 insert into public.voicebot_lead_history(lead_id,actor_auth_id,action,previous_status,new_status,notes) values(p_id,p_actor,p_action,previous,lead.status,lead.management_notes);
 return public.talent_voicebot_timeline(lead);
end $$;

commit;
