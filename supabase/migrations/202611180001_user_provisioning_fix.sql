begin;
-- Universal accounts retain their area role; campaign access is no longer a provisioning restriction.
create or replace function talent_ops.member_role_guard() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare home_role text;
begin
 select role into home_role from talent.profiles where auth_user_id=new.auth_user_id and not is_context;
 if (home_role in ('JEFE_OPERACIONES','COORDINADOR_OPERACIONES')) is distinct from
    (new.role in ('JEFE_OPERACIONES','COORDINADOR_OPERACIONES')) then raise exception 'OPERATIONS_ROLE_ONLY'; end if;
 return new;
end $$;
commit;
