begin;
-- Keep SQL enforcement and unlock requests aligned with the published 09:00–10:00 window.
do $$ declare definition text;
begin
 definition:=pg_get_functiondef('talent_private.attendance_window()'::regprocedure);
 if position('21:30' in definition)=0 then raise exception 'ATTENDANCE_WINDOW_SOURCE_CHANGED';end if;
 execute replace(definition,'21:30','10:00');
 definition:=pg_get_functiondef('public.talent_unlock_request(uuid,text,text,date,text)'::regprocedure);
 if position('21:30:00' in definition)=0 then raise exception 'ATTENDANCE_UNLOCK_SOURCE_CHANGED';end if;
 execute replace(definition,'21:30:00','10:00:00');
end $$;
commit;
