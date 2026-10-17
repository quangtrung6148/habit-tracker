import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApiError } from './errors.js';
import type { Config } from './config.js';
import type { Habit, HabitStats, HabitWithStats, PageInput, Profile, SummaryCursor, SummaryResult, UserContext } from './types.js';

export interface AppDependencies {
  authenticate: (token: string) => Promise<UserContext>;
  runSummaries?: (cursor: SummaryCursor | null, limit: number) => Promise<SummaryResult>;
  log?: (entry: Record<string, unknown>) => void;
  rateLimits?: boolean;
}
const paginationSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
const listSchema = paginationSchema.extend({ status: z.enum(['active', 'paused', 'all']).default('all') }).strict();
const habitFields = { title: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).nullable().transform(value => value ?? '').optional(), icon: z.string().trim().min(1).max(32), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), is_active: z.boolean() };
const createHabitSchema = z.object({ ...habitFields, description: habitFields.description.default(''), icon: habitFields.icon.default('✨'), color: habitFields.color.default('#6366f1'), is_active: habitFields.is_active.default(true) }).strict();
const patchHabitSchema = z.object(habitFields).partial().strict().refine(value => Object.keys(value).length > 0);
const uuid = z.uuid();
const emptyBody = z.object({}).strict();
const cursorSchema = z.object({ user_id: uuid, summary_date: z.iso.date() }).strict();
const jobSchema = z.object({ cursor: cursorSchema.nullable().optional(), limit: z.number().int().min(1).max(500).default(200) }).strict();
function timezoneValid(timezone: string): boolean { try { new Intl.DateTimeFormat('en', { timeZone: timezone }); return !/^[+-]/.test(timezone); } catch { return false; } }
const profileSchema = z.object({ timezone: z.string().min(1).max(100).refine(timezoneValid) }).strict();
type Locals = { requestId: string; context: UserContext; profile: Profile; today: string };
function state(res: Response): Locals { return res.locals as Locals; }
function send(res: Response, data: unknown, status = 200, message = 'Thành công'): void { res.status(status).json({ success: true, data, message }); }
function pagination(page: PageInput, total: number) { return { page: page.page, limit: page.limit, total, totalPages: Math.ceil(total / page.limit) }; }
function decorate(habits: Habit[], stats: HabitStats[]): HabitWithStats[] {
  const byId = new Map(stats.map(stat => [stat.habit_id, stat]));
  return habits.map(habit => { const stat = byId.get(habit.id); return { ...habit, current_streak: Number(stat?.current_streak ?? 0), longest_streak: Number(stat?.longest_streak ?? 0), completed_today: stat?.completed_today ?? false }; });
}
function dateBefore(date: string, amount: number): string { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() - amount); return value.toISOString().slice(0, 10); }
function id(req: Request): string { return uuid.parse(req.params.id); }
async function requireHabit(res: Response, habitId: string, writable = false): Promise<Habit> {
  const habit = await state(res).context.repo.getHabit(habitId);
  if (!habit) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy thói quen.');
  if (writable && habit.deleted_at) throw new ApiError(409, 'HABIT_DELETED', 'Thói quen đã được xóa.');
  return habit;
}
async function detailedHabit(res: Response, habitId: string): Promise<HabitWithStats> {
  const habit = await requireHabit(res, habitId);
  const result = decorate([habit], await state(res).context.repo.stats(habitId))[0];
  return result!;
}
function secretMatches(actual: string, expected: string): boolean {
  return timingSafeEqual(createHash('sha256').update(actual).digest(), createHash('sha256').update(expected).digest());
}

