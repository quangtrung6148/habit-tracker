import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { ApiError } from './errors.js';
import { loadConfig } from './config.js';
import type { Habit, HabitRepository, Profile } from './types.js';

const userId = '8a333c79-78fa-43c7-8423-6640b4c069bc';
const habitId = 'b3700d89-c353-4b24-b654-4d86bac948f9';
const today = '2026-10-17';
const profile: Profile = { id: userId, timezone: 'Asia/Ho_Chi_Minh', created_at: '2026-10-17T00:00:00Z' };
const habit: Habit = { id: habitId, user_id: userId, title: 'Đọc sách', description: null, icon: '📚', color: '#6366f1', is_active: true, deleted_at: null, created_at: '2026-10-17T00:00:00Z', updated_at: '2026-10-17T00:00:00Z' };
const checkin = { id: 'e1d70b00-2e0b-4b1f-bb61-cb9d72407cbf', habit_id: habitId, user_id: userId, checkin_date: today, created_at: '2026-10-17T01:00:00Z' };
const config = loadConfig({ NODE_ENV: 'test', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key', FRONTEND_URL: 'http://localhost:3000', SERVICE_API_KEY: 'x'.repeat(40), SUPABASE_SERVICE_ROLE_KEY: 'private-test-key' });
function mockRepository() {
  return {
    getProfile: vi.fn().mockResolvedValue(profile), createProfile: vi.fn().mockResolvedValue(profile), today: vi.fn().mockResolvedValue(today),
    listHabits: vi.fn().mockResolvedValue({ habits: [habit], total: 1 }), allHabits: vi.fn().mockResolvedValue([habit]), getHabit: vi.fn().mockResolvedValue(habit),
    createHabit: vi.fn().mockResolvedValue(habit), updateHabit: vi.fn().mockResolvedValue(habit),
    stats: vi.fn().mockResolvedValue([{ habit_id: habitId, current_streak: 3, longest_streak: 5, completed_today: false }]),
    progress: vi.fn().mockResolvedValue([{ date: today, total_habits: 1, completed_habits: 0, completion_rate: 0 }]),
    listCheckins: vi.fn().mockResolvedValue({ checkins: [checkin], total: 1 }), getTodayCheckin: vi.fn().mockResolvedValue(null),
    createCheckin: vi.fn().mockResolvedValue(checkin), deleteTodayCheckin: vi.fn().mockResolvedValue(undefined),
  } satisfies HabitRepository;
}
let repo: ReturnType<typeof mockRepository>;
let authenticate: ReturnType<typeof vi.fn>;
let runSummaries: ReturnType<typeof vi.fn>;
let log: ReturnType<typeof vi.fn>;
function app() { return createApp(config, { authenticate: token => authenticate(token), runSummaries: (cursor, limit) => runSummaries(cursor, limit), log, rateLimits: false }); }
const auth = { Authorization: 'Bearer verified-user-token' };
beforeEach(() => {
  repo = mockRepository(); log = vi.fn(); runSummaries = vi.fn().mockResolvedValue({ processed: 2, has_more: false, next_cursor: null });
  authenticate = vi.fn(async token => {
    if (token !== 'verified-user-token') throw new ApiError(401, 'UNAUTHORIZED', 'Phiên không hợp lệ.');
    return { user: { id: userId, email: 'test@example.com' }, repo };
  });
});

describe('authentication and profile setup', () => {
  it('exposes health without authentication', async () => {
    const result = await request(app()).get('/health');
    expect(result.status).toBe(200); expect(result.body.data.status).toBe('ok'); expect(authenticate).not.toHaveBeenCalled();
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('rejects missing, malformed, invalid tokens and does not treat a worker key as a user', async () => {
    for (const header of ['', 'Basic hello', 'Bearer invalid', `Bearer ${config.SERVICE_API_KEY}`]) {
      const result = await request(app()).get('/api/v1/habits').set('Authorization', header);
      expect(result.status).toBe(401); expect(result.body.error.code).toBe('UNAUTHORIZED');
    }
    expect(repo.listHabits).not.toHaveBeenCalled();
  });
  it('allows auth/me before profile setup, but protects data endpoints with PROFILE_REQUIRED', async () => {
    repo.getProfile.mockResolvedValue(null);
    const me = await request(app()).get('/api/v1/auth/me').set(auth);
    expect(me.body.data).toEqual({ user: { id: userId, email: 'test@example.com' }, profile: null, today: null });
    const habits = await request(app()).get('/api/v1/habits').set(auth);
    expect(habits.status).toBe(409); expect(habits.body.error.code).toBe('PROFILE_REQUIRED'); expect(repo.listHabits).not.toHaveBeenCalled();
  });
  it('validates timezone setup and prevents changing an established timezone', async () => {
    const existing = await request(app()).post('/api/v1/profile').set(auth).send({ timezone: 'America/New_York' });
    expect(existing.status).toBe(409); expect(repo.createProfile).not.toHaveBeenCalled();
    repo.getProfile.mockResolvedValue(null);
    expect((await request(app()).post('/api/v1/profile').set(auth).send({ timezone: 'Made/Up' })).status).toBe(400);
    const result = await request(app()).post('/api/v1/profile').set(auth).send({ timezone: 'Asia/Ho_Chi_Minh' });
    expect(result.status).toBe(201); expect(repo.createProfile).toHaveBeenCalledWith('Asia/Ho_Chi_Minh');
  });
});
describe('habit API boundaries', () => {
  it('rejects client ownership and unknown fields, trims valid input', async () => {
    const forged = await request(app()).post('/api/v1/habits').set(auth).send({ title: 'Test', user_id: 'someone-else' });
    expect(forged.status).toBe(400); expect(repo.createHabit).not.toHaveBeenCalled();
    const created = await request(app()).post('/api/v1/habits').set(auth).send({ title: '  Đọc sách  ' });
    expect(created.status).toBe(201); expect(repo.createHabit).toHaveBeenCalledWith({ title: 'Đọc sách', description: '', icon: '✨', color: '#6366f1', is_active: true });
    expect(created.body.data.habit.current_streak).toBe(3);
  });
  it('validates filters/pagination and returns exact pagination shape', async () => {
    expect((await request(app()).get('/api/v1/habits?status=deleted').set(auth)).status).toBe(400);
    expect((await request(app()).get('/api/v1/habits?limit=1000').set(auth)).status).toBe(400);
    const result = await request(app()).get('/api/v1/habits?status=paused&page=2&limit=5').set(auth);
    expect(result.status).toBe(200); expect(result.body.data.pagination).toEqual({ page: 2, limit: 5, total: 1, totalPages: 1 });
    expect(repo.listHabits).toHaveBeenCalledWith('paused', { status: 'paused', page: 2, limit: 5 });
  });
  it('returns 404 without mutating a habit outside the owned repository', async () => {
    repo.getHabit.mockResolvedValue(null);
    const result = await request(app()).patch(`/api/v1/habits/${habitId}`).set(auth).send({ title: 'Attack' });
    expect(result.status).toBe(404); expect(repo.updateHabit).not.toHaveBeenCalled();
  });
  it('keeps deleted details readable and rejects edits', async () => {
    repo.getHabit.mockResolvedValue({ ...habit, deleted_at: '2026-10-17T01:00:00Z', is_active: false });
    expect((await request(app()).get(`/api/v1/habits/${habitId}`).set(auth)).status).toBe(200);
    expect((await request(app()).patch(`/api/v1/habits/${habitId}`).set(auth).send({ title: 'New' })).status).toBe(409);
    expect(repo.updateHabit).not.toHaveBeenCalled();
  });
  it('soft deletes through update and makes repeated DELETE successful', async () => {
    expect((await request(app()).delete(`/api/v1/habits/${habitId}`).set(auth)).status).toBe(200);
    expect(repo.updateHabit).toHaveBeenCalledWith(habitId, { is_active: false, deleted_at: expect.any(String) });
    repo.getHabit.mockResolvedValue({ ...habit, deleted_at: '2026-10-17T01:00:00Z' }); repo.updateHabit.mockClear();
    expect((await request(app()).delete(`/api/v1/habits/${habitId}`).set(auth)).status).toBe(200); expect(repo.updateHabit).not.toHaveBeenCalled();
  });
});
describe('checkin idempotency and rules', () => {
  it('rejects a supplied date and creates only through the date-free repository operation', async () => {
    const invalid = await request(app()).post(`/api/v1/habits/${habitId}/checkin`).set(auth).send({ checkin_date: '2026-10-16' });
    expect(invalid.status).toBe(400); expect(repo.createCheckin).not.toHaveBeenCalled();
    const result = await request(app()).post(`/api/v1/habits/${habitId}/checkin`).set(auth).send({});
    expect(result.status).toBe(201); expect(repo.createCheckin).toHaveBeenCalledWith(habitId); expect(result.body.data.checkin).toEqual(checkin);
  });
  it('returns an existing checkin on repeat and recovers from a concurrent unique violation', async () => {
    repo.getTodayCheckin.mockResolvedValueOnce(checkin);
    expect((await request(app()).post(`/api/v1/habits/${habitId}/checkin`).set(auth).send({})).status).toBe(200);
    expect(repo.createCheckin).not.toHaveBeenCalled();
    repo.getTodayCheckin.mockResolvedValueOnce(null).mockResolvedValueOnce(checkin);
    repo.createCheckin.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'Duplicate'));
    expect((await request(app()).post(`/api/v1/habits/${habitId}/checkin`).set(auth).send({})).status).toBe(200);
  });
  it('rejects new checkin while paused but permits undo of today, and disallows deleted mutations', async () => {
    repo.getHabit.mockResolvedValue({ ...habit, is_active: false });
    expect((await request(app()).post(`/api/v1/habits/${habitId}/checkin`).set(auth).send({})).status).toBe(409);
    expect((await request(app()).delete(`/api/v1/habits/${habitId}/checkin`).set(auth)).status).toBe(200);
    expect(repo.deleteTodayCheckin).toHaveBeenCalledWith(habitId, today);
    repo.getHabit.mockResolvedValue({ ...habit, deleted_at: '2026-10-17T01:00:00Z' }); repo.deleteTodayCheckin.mockClear();
    expect((await request(app()).delete(`/api/v1/habits/${habitId}/checkin`).set(auth)).status).toBe(409); expect(repo.deleteTodayCheckin).not.toHaveBeenCalled();
  });
});
describe('dashboard and internal worker', () => {
  it('uses database current date and RPC counts including retained paused completions', async () => {
    repo.today.mockResolvedValue('2026-03-09');
    repo.progress.mockResolvedValue([{ date: '2026-03-09', total_habits: 2, completed_habits: 1, completion_rate: 50 }]);
    const result = await request(app()).get('/api/v1/dashboard/summary').set(auth);
    expect(result.body.data).toMatchObject({ today: '2026-03-09', total_habits: 2, completed_habits: 1, completion_rate: 50, longest_streak: 5 });
    await request(app()).get('/api/v1/dashboard/progress').set(auth);
    expect(repo.progress).toHaveBeenLastCalledWith('2026-03-03', '2026-03-09');
  });
  it('returns zeros for an empty dashboard', async () => {
    repo.allHabits.mockResolvedValue([]); repo.stats.mockResolvedValue([]); repo.progress.mockResolvedValue([]);
    const result = await request(app()).get('/api/v1/dashboard/summary').set(auth);
    expect(result.body.data).toMatchObject({ total_habits: 0, completed_habits: 0, completion_rate: 0, longest_streak: 0, habits: [] });
  });
  it('requires the worker secret and validates replay cursor before privileged execution', async () => {
    for (const token of ['', 'wrong-key', 'verified-user-token']) {
      const response = await request(app()).post('/api/v1/internal/daily-summary/run').set('Authorization', `Bearer ${token}`).send({});
      expect(response.status).toBe(401);
    }
    expect(runSummaries).not.toHaveBeenCalled();
    const key = { Authorization: `Bearer ${config.SERVICE_API_KEY}` };
    expect((await request(app()).post('/api/v1/internal/daily-summary/run').set(key).send({ limit: 501 })).status).toBe(400);
    const cursor = { user_id: userId, summary_date: '2026-10-16' };
    const response = await request(app()).post('/api/v1/internal/daily-summary/run').set(key).send({ cursor, limit: 100 });
    expect(response.status).toBe(200); expect(runSummaries).toHaveBeenCalledExactlyOnceWith(cursor, 100); expect(authenticate).not.toHaveBeenCalled();
  });
  it('returns explicit worker-disabled health and 503 while ordinary user API remains available', async () => {
    const degraded = createApp({ ...config, SERVICE_API_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' }, { authenticate: token => authenticate(token), rateLimits: false });
    expect((await request(degraded).get('/health')).body.data.worker_configured).toBe(false);
    expect((await request(degraded).get('/api/v1/habits').set(auth)).status).toBe(200);
    expect((await request(degraded).post('/api/v1/internal/daily-summary/run').send({})).status).toBe(503);
  });
});
describe('transport and error handling', () => {
  it('rejects disallowed origins and never exposes or logs token/body/error details', async () => {
    expect((await request(app()).get('/api/v1/habits').set(auth).set('Origin', 'https://evil.example')).status).toBe(403);
    const secret = 'DO-NOT-EXPOSE-PRIVATE-KEY'; repo.allHabits.mockRejectedValue(new Error(secret));
    const result = await request(app()).get('/api/v1/dashboard/summary').set(auth);
    expect(result.status).toBe(500); expect(result.body.error.code).toBe('INTERNAL_ERROR'); expect(result.body.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(result.body)).not.toContain(secret); expect(JSON.stringify(log.mock.calls)).not.toContain(secret); expect(JSON.stringify(log.mock.calls)).not.toContain('verified-user-token');
  });
  it('handles malformed/oversized JSON and rejects client state fields', async () => {
    expect((await request(app()).post('/api/v1/habits').set(auth).set('Content-Type', 'application/json').send('{broken')).status).toBe(400);
    expect((await request(app()).post('/api/v1/habits').set(auth).send({ title: 'x'.repeat(20_000) })).status).toBe(413);
    expect((await request(app()).patch(`/api/v1/habits/${habitId}`).set(auth).send({ deleted_at: '2020-01-01' })).status).toBe(400);
  });
  it('requires HTTPS in production with an explicitly trusted proxy', async () => {
    const production = createApp({ ...config, NODE_ENV: 'production', TRUST_PROXY_HOPS: 1 }, { authenticate: token => authenticate(token), rateLimits: false });
    expect((await request(production).get('/api/v1/auth/me').set(auth)).status).toBe(426);
    expect((await request(production).get('/api/v1/auth/me').set(auth).set('X-Forwarded-Proto', 'https')).status).toBe(200);
  });
});
