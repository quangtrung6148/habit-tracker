create index habit_checkins_habit_owner_idx on public.habit_checkins(habit_id,user_id);
create index habit_activity_habit_owner_idx on public.habit_activity_days(habit_id,user_id);
