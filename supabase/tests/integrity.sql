-- Transactional fixtures: every row and DDL alteration is rolled back.
begin;
set local statement_timeout='30s';
insert into auth.users(id,email) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','habit-test-a@example.invalid'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','habit-test-b@example.invalid'),
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4','habit-test-zone@example.invalid');
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}',true);
set local role authenticated;
insert into public.profiles(id,timezone) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Asia/Ho_Chi_Minh');
insert into public.habits(user_id,title) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Integration habit');
do $$ declare h uuid; d date; r record; begin
 select id into strict h from public.habits where title='Integration habit';
 select public.current_local_date() into d;
 if d<>(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Local date mismatch';end if;
 insert into public.habit_checkins(habit_id,user_id) values(h,auth.uid());
 begin insert into public.habit_checkins(habit_id,user_id) values(h,auth.uid());raise exception 'Duplicate accepted';exception when unique_violation then null;end;
 if (select count(*) from public.habit_checkins where habit_id=h)<>1 then raise exception 'Duplicate count';end if;
 select * into strict r from public.habit_stats(h);
 if r.current_streak<>1 or r.longest_streak<>1 or not r.completed_today then raise exception 'Today streak incorrect';end if;
 begin insert into public.habit_checkins(habit_id,user_id,checkin_date) values(h,auth.uid(),d-1);raise exception 'Past insert accepted';exception when check_violation then null;end;
 begin insert into public.habit_checkins(habit_id,user_id,checkin_date) values(h,auth.uid(),d+1);raise exception 'Future insert accepted';exception when check_violation then null;end;
 begin update public.profiles set timezone='UTC';raise exception 'Timezone mutable';exception when insufficient_privilege then null;end;
 begin update public.habits set created_at=now()-interval '10 days' where id=h;raise exception 'Creation mutable';exception when insufficient_privilege then null;end;
 begin update public.habit_checkins set checkin_date=d-1 where habit_id=h;raise exception 'Checkin update allowed';exception when insufficient_privilege then null;end;
 begin delete from public.habits where id=h;raise exception 'Hard delete accepted';exception when insufficient_privilege then null;end;
 begin insert into public.daily_summaries(user_id,summary_date) values(auth.uid(),d);raise exception 'Summary write allowed';exception when insufficient_privilege then null;end;
 begin insert into public.habit_activity_days(habit_id,user_id,effective_date,is_active) values(h,auth.uid(),d-1,false);raise exception 'Activity write allowed';exception when insufficient_privilege then null;end;
 update public.habits set is_active=false where id=h;
 select * into strict r from public.habit_progress(d,d);
 if r.total_habits<>0 or r.completed_habits<>0 or r.completion_rate is not null then raise exception 'Pause denominator';end if;
 if (select count(*) from public.habit_checkins where habit_id=h)<>1 then raise exception 'Earned check lost';end if;
 update public.habits set is_active=true where id=h;
 select * into strict r from public.habit_progress(d,d);
 if r.total_habits<>1 or r.completed_habits<>1 or r.completion_rate<>100 then raise exception 'Resume completion';end if;
 delete from public.habit_checkins where habit_id=h;
 select * into strict r from public.habit_stats(h);
 if r.current_streak<>0 or r.longest_streak<>0 or r.completed_today then raise exception 'Undo streak';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated"}',true);
set local role authenticated;
insert into public.profiles(id,timezone) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','Pacific/Honolulu');
select set_config('habit_test.west_day',public.current_local_date()::text,true);
do $$ begin
 if exists(select 1 from public.habits) then raise exception 'Cross-owner read leak';end if;
 if exists(select 1 from public.habit_activity_days) then raise exception 'Cross-owner activity leak';end if;
 if exists(select 1 from public.habit_stats(null)) then raise exception 'Stats owner leak';end if;
 begin insert into public.habits(user_id,title) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Attack');raise exception 'Cross-owner insert allowed';exception when insufficient_privilege then null;end;
 begin perform public.run_daily_summaries(null,200);raise exception 'Worker RPC allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- These zones are exactly 24 hours apart: the actual app clock must return
-- different calendar dates regardless of when this test executes.
select set_config('request.jwt.claims','{"sub":"dddddddd-dddd-4ddd-8ddd-ddddddddddd4","role":"authenticated"}',true);
set local role authenticated;
insert into public.profiles(id,timezone) values('dddddddd-dddd-4ddd-8ddd-ddddddddddd4','Pacific/Kiritimati');
insert into public.habits(user_id,title) values('dddddddd-dddd-4ddd-8ddd-ddddddddddd4','Timezone boundary');
insert into public.habit_checkins(habit_id,user_id) select id,auth.uid() from public.habits where title='Timezone boundary';
do $$ declare d date:=public.current_local_date();begin
 if d<>current_setting('habit_test.west_day')::date+1 then raise exception 'Calendar day incorrectly uses UTC/browser timezone';end if;
 if (select checkin_date from public.habit_checkins)<>d then raise exception 'Checkin date ignores account timezone';end if;
 if (select current_streak from public.habit_stats(null))<>1 then raise exception 'Streak ignores local day boundary';end if;
end $$;
reset role;
-- Trusted fixture setup only: create historical dates to verify the actual SQL streak engine.
alter table public.habits disable trigger user;
alter table public.habit_checkins disable trigger user;
insert into public.habits(id,user_id,title,created_at) values
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Historical',(clock_timestamp()-interval '12 days'));
insert into public.habit_activity_days(habit_id,user_id,effective_date,is_active)
 values('cccccccc-cccc-4ccc-8ccc-ccccccccccc3','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date-12,true);
insert into public.habit_checkins(habit_id,user_id,checkin_date)
 select 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date-i from unnest(array[6,5,4,2,1]) i;
update public.profiles set created_at=clock_timestamp()-interval '12 days' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
alter table public.habits enable trigger user;
alter table public.habit_checkins enable trigger user;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}',true);
set local role authenticated;
do $$ declare r record; d date:=public.current_local_date(); begin
 select * into strict r from public.habit_stats('cccccccc-cccc-4ccc-8ccc-ccccccccccc3');
 if r.current_streak<>2 or r.longest_streak<>3 or r.completed_today then raise exception 'Historical streak mismatch';end if;
 begin delete from public.habit_checkins where habit_id='cccccccc-cccc-4ccc-8ccc-ccccccccccc3' and checkin_date=d-1;raise exception 'Historical undo accepted';exception when check_violation then null;end;
 update public.habits set is_active=false where id='cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
 select * into strict r from public.habit_progress(d-1,d-1);
 if r.total_habits<>1 or r.completed_habits<>1 then raise exception 'Past denominator changed';end if;
 update public.habits set deleted_at=clock_timestamp() where id='cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
 if (select count(*) from public.habit_checkins where habit_id='cccccccc-cccc-4ccc-8ccc-ccccccccccc3')<>5 then raise exception 'Delete lost history';end if;
 begin update public.habits set is_active=true where id='cccccccc-cccc-4ccc-8ccc-ccccccccccc3';raise exception 'Resurrection accepted';exception when check_violation then null;end;
end $$;
reset role;
set local role service_role;
do $$ declare job jsonb; cursor_value jsonb:=null; batches integer:=0; expected integer; begin
 loop
  job:=public.run_daily_summaries(cursor_value,2);batches:=batches+1;
  exit when not (job->>'has_more')::boolean;
  cursor_value:=job->'next_cursor';
  if batches>30 then raise exception 'Cursor did not terminate';end if;
 end loop;
 select count(*) into expected from public.daily_summaries where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
 if expected<>12 then raise exception 'Missing closed summaries: %',expected;end if;
 perform public.run_daily_summaries(null,200);
 if (select count(*) from public.daily_summaries where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')<>expected then raise exception 'Duplicate summaries';end if;
 delete from public.daily_summaries where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and summary_date=(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date-10;
 perform public.run_daily_summaries(null,200);
 if (select count(*) from public.daily_summaries where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')<>expected then raise exception 'Old hole not repaired';end if;
end $$;
reset role;
delete from auth.users where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','dddddddd-dddd-4ddd-8ddd-ddddddddddd4');
do $$ begin if exists(select 1 from public.habit_checkins where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') then raise exception 'Account cascade cleanup failed';end if;end $$;
rollback;
select 'PASS: ownership, immutable dates, pause/resume, streaks, archives, summary replay and gap repair (fixtures rolled back)' as verification;