export function createApp(config: Config, dependencies: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use((req, res, next) => {
    const requestId = randomUUID(); res.locals.requestId = requestId;
    res.set({ 'X-Request-Id': requestId, 'Cache-Control': 'no-store' });
    const started = Date.now();
    res.on('finish', () => dependencies.log?.({ event: 'request', requestId, method: req.method, status: res.statusCode, durationMs: Date.now() - started }));
    next();
  });
  app.use(helmet());
  const frontendOrigin = new URL(config.FRONTEND_URL).origin;
  app.use(cors({ origin: (origin, callback) => !origin || origin === frontendOrigin ? callback(null, true) : callback(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn yêu cầu không được phép.')), credentials: false, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type'] }));
  app.use((req, _res, next) => {
    if (config.NODE_ENV === 'production' && !req.secure && !['/health', '/api/v1/health'].includes(req.path)) throw new ApiError(426, 'HTTPS_REQUIRED', 'Yêu cầu kết nối HTTPS.');
    next();
  });
  if (dependencies.rateLimits !== false) app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, data: null, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', error: { code: 'RATE_LIMITED' }, requestId: state(res).requestId }); } }));
  app.use(express.json({ limit: '16kb', strict: true }));
  const health = (_req: Request, res: Response) => send(res, { status: 'ok', worker_configured: Boolean(dependencies.runSummaries) });
  app.get('/health', health); app.get('/api/v1/health', health);

  app.post('/api/v1/internal/daily-summary/run', async (req, res) => {
    if (!config.SERVICE_API_KEY || !dependencies.runSummaries) throw new ApiError(503, 'WORKER_NOT_CONFIGURED', 'Dịch vụ tổng hợp chưa được cấu hình.');
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !secretMatches(token, config.SERVICE_API_KEY)) throw new ApiError(401, 'UNAUTHORIZED', 'Không có quyền gọi dịch vụ nội bộ.');
    const input = jobSchema.parse(req.body ?? {});
    send(res, await dependencies.runSummaries(input.cursor ?? null, input.limit));
  });

  const api = express.Router();
  api.use(async (req, res, next) => {
    const header = req.get('authorization') ?? '';
    if (!/^Bearer [^\s]+$/.test(header) || header.length > 8192) throw new ApiError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập.');
    res.locals.context = await dependencies.authenticate(header.slice(7)); next();
  });
  api.get('/auth/me', async (_req, res) => {
    const { user, repo } = state(res).context;
    const profile = await repo.getProfile();
    send(res, { user, profile, today: profile ? await repo.today() : null });
  });
  api.post('/profile', async (req, res) => {
    const input = profileSchema.parse(req.body);
    const { repo } = state(res).context;
    if (await repo.getProfile()) throw new ApiError(409, 'PROFILE_ALREADY_SET', 'Múi giờ tài khoản đã được thiết lập và không thể thay đổi.');
    const profile = await repo.createProfile(input.timezone);
    send(res, { profile, today: await repo.today() }, 201);
  });
  api.use(async (_req, res, next) => {
    const { repo } = state(res).context; const profile = await repo.getProfile();
    if (!profile) throw new ApiError(409, 'PROFILE_REQUIRED', 'Vui lòng chọn múi giờ trước khi tiếp tục.');
    const today = await repo.today();
    if (!today) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Không thể xác định ngày hiện tại.');
    res.locals.profile = profile; res.locals.today = today; next();
  });
  api.get('/habits', async (req, res) => {
    const input = listSchema.parse(req.query); const { repo } = state(res).context;
    const [{ habits, total }, stats] = await Promise.all([repo.listHabits(input.status, input), repo.stats()]);
    send(res, { habits: decorate(habits, stats), pagination: pagination(input, total) });
  });
  api.post('/habits', async (req, res) => {
    const input = createHabitSchema.parse(req.body); const { repo } = state(res).context;
    const habit = await repo.createHabit(input);
    send(res, { habit: decorate([habit], await repo.stats(habit.id))[0] }, 201);
  });
  api.get('/habits/:id', async (req, res) => send(res, { habit: await detailedHabit(res, id(req)) }));
  api.patch('/habits/:id', async (req, res) => {
    const habitId = id(req); const input = patchHabitSchema.parse(req.body); await requireHabit(res, habitId, true);
    const habit = await state(res).context.repo.updateHabit(habitId, input);
    if (!habit) throw new ApiError(409, 'HABIT_CHANGED', 'Thói quen đã thay đổi. Vui lòng tải lại.');
    send(res, { habit: await detailedHabit(res, habitId) });
  });
  api.delete('/habits/:id', async (req, res) => {
    const habitId = id(req); const habit = await requireHabit(res, habitId);
    if (!habit.deleted_at) await state(res).context.repo.updateHabit(habitId, { is_active: false, deleted_at: new Date().toISOString() });
    send(res, { id: habitId });
  });
  api.get('/habits/:id/checkins', async (req, res) => {
    const habitId = id(req); const input = paginationSchema.strict().parse(req.query); await requireHabit(res, habitId);
    const { checkins, total } = await state(res).context.repo.listCheckins(habitId, input);
    send(res, { checkins, pagination: pagination(input, total), today: state(res).today, timezone: state(res).profile.timezone });
  });
  api.post('/habits/:id/checkin', async (req, res) => {
    const habitId = id(req); emptyBody.parse(req.body ?? {}); const habit = await requireHabit(res, habitId, true);
    const { repo } = state(res).context;
    let checkin = await repo.getTodayCheckin(habitId, state(res).today); let status = 200;
    if (!checkin) {
      if (!habit.is_active) throw new ApiError(409, 'HABIT_INACTIVE', 'Thói quen đang tạm dừng.');
      try { checkin = await repo.createCheckin(habitId); status = 201; }
      catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'CONFLICT') throw error;
        checkin = await repo.getTodayCheckin(habitId, state(res).today);
        if (!checkin) throw error;
      }
    }
    send(res, { checkin, habit: await detailedHabit(res, habitId) }, status);
  });
  api.delete('/habits/:id/checkin', async (req, res) => {
    const habitId = id(req); emptyBody.parse(req.body ?? {}); await requireHabit(res, habitId, true);
    await state(res).context.repo.deleteTodayCheckin(habitId, state(res).today);
    send(res, { habit: await detailedHabit(res, habitId) });
  });
  api.get('/dashboard/summary', async (_req, res) => {
    const { context: { repo }, today, profile } = state(res);
    const [habits, stats, progress] = await Promise.all([repo.allHabits(), repo.stats(), repo.progress(today, today)]);
    const day = progress[0] ?? { date: today, total_habits: 0, completed_habits: 0, completion_rate: 0 };
    send(res, { today, timezone: profile.timezone, total_habits: day.total_habits, completed_habits: day.completed_habits, completion_rate: day.completion_rate, longest_streak: Math.max(0, ...stats.map(stat => Number(stat.longest_streak))), habits: decorate(habits, stats) });
  });
  api.get('/dashboard/progress', async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(31).default(7) }).strict().parse(req.query);
    const { context: { repo }, today, profile } = state(res);
    send(res, { today, timezone: profile.timezone, days: await repo.progress(dateBefore(today, days - 1), today) });
  });
  app.use('/api/v1', api);
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Không tìm thấy tài nguyên.')));
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (res.headersSent) return;
    let failure: ApiError;
    if (error instanceof ApiError) failure = error;
    else if (error instanceof z.ZodError) failure = new ApiError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
    else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') failure = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Yêu cầu vượt quá dung lượng cho phép.');
    else if (error instanceof SyntaxError && 'body' in error) failure = new ApiError(400, 'INVALID_JSON', 'JSON không hợp lệ.');
    else failure = new ApiError(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi. Vui lòng thử lại.');
    dependencies.log?.({ event: 'request_error', requestId: state(res).requestId, code: failure.code, status: failure.status });
    res.status(failure.status).json({ success: false, data: null, message: failure.message, error: { code: failure.code }, requestId: state(res).requestId });
  };
  app.use(errorHandler);
  return app;
}
