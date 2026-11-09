begin;
create or replace function talent_offers.require_signed(p_company text,p_group text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from talent.participants p
 where p.company_id=p_company and p.group_id=p_group and p.status<>'DESERTO'
 and not exists(select 1 from talent_offers.documents d where d.company_id=p.company_id
 and d.group_id=p.group_id and d.participant_id=p.id and d.signed_at is not null and d.revoked_at is null))
 then raise exception 'OFFER_SIGNATURES_PENDING';end if;
end $$;
revoke all on function talent_offers.require_signed(text,text) from public,anon,authenticated,service_role;
commit;
