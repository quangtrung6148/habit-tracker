
create extension if not exists pgcrypto;
create table public.habits (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title varchar(120) not null check (length(btrim(title)) between 1 and 120),
 description text not null default '',
 icon varchar(40),
 color varchar(30),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (id,user_id)
);
create index habits_user_id_idx on public.habits(user_id);
create table public.habit_checkins (
 id uuid primary key default gen_random_uuid(),
 habit_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 checkin_date date not null,
 created_at timestamptz not null default now(),
 foreign key (habit_id,user_id) references public.habits(id,user_id) on delete cascade,
 unique (habit_id,checkin_date)
);
create index habit_checkins_user_date_idx on public.habit_checkins(user_id,checkin_date);
create table public.daily_summaries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 summary_date date not null,
 total_habits integer not null default 0 check (total_habits >= 0),
 completed_habits integer not null default 0 check (completed_habits >= 0 and completed_habits <= total_habits),
 completion_rate numeric(5,2) not null default 0 check (completion_rate between 0 and 100),
 generated_at timestamptz not null default now(),
 unique (user_id,summary_date)
);
alter table public.habits enable row level security;
alter table public.habit_checkins enable row level security;
alter table public.daily_summaries enable row level security;
create policy habits_select_own on public.habits for select to authenticated using ((select auth.uid()) = user_id);
create policy habits_insert_own on public.habits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy habits_update_own on public.habits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy habits_delete_own on public.habits for delete to authenticated using ((select auth.uid()) = user_id);
create policy checkins_select_own on public.habit_checkins for select to authenticated using ((select auth.uid()) = user_id);
create policy checkins_insert_own on public.habit_checkins for insert to authenticated with check ((select auth.uid()) = user_id);
create policy checkins_delete_own on public.habit_checkins for delete to authenticated using ((select auth.uid()) = user_id);
create policy summaries_select_own on public.daily_summaries for select to authenticated using ((select auth.uid()) = user_id);

