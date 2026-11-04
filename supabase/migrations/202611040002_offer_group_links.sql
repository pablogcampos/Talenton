begin;
create table talent_offers.group_links(
 company_id text not null,group_id text not null,
 token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
 primary key(company_id,group_id),
 foreign key(company_id,group_id) references talent.training_groups(company_id,id));
alter table talent_offers.group_links enable row level security;
revoke all on talent_offers.group_links from public,anon,authenticated;
insert into talent_offers.group_links(company_id,group_id) select company_id,id from talent.training_groups;
create function talent_offers.create_group_link() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into talent_offers.group_links(company_id,group_id) values(new.company_id,new.id);
 return new;
end $$;
create trigger offers_group_link after insert on talent.training_groups for each row execute function talent_offers.create_group_link();
revoke all on function talent_offers.create_group_link() from public,anon,authenticated;

-- Retain the established per-company access checks when exposing the common link.
alter function public.talent_offer_catalog(uuid,text,text) rename to talent_offer_catalog_before_group_links;
revoke all on function public.talent_offer_catalog_before_group_links(uuid,text,text) from public,anon,authenticated,service_role;
create function public.talent_offer_catalog(p_actor uuid,p_company text,p_group text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;groups jsonb;
begin
 result:=public.talent_offer_catalog_before_group_links(p_actor,p_company,p_group);
 select coalesce(jsonb_agg(g.value||jsonb_build_object('publicToken',l.token) order by g.ordinality),'[]')
 into groups from jsonb_array_elements(result->'groups') with ordinality g(value,ordinality)
 left join talent_offers.group_links l on l.company_id=p_company and l.group_id=g.value->>'id';
 return jsonb_set(result,'{groups}',groups);
end $$;

create function public.talent_offer_group_public(p_token text,p_data jsonb default null,p_evidence text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare link talent_offers.group_links;d talent_offers.documents;result jsonb;n integer;matches integer;dni text;
begin
 select l.* into link from talent_offers.group_links l
 join talent.training_groups g on g.company_id=l.company_id and g.id=l.group_id and g.archived_at is null
 where l.token=p_token;
 if not found then return jsonb_build_object('error','OFFER_NOT_FOUND');end if;
 if p_data is null then
  select jsonb_build_object('company',c.name,'group',g.name) into result
  from talent.training_groups g join talent.companies c on c.id=g.company_id where g.company_id=link.company_id and g.id=link.group_id;
  return result;
 end if;
 if length(coalesce(p_evidence,''))<>64 then return jsonb_build_object('error','OFFER_INVALID');end if;
 -- Bound DNI lookups by link and server-derived IP hash; never persist the DNI here.
 insert into talent_offers.attempts values('group:'||p_token||':'||p_evidence,clock_timestamp(),1)
 on conflict(token) do update set attempts=case when talent_offers.attempts.window_at<clock_timestamp()-interval '15 minutes' then 1 else talent_offers.attempts.attempts+1 end,
 window_at=case when talent_offers.attempts.window_at<clock_timestamp()-interval '15 minutes' then clock_timestamp() else talent_offers.attempts.window_at end returning attempts into n;
 if n>40 then return jsonb_build_object('error','OFFER_RATE_LIMITED');end if;
 dni:=btrim(coalesce(p_data->>'dni',''));
 if length(dni) not between 5 and 30 or coalesce(p_data->>'action','') not in ('lookup','sign') then return jsonb_build_object('error','OFFER_LOOKUP_NOT_FOUND');end if;
 perform 1 from talent.training_groups where company_id=link.company_id and id=link.group_id and archived_at is null for update;
 if not found then return jsonb_build_object('error','OFFER_NOT_FOUND');end if;
 select count(distinct doc.participant_id) into matches from talent_offers.documents doc
 join talent.participants p on p.company_id=doc.company_id and p.group_id=doc.group_id and p.id=doc.participant_id
 where doc.company_id=link.company_id and doc.group_id=link.group_id and doc.revoked_at is null and doc.snapshot->>'dni'=dni;
 if matches<>1 then return jsonb_build_object('error','OFFER_LOOKUP_NOT_FOUND');end if;
 select * into d from talent_offers.documents doc where doc.company_id=link.company_id and doc.group_id=link.group_id
 and doc.revoked_at is null and doc.snapshot->>'dni'=dni order by doc.signed_at desc nulls last,doc.created_at desc,doc.id desc limit 1;
 if p_data->>'action'='sign' then
  result:=public.talent_offer_public(d.token,p_data||jsonb_build_object('dni',dni),p_evidence);
  if result ? 'error' then return result;end if;
 end if;
 -- The individual token is never returned; every read and signature requires the DNI.
 return public.talent_offer_public(d.token,null,null);
end $$;
revoke all on function public.talent_offer_catalog(uuid,text,text),public.talent_offer_group_public(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.talent_offer_catalog(uuid,text,text),public.talent_offer_group_public(text,jsonb,text) to service_role;
commit;
