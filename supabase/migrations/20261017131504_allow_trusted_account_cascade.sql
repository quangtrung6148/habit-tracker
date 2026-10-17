-- Permit only nested FK cleanup by trusted admin roles, not direct historical edits.
create or replace function app_private.guard_checkin() returns trigger
language plpgsql set search_path='' as $$
declare owner_id uuid; target_id uuid; h public.habits; zone text; local_day date;
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 and current_user in ('postgres','supabase_admin','supabase_auth_admin','service_role') then return old;end if;
  if tg_op='DELETE' then owner_id:=old.user_id;target_id:=old.habit_id;
  else owner_id:=new.user_id;target_id:=new.habit_id;end if;
  if owner_id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
  select * into h from public.habits where id=target_id and user_id=owner_id for update;
  if h.id is null or h.deleted_at is not null then raise exception 'Habit unavailable' using errcode='23514';end if;
  select timezone into strict zone from public.profiles where id=owner_id;
  local_day:=(clock_timestamp() at time zone zone)::date;
  if tg_op='DELETE' then
    if old.checkin_date<>local_day then raise exception 'Only today can be changed' using errcode='23514';end if;
    return old;
  end if;
  if not h.is_active then raise exception 'Habit paused' using errcode='23514';end if;
  if new.checkin_date is not null and new.checkin_date<>local_day then raise exception 'Only today can be changed' using errcode='23514';end if;
  new.checkin_date:=local_day;new.created_at:=clock_timestamp();return new;
end $$;
revoke all on function app_private.guard_checkin() from public,anon,authenticated;
