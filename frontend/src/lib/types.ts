export type Profile = { id: string; timezone: string; created_at?: string };
export type Habit = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  icon: string;
  color: string;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  current_streak: number;
  longest_streak: number;
  completed_today: boolean;
};
export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export type Day = {
  date: string;
  total_habits: number;
  completed_habits: number;
  completion_rate: number | null;
};
export type Summary = {
  today: string;
  timezone: string;
  total_habits: number;
  completed_habits: number;
  completion_rate: number | null;
  longest_streak: number;
  habits: Habit[];
};
export type Progress = { today: string; timezone: string; days: Day[] };
export type HabitList = { habits: Habit[]; pagination: Pagination };
export type Checkin = { id: string; checkin_date: string; created_at: string };
