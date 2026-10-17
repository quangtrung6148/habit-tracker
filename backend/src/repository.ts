import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError, databaseError } from './errors.js';
import type { Config } from './config.js';
import type { Checkin, Habit, HabitInput, HabitPatch, HabitRepository, HabitStats, HabitStatus, PageInput, Profile, ProgressDay, SummaryCursor, SummaryResult, UserContext } from './types.js';

const habitColumns = 'id,user_id,title,description,icon,color,is_active,deleted_at,created_at,updated_at';
const checkinColumns = 'id,habit_id,user_id,checkin_date,created_at';
const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) });
function client(url: string, key: string, token?: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: timedFetch, headers: token ? { Authorization: `Bearer ${token}` } : {} } });
}
function unwrap<T>(result: { data: T | null; error: { code?: string; message?: string } | null }): T {
  if (result.error) throw databaseError(result.error);
  return result.data as T;
}

export class SupabaseHabitRepository implements HabitRepository {
  constructor(private db: SupabaseClient, private userId: string) {}
  async getProfile(): Promise<Profile | null> { return unwrap(await this.db.from('profiles').select('id,timezone,created_at').eq('id', this.userId).maybeSingle()); }
  async createProfile(timezone: string): Promise<Profile> { return unwrap(await this.db.from('profiles').insert({ id: this.userId, timezone }).select('id,timezone,created_at').single()); }
  async today(): Promise<string | null> { return unwrap(await this.db.rpc('current_local_date')); }
  async listHabits(status: HabitStatus, page: PageInput): Promise<{ habits: Habit[]; total: number }> {
    let query = this.db.from('habits').select(habitColumns, { count: 'exact' }).eq('user_id', this.userId).is('deleted_at', null);
    if (status !== 'all') query = query.eq('is_active', status === 'active');
    const result = await query.order('created_at', { ascending: false }).order('id').range((page.page - 1) * page.limit, page.page * page.limit - 1);
    return { habits: unwrap(result) ?? [], total: result.count ?? 0 };
  }
  async allHabits(): Promise<Habit[]> {
    const habits: Habit[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.listHabits('all', { page, limit: 1000 }); habits.push(...batch.habits);
      if (habits.length >= batch.total || batch.habits.length === 0) return habits;
    }
  }
  async getHabit(id: string): Promise<Habit | null> { return unwrap(await this.db.from('habits').select(habitColumns).eq('user_id', this.userId).eq('id', id).maybeSingle()); }
  async createHabit(input: HabitInput): Promise<Habit> { return unwrap(await this.db.from('habits').insert({ ...input, user_id: this.userId }).select(habitColumns).single()); }
  async updateHabit(id: string, input: HabitPatch | { deleted_at: string; is_active: false }): Promise<Habit | null> { return unwrap(await this.db.from('habits').update(input).eq('id', id).eq('user_id', this.userId).is('deleted_at', null).select(habitColumns).maybeSingle()); }
  async stats(id?: string): Promise<HabitStats[]> { return unwrap(await this.db.rpc('habit_stats', { p_habit_id: id ?? null })) ?? []; }
  async progress(start: string, end: string): Promise<ProgressDay[]> {
    const days = unwrap<ProgressDay[]>(await this.db.rpc('habit_progress', { p_start_date: start, p_end_date: end })) ?? [];
    return days.map(day => ({ ...day, total_habits: Number(day.total_habits), completed_habits: Number(day.completed_habits), completion_rate: day.completion_rate == null ? null : Number(day.completion_rate) }));
  }
  async listCheckins(id: string, page: PageInput): Promise<{ checkins: Checkin[]; total: number }> {
    const result = await this.db.from('habit_checkins').select(checkinColumns, { count: 'exact' }).eq('habit_id', id).eq('user_id', this.userId).order('checkin_date', { ascending: false }).range((page.page - 1) * page.limit, page.page * page.limit - 1);
    return { checkins: unwrap(result) ?? [], total: result.count ?? 0 };
  }
  async getTodayCheckin(id: string, today: string): Promise<Checkin | null> { return unwrap(await this.db.from('habit_checkins').select(checkinColumns).eq('habit_id', id).eq('user_id', this.userId).eq('checkin_date', today).maybeSingle()); }
  async createCheckin(id: string): Promise<Checkin> { return unwrap(await this.db.from('habit_checkins').insert({ habit_id: id, user_id: this.userId }).select(checkinColumns).single()); }
  async deleteTodayCheckin(id: string, today: string): Promise<void> { unwrap(await this.db.from('habit_checkins').delete().eq('habit_id', id).eq('user_id', this.userId).eq('checkin_date', today)); }
}

export function createAuth(config: Config): (token: string) => Promise<UserContext> {
  return async token => {
    const db = client(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, token);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    return { user: { id: data.user.id, email: data.user.email ?? null }, repo: new SupabaseHabitRepository(db, data.user.id) };
  };
}
export function createSummaryRunner(config: Config): ((cursor: SummaryCursor | null, limit: number) => Promise<SummaryResult>) | undefined {
  if (!config.SUPABASE_SERVICE_ROLE_KEY || !config.SERVICE_API_KEY) return undefined;
  // This privileged client is captured only by the internal endpoint handler, never a user repository.
  const db = client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  return async (cursor, limit) => unwrap(await db.rpc('run_daily_summaries', { p_cursor: cursor, p_limit: limit }));
}
