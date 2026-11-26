begin;
create table talent_private.training_imports(company_id text not null references talent.companies,id uuid not null,actor uuid not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(company_id,id));
alter table talent_private.training_imports enable row level security;revoke all on talent_private.training_imports from public,anon,authenticated;
create function public.talent_training_manual(p_actor uuid,p_company text,p_data jsonb default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a talent.profiles;tr talent.profiles;g text;camp text;pid text;appid text;r jsonb;items jsonb;issues jsonb:='[]';idx integer:=1;matches integer;existing jsonb;result jsonb;startday date;endday date;catalog text;trainer text;reqid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('runtime:'||p_company,0));
 a:=talent_private.actor_profile(p_actor,p_company);
 if a.role not in ('ADMIN','JEFE_FORMACION','COORDINADOR_FORMACION','FORMADOR') or (a.role<>'ADMIN' and not exists(select 1 from talent.user_modules where company_id=p_company and user_id=a.id and module='FORMACION' and archived_at is null)) then raise insufficient_privilege;end if;
 if p_data is null then
 return jsonb_build_object('campaigns',(select coalesce(jsonb_agg(jsonb_build_object('id',cc.id,'name',gc.name)),'[]') from talent_org.company_campaigns cc join talent_org.global_campaigns gc on gc.id=cc.global_campaign_id where cc.company_id=p_company and cc.archived_at is null and cc.status='ACTIVA' and talent_private.org_campaign_access(p_actor,p_company,cc.id)),'trainers',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name)),'[]') from talent.profiles p where p.company_id=p_company and p.role='FORMADOR' and p.status='ACTIVO' and p.enabled and p.archived_at is null and exists(select 1 from talent.user_modules m where m.company_id=p_company and m.user_id=p.id and m.module='FORMACION' and m.archived_at is null)));
 end if;
 reqid:=(p_data->>'requestId')::uuid;if reqid is null then raise exception 'OFFER_INVALID';end if;perform pg_advisory_xact_lock(hashtextextended(p_company||':training-import',0));
 select to_jsonb(i) into existing from talent_private.training_imports i where company_id=p_company and id=reqid;
 if existing is not null then if existing->>'actor'<>p_actor::text or existing->'request'<>p_data then raise exception 'OFFER_INVALID';end if;return existing->'result';end if;
 items:=p_data->'rows';if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 200 then raise exception 'OFFER_INVALID';end if;
 catalog:=p_data->>'campaignId';trainer:=case when a.role='FORMADOR' then a.id else p_data->>'trainerId' end;
 select * into tr from talent.profiles where company_id=p_company and id=trainer and role='FORMADOR' and status='ACTIVO' and enabled and archived_at is null;
 if not found or not exists(select 1 from talent.user_modules where company_id=p_company and user_id=trainer and module='FORMACION' and archived_at is null) then raise insufficient_privilege;end if;
 if not exists(select 1 from talent_org.company_campaigns where company_id=p_company and id=catalog and archived_at is null and status='ACTIVA') or not talent_private.org_campaign_access(p_actor,p_company,catalog) then raise insufficient_privilege;end if;
 startday:=(p_data->>'startDate')::date;endday:=(p_data->>'endDate')::date;
 if startday is null or endday is null or endday<startday or endday-startday>90 or length(btrim(coalesce(p_data->>'name','')))<3 or length(coalesce(p_data->>'name',''))>160 or coalesce(p_data->>'modality','') not in ('PRESENCIAL','REMOTO','HIBRIDO') or coalesce(p_data->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or length(coalesce(p_data->>'schedule','')) not between 3 and 120 then raise exception 'OFFER_INVALID';end if;
 -- Serialize DNI checks in deterministic order, also against the existing candidate creation lock.
 for r in select value from jsonb_array_elements(items) order by value->>'dni' loop perform pg_advisory_xact_lock(hashtextextended(p_company||':'||(r->>'dni'),0));end loop;
 for r in select value from jsonb_array_elements(items) loop
 idx:=idx+1;
 if coalesce(r->>'dni','') !~ '^[0-9]{8}$' or length(btrim(coalesce(r->>'name',''))) not between 3 and 160 or coalesce(r->>'phone','') !~ '^(51)?9[0-9]{8}$' or coalesce(r->>'workday','') not in ('FULL_TIME','SEMI_FULL','PART_TIME') or (coalesce(r->>'email','')<>'' and (r->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then issues:=issues||jsonb_build_array('Fila '||idx||': datos inválidos.');end if;
 if (select count(*) from jsonb_array_elements(items) x where x->>'dni'=r->>'dni')>1 then issues:=issues||jsonb_build_array('Fila '||idx||': DNI repetido en el archivo.');end if;
 select count(*),min(id) into matches,pid from talent.persons where company_id=p_company and (document_number=r->>'dni' or id='CAN-'||(r->>'dni'));
 if matches>1 then issues:=issues||jsonb_build_array('Fila '||idx||': hay registros ambiguos para el DNI; solicita revisión.');end if;
 if exists(select 1 from talent.persons where company_id=p_company and id=pid and archived_at is not null) then issues:=issues||jsonb_build_array('Fila '||idx||': registro archivado; requiere revisión.');end if;
 if exists(select 1 from talent.participants p join talent.applications app on app.company_id=p.company_id and app.id=p.application_id join talent.training_groups grp on grp.company_id=p.company_id and grp.id=p.group_id where app.company_id=p_company and app.person_id=pid and grp.status not in ('FINALIZADA','CANCELADA') and grp.archived_at is null and p.archived_at is null and p.status not in ('DESERTO','NO_APTO','NSP','RETIRADO')) then issues:=issues||jsonb_build_array('Fila '||idx||': ya participa en otra capacitación activa.');end if;
 end loop;
 if jsonb_array_length(issues)>0 then return jsonb_build_object('errors',issues);end if;
 if coalesce((p_data->>'confirm')::boolean,false)=false then return jsonb_build_object('valid',true,'count',jsonb_array_length(items));end if;
 g:='TRN-'||reqid;camp:='FORM-'||reqid;
 insert into talent.campaigns(company_id,id,code,title,status,vacancies,company_campaign_id,management_type,start_date,end_date) values(p_company,camp,camp,p_data->>'name','ACTIVA',jsonb_array_length(items),catalog,p_data->>'modality',startday,endday);
 insert into talent.training_groups(company_id,id,campaign_id,code,name,trainer_id,coordinator_id,start_date,theory_end_date,theory_days,schedule,start_time,modality,status,capacity,passing_grade,trainer_assigned_at,trainer_assigned_by,observations) values(p_company,g,camp,'CAP-'||reqid::text,p_data->>'name',trainer,case when a.role='COORDINADOR_FORMACION' then a.id end,startday,endday,endday-startday+1,p_data->>'schedule',(p_data->>'time')::time,p_data->>'modality','PROGRAMADA',jsonb_array_length(items),14,now(),a.id,'Registro directo de Formación mediante Excel.');
 for r in select value from jsonb_array_elements(items) loop
 select id into pid from talent.persons where company_id=p_company and (document_number=r->>'dni' or id='CAN-'||(r->>'dni'));
 if pid is null then
 pid:='CAN-'||(r->>'dni');insert into talent.persons(company_id,id,full_name,document_number,phone,email,owner_id,source_name,annotations) values(p_company,pid,r->>'name',r->>'dni',r->>'phone',nullif(r->>'email',''),trainer,'Formación - Excel',jsonb_build_object('workSchedule',r->>'workday'));
 end if;
 appid:='APP-'||gen_random_uuid();
 update talent.applications set status='CERRADA',closed_at=now(),closure_reason='Ingreso directo a capacitación de Formación',version=version+1 where company_id=p_company and person_id=pid and status='ACTIVA';
 insert into talent.applications(company_id,id,person_id,campaign_id,recruiter_id,status,stage,application_date) values(p_company,appid,pid,camp,trainer,'ACTIVA','APTO_CAPACITACION',(now() at time zone 'America/Lima')::date);
 update talent.persons set current_application_id=appid,current_process='FORMACION',current_stage='FORMACION',capture_only=false,annotations=coalesce(annotations,'{}')||jsonb_build_object('workSchedule',r->>'workday'),version=version+1 where company_id=p_company and id=pid;
 insert into talent.participants(company_id,id,group_id,application_id,status,joined_at) values(p_company,pid||':'||g,g,appid,'PENDIENTE_INICIO',now());
 end loop;
 result:=jsonb_build_object('id',g,'count',jsonb_array_length(items));insert into talent_private.training_imports values(p_company,reqid,p_actor,p_data,result,now());return result;
end $$;
revoke all on function public.talent_training_manual(uuid,text,jsonb) from public,anon,authenticated;grant execute on function public.talent_training_manual(uuid,text,jsonb) to service_role;
do $$declare s text;begin
 s:=pg_get_functiondef('public.talent_offer_workday_plan(uuid,text,text)'::regprocedure);
 s:=replace(s,'a.role not in (''ADMIN'',''RECLUTADOR'')','a.role not in (''ADMIN'',''RECLUTADOR'',''FORMADOR'',''JEFE_FORMACION'',''COORDINADOR_FORMACION'')');execute s;
 s:=pg_get_functiondef('public.talent_offer_catalog_before_group_links(uuid,text,text)'::regprocedure);
 s:=replace(s,'''canAssign'',a.role in (''ADMIN'',''RECLUTADOR'')','''canAssign'',(a.role in (''ADMIN'',''RECLUTADOR'') or p_group is not null and a.role in (''FORMADOR'',''JEFE_FORMACION'',''COORDINADOR_FORMACION''))');execute s;
 s:=pg_get_functiondef('talent_offers.person_workday(text,text,text)'::regprocedure);
 s:=replace(s,'begin','begin'||chr(10)||' if left(p_campaign,5)=''FORM-'' then select annotations->>''workSchedule'' into raw from talent.persons where company_id=p_company and id=p_person;return jsonb_build_object(''workday'',talent_offers.normalize_workday(raw),''raw'',raw,''source'',''Excel de Formación'');end if;');execute s;
end $$;
commit;
