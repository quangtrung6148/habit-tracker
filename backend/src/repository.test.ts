import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuth, createSummaryRunner } from './repository.js';
import { loadConfig } from './config.js';

const userId = '8a333c79-78fa-43c7-8423-6640b4c069bc';
const habitId = 'b3700d89-c353-4b24-b654-4d86bac948f9';
const config = loadConfig({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-test-key', SUPABASE_SERVICE_ROLE_KEY: 'private-service-key', SERVICE_API_KEY: 'x'.repeat(40) });
afterEach(() => vi.unstubAllGlobals());
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }

describe('real Supabase client credential and payload boundary', () => {
  it('verifies token remotely then uses only the publishable key plus user token for owned data', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return json({ id: userId, email: 'test@example.com', aud: 'authenticated', created_at: '2026-10-17T00:00:00Z' });
      if (url.includes('/habit_checkins')) return json({ id: 'checkin', habit_id: habitId, user_id: userId, checkin_date: '2026-10-17' });
      return json({ id: habitId, user_id: userId, title: 'Read' });
    });
    vi.stubGlobal('fetch', fetcher);
    const context = await createAuth(config)('actual-user-jwt');
    expect(context.user.id).toBe(userId);
    await context.repo.createHabit({ title: 'Read', icon: '📚', color: '#6366f1', is_active: true });
    await context.repo.createCheckin(habitId);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, init] of fetcher.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get('apikey')).toBe('public-test-key');
      expect(headers.get('authorization')).toBe('Bearer actual-user-jwt');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    const habitBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(habitBody.user_id).toBe(userId);
    const checkinBody = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body));
    expect(checkinBody).toEqual({ habit_id: habitId, user_id: userId });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('private-service-key');
  });
  it('rejects token if Supabase rejects it instead of trusting decoded claims', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Invalid token' }, 401)));
    await expect(createAuth(config)('forged-jwt')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });
  it('uses service credentials only for the separately constructed aggregate runner', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => json({ processed: 0, has_more: false, next_cursor: null }));
    vi.stubGlobal('fetch', fetcher);
    const runner = createSummaryRunner(config)!;
    await expect(runner(null, 200)).resolves.toEqual({ processed: 0, has_more: false, next_cursor: null });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('/rest/v1/rpc/run_daily_summaries');
    expect(new Headers(init?.headers).get('apikey')).toBe('private-service-key');
    expect(JSON.parse(String(init?.body))).toEqual({ p_cursor: null, p_limit: 200 });
    expect(createSummaryRunner({ ...config, SUPABASE_SERVICE_ROLE_KEY: '', SERVICE_API_KEY: '' })).toBeUndefined();
  });
  it('preserves a missing completion denominator as null while converting numeric rates', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => String(input).endsWith('/auth/v1/user')
      ? json({ id: userId, email: 'test@example.com', aud: 'authenticated', created_at: '2026-10-17T00:00:00Z' })
      : json([{ date: '2026-10-16', total_habits: 0, completed_habits: 0, completion_rate: null }, { date: '2026-10-17', total_habits: 2, completed_habits: 1, completion_rate: '50.00' }])));
    const context = await createAuth(config)('actual-user-jwt');
    const days = await context.repo.progress('2026-10-16', '2026-10-17');
    expect(days.map(day => day.completion_rate)).toEqual([null, 50]);
  });
});
