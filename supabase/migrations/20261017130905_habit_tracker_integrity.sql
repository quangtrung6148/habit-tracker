-- Additive integrity migration. Baseline 20261017124827 is already on remote.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default clock_timestamp()
);
alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid())=id);

alter table public.habits add column deleted_at timestamptz;
alter table public.habits add constraint habits_description_length check (length(description)<=2000);
alter table public.habits add constraint habits_deleted_inactive check (deleted_at is null or not is_active);
create index habits_owner_state_idx on public.habits(user_id,is_active) where deleted_at is null;

create table public.habit_activity_days (
  habit_id uuid not null,
  user_id uuid not null,
  effective_date date not null,
  is_active boolean not null,
  primary key(habit_id,effective_date),
  foreign key(habit_id,user_id) references public.habits(id,user_id) on delete cascade
);
create index habit_activity_owner_date_idx on public.habit_activity_days(user_id,effective_date);
alter table public.habit_activity_days enable row level security;
create policy activity_select_own on public.habit_activity_days for select to authenticated using ((select auth.uid())=user_id);

-- Reconcile pre-existing owners without changing any original check-in dates.
insert into public.profiles(id) select id from auth.users on conflict do nothing;
insert into public.habit_activity_days(habit_id,user_id,effective_date,is_active)
select h.id,h.user_id,(h.created_at at time zone p.timezone)::date,h.is_active
from public.habits h join public.profiles p on p.id=h.user_id;

create function app_private.guard_profile() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
    raise exception 'Invalid IANA timezone' using errcode='22023';
  end if;
  new.created_at:=clock_timestamp();
  return new;
end $$;
create trigger profile_guard before insert on public.profiles for each row execute function app_private.guard_profile();

create function app_private.guard_habit() returns trigger
language plpgsql set search_path='' as $$
declare zone text;
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
  select timezone into zone from public.profiles where id=new.user_id;
  if zone is null then raise exception 'Profile required' using errcode='23514'; end if;
  if tg_op='INSERT' then
    if new.deleted_at is not null then raise exception 'Invalid deletion' using errcode='23514'; end if;
    new.created_at:=clock_timestamp();
  else
    if old.deleted_at is not null then raise exception 'Habit archived' using errcode='23514'; end if;
    if new.id<>old.id or new.user_id<>old.user_id or new.created_at<>old.created_at then
      raise exception 'Immutable ownership and creation date' using errcode='23514';
    end if;
    if new.deleted_at is not null then new.deleted_at:=clock_timestamp(); new.is_active:=false; end if;
  end if;
  new.title:=btrim(new.title);
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create trigger habit_guard before insert or update on public.habits for each row execute function app_private.guard_habit();

-- Only this private trigger may write dated state. It is not an exposed RPC.
create function app_private.record_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare local_day date; zone text;
begin
  if auth.uid() is null or auth.uid()<>new.user_id then raise exception 'Forbidden' using errcode='42501'; end if;
  if tg_op='UPDATE' then
    if old.is_active=new.is_active and old.deleted_at is not distinct from new.deleted_at then return new; end if;
  end if;
  select timezone into strict zone from public.profiles where id=new.user_id;
  local_day:=(clock_timestamp() at time zone zone)::date;
  insert into public.habit_activity_days(habit_id,user_id,effective_date,is_active)
  values(new.id,new.user_id,local_day,new.is_active and new.deleted_at is null)
  on conflict(habit_id,effective_date) do update set is_active=excluded.is_active;
  return new;
end $$;
create trigger habit_record_activity after insert or update on public.habits for each row execute function app_private.record_activity();

create function app_private.guard_checkin() returns trigger
language plpgsql set search_path='' as $$
declare owner_id uuid; target_id uuid; h public.habits; zone text; local_day date;
begin
  if tg_op='DELETE' then owner_id:=old.user_id;target_id:=old.habit_id;
  else owner_id:=new.user_id;target_id:=new.habit_id;end if;
  if owner_id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
  -- UPDATE and check-in changes serialize on the same habit row.
  select * into h from public.habits where id=target_id and user_id=owner_id for update;
  if h.id is null or h.deleted_at is not null then raise exception 'Habit unavailable' using errcode='23514'; end if;
  select timezone into strict zone from public.profiles where id=owner_id;
  local_day:=(clock_timestamp() at time zone zone)::date;
  if tg_op='DELETE' then
    if old.checkin_date<>local_day then raise exception 'Only today can be changed' using errcode='23514';end if;
    return old;
  end if;
  if not h.is_active then raise exception 'Habit paused' using errcode='23514';end if;
  if new.checkin_date is not null and new.checkin_date<>local_day then
    raise exception 'Only today can be changed' using errcode='23514';
  end if;
  new.checkin_date:=local_day;new.created_at:=clock_timestamp();
  return new;
end $$;
create trigger checkin_guard before insert or delete on public.habit_checkins for each row execute function app_private.guard_checkin();

drop policy habits_delete_own on public.habits;
revoke all on public.profiles,public.habits,public.habit_checkins,public.daily_summaries,public.habit_activity_days from anon,authenticated;
grant select on public.profiles,public.habits,public.habit_checkins,public.daily_summaries,public.habit_activity_days to authenticated;
grant insert(id,timezone) on public.profiles to authenticated;
grant insert(user_id,title,description,icon,color,is_active) on public.habits to authenticated;
grant update(title,description,icon,color,is_active,deleted_at) on public.habits to authenticated;
grant insert(habit_id,user_id,checkin_date) on public.habit_checkins to authenticated;
grant delete on public.habit_checkins to authenticated;
grant all on public.profiles,public.habit_activity_days to service_role;

