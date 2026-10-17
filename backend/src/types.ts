export interface Profile { id: string; timezone: string; created_at: string }
export interface Habit {
  id: string; user_id: string; title: string; description: string | null;
  icon: string; color: string; is_active: boolean; deleted_at: string | null;
  created_at: string; updated_at: string;
}
export interface HabitStats { habit_id: string; current_streak: number; longest_streak: number; completed_today: boolean }
export type HabitWithStats = Habit & Omit<HabitStats, 'habit_id'>;
export interface Checkin { id: string; habit_id: string; user_id: string; checkin_date: string; created_at: string }
export interface ProgressDay { date: string; total_habits: number; completed_habits: number; completion_rate: number | null }
export interface Pagination { page: number; limit: number; total: number; totalPages: number }
export interface PageInput { page: number; limit: number }
export type HabitStatus = 'active' | 'paused' | 'all';
export interface HabitInput { title: string; description?: string | null; icon: string; color: string; is_active: boolean }
export type HabitPatch = Partial<HabitInput>;
export interface SummaryCursor { user_id: string; summary_date: string }
export interface SummaryResult { processed: number; has_more: boolean; next_cursor: SummaryCursor | null }

export interface HabitRepository {
  getProfile(): Promise<Profile | null>;
  createProfile(timezone: string): Promise<Profile>;
  today(): Promise<string | null>;
  listHabits(status: HabitStatus, page: PageInput): Promise<{ habits: Habit[]; total: number }>;
  allHabits(): Promise<Habit[]>;
  getHabit(id: string): Promise<Habit | null>;
  createHabit(input: HabitInput): Promise<Habit>;
  updateHabit(id: string, input: HabitPatch | { deleted_at: string; is_active: false }): Promise<Habit | null>;
  stats(id?: string): Promise<HabitStats[]>;
  progress(start: string, end: string): Promise<ProgressDay[]>;
  listCheckins(id: string, page: PageInput): Promise<{ checkins: Checkin[]; total: number }>;
  getTodayCheckin(id: string, today: string): Promise<Checkin | null>;
  createCheckin(id: string): Promise<Checkin>;
  deleteTodayCheckin(id: string, today: string): Promise<void>;
}
export interface UserContext { user: { id: string; email: string | null }; repo: HabitRepository }
