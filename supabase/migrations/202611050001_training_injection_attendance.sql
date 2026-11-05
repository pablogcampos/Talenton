begin;
create function talent_private.attendance_after_injection() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare joined date;
begin
 select coalesce(p.annotations#>>'{injection,date}',p.annotations#>>'{trainingMeta,injection,date}')::date into joined
 from talent.participants p where p.company_id=new.company_id and p.id=new.participant_id;
 if joined is not null and new.day_date<joined then raise exception 'ATTENDANCE_BEFORE_INJECTION';end if;
 return new;
end $$;
create trigger attendance_injection_guard before insert or update on talent.attendance
 for each row execute function talent_private.attendance_after_injection();
revoke all on function talent_private.attendance_after_injection() from public,anon,authenticated;
commit;