create function public.current_local_date() returns date
language sql volatile security invoker set search_path='' as $$
  select (clock_timestamp() at time zone p.timezone)::date from public.profiles p where p.id=(select auth.uid());
$$;

create function public.habit_stats(p_habit_id uuid default null)
returns table(habit_id uuid,current_streak integer,longest_streak integer,completed_today boolean)
language sql stable security invoker set search_path='' as $$
with calendar as (
 select (statement_timestamp() at time zone p.timezone)::date as today from public.profiles p where p.id=(select auth.uid())
), numbered as (
 select c.habit_id,c.checkin_date,c.checkin_date-(row_number() over(partition by c.habit_id order by c.checkin_date))::integer as grp
 from public.habit_checkins c where c.user_id=(select auth.uid()) and (p_habit_id is null or c.habit_id=p_habit_id)
), runs as (
 select n.habit_id,min(n.checkin_date) as start_date,max(n.checkin_date) as end_date,count(*)::integer as length
 from numbered n group by n.habit_id,n.grp
)
select h.id,
 coalesce(max(r.length) filter(where r.end_date>=cal.today-1 and r.end_date<=cal.today),0)::integer,
 coalesce(max(r.length),0)::integer,
 exists(select 1 from public.habit_checkins c where c.habit_id=h.id and c.checkin_date=cal.today)
from public.habits h cross join calendar cal left join runs r on r.habit_id=h.id
where h.user_id=(select auth.uid()) and (p_habit_id is null or h.id=p_habit_id)
group by h.id,cal.today;
$$;

create function public.habit_progress(p_start_date date,p_end_date date)
returns table(date date,total_habits integer,completed_habits integer,completion_rate numeric)
language sql stable security invoker set search_path='' as $$
with days as (
 select p_start_date+i as day from generate_series(0,least(p_end_date-p_start_date,365)) i
), eligible as (
 select d.day,h.id from days d cross join public.habits h
 join lateral (select a.is_active from public.habit_activity_days a where a.habit_id=h.id and a.effective_date<=d.day order by a.effective_date desc limit 1) state on state.is_active
 where h.user_id=(select auth.uid())
)
select d.day,count(e.id)::integer,count(c.id)::integer,
case when count(e.id)=0 then null else round(100.0*count(c.id)/count(e.id),2) end
from days d left join eligible e on e.day=d.day
left join public.habit_checkins c on c.habit_id=e.id and c.checkin_date=d.day
group by d.day order by d.day;
$$;

-- Server-only aggregate RPC. Keyset cursor means refresh rows do not loop forever.
create function public.run_daily_summaries(p_cursor jsonb default null,p_limit integer default 200)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item record; processed integer:=0; next_cursor jsonb:=null; more boolean:=false; total integer; completed integer;
begin
 if p_limit<1 or p_limit>500 then raise exception 'Invalid batch size' using errcode='22023';end if;
 for item in
  with candidates as (
   select p.id as user_id,p.created_at,p.timezone,(clock_timestamp() at time zone p.timezone)::date as today
   from public.profiles p
  ), days as (
   select p.user_id,p.today,((p.created_at at time zone p.timezone)::date + i) as day
   from candidates p cross join lateral generate_series(0,p.today-(p.created_at at time zone p.timezone)::date-1) i
  )
  select d.user_id,d.day from days d left join public.daily_summaries s on s.user_id=d.user_id and s.summary_date=d.day
  where (s.id is null or d.day>=d.today-7)
  and (p_cursor is null or (d.user_id,d.day)>((p_cursor->>'user_id')::uuid,(p_cursor->>'summary_date')::date))
  order by d.user_id,d.day limit p_limit+1
 loop
  if processed=p_limit then more:=true;exit;end if;
  select count(*)::integer,count(c.id)::integer into total,completed
  from public.habits h
  join lateral(select a.is_active from public.habit_activity_days a where a.habit_id=h.id and a.effective_date<=item.day order by a.effective_date desc limit 1) state on state.is_active
  left join public.habit_checkins c on c.habit_id=h.id and c.checkin_date=item.day
  where h.user_id=item.user_id;
  insert into public.daily_summaries(user_id,summary_date,total_habits,completed_habits,completion_rate,generated_at)
  values(item.user_id,item.day,total,completed,case when total=0 then 0 else round(100.0*completed/total,2) end,clock_timestamp())
  on conflict(user_id,summary_date) do update set total_habits=excluded.total_habits,completed_habits=excluded.completed_habits,completion_rate=excluded.completion_rate,generated_at=excluded.generated_at;
  processed:=processed+1;
  next_cursor:=jsonb_build_object('user_id',item.user_id,'summary_date',item.day);
 end loop;
 return jsonb_build_object('processed',processed,'has_more',more,'next_cursor',case when more then next_cursor else null end);
end $$;

revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.current_local_date(),public.habit_stats(uuid),public.habit_progress(date,date),public.run_daily_summaries(jsonb,integer) from public,anon,authenticated;
grant execute on function public.current_local_date(),public.habit_stats(uuid),public.habit_progress(date,date) to authenticated;
grant execute on function public.run_daily_summaries(jsonb,integer) to service_role;
