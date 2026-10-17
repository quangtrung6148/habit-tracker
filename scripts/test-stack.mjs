import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// This harness creates and deletes real users. It MUST never target a hosted project.
const root = fileURLToPath(new URL('..', import.meta.url));
function loopback(value, label) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error(`${label} must be a loopback HTTP(S) origin. Hosted integration runs are prohibited.`);
  }
  return url.origin;
}
const supabaseUrl = loopback(process.env.SUPABASE_URL || process.env.API_URL || 'http://127.0.0.1:54321', 'SUPABASE_URL');
const mailUrl = loopback(process.env.MAILPIT_URL || 'http://127.0.0.1:54324', 'MAILPIT_URL');
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.PUBLISHABLE_KEY || process.env.ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
if (!publishableKey || !serviceKey) throw new Error('Export local SUPABASE_PUBLISHABLE_KEY/ANON_KEY and SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY from supabase status -o env.');
const frontendUrl = 'http://127.0.0.1:3000';
const backendUrl = 'http://127.0.0.1:5000';
const workerKey = randomBytes(32).toString('hex');
const password = `Stack-${randomBytes(24).toString('base64url')}-9!`;
const runId = randomUUID().replaceAll('-', '');
const emails = { browser: `stack-browser-${runId}@example.test`, a: `stack-a-${runId}@example.test`, b: `stack-b-${runId}@example.test` };
const secrets = [publishableKey, serviceKey, workerKey, password];
const children = [];
const ownedUsers = new Set();
let browser;
let admin;
let interrupted = false;
function safeMessage(error) {
  let text = error instanceof Error ? error.message : 'Integration harness failed.';
  for (const value of secrets) if (value) text = text.replaceAll(value, '[redacted]');
  return text.replace(/([?&](?:code|token|token_hash|access_token|refresh_token)=)[^\s&"']+/gi, '$1[redacted]').slice(0, 4000);
}
const log = message => console.log(`[stack] ${message}`);
const delay = ms => new Promise(done => setTimeout(done, ms));
async function http(url, init = {}) {
  const result = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  const text = await result.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* Mail HTML and readiness responses need not be JSON. */ }
  return { status: result.status, data, text, headers: result.headers };
}
async function api(token, path, method = 'GET', body) {
  return http(`${backendUrl}/api/v1/${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function rest(token, path, method = 'GET', body) {
  return http(`${supabaseUrl}/rest/v1/${path}`, { method, headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function expected(result, status, label) {
  assert.equal(result.status, status, `${label}: unexpected HTTP status ${result.status}`);
  return result.data?.data;
}
async function portFree(port) {
  await new Promise((done, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${port} is occupied. Stop existing development services before running the local harness.`)));
    server.listen(port, '127.0.0.1', () => server.close(done));
  });
}
function startChild(name, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.finished = false; child.on('exit', () => { child.finished = true; });
  child.on('error', error => { child.spawnFailure = safeMessage(error); });
  // Next logs confirmation URLs with single-use codes. Drain output without retaining auth-bearing logs.
  child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
  children.push({ name, child });
  return child;
}
async function ready(url, child, label, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error('Integration harness interrupted.');
    if (child && (child.spawnFailure || child.finished)) throw new Error(`${label} stopped before readiness (${child.spawnFailure || `exit ${child.exitCode ?? child.signalCode}`}).`);
    try { if ((await http(url)).status === 200) return; } catch { /* Retry only while the local process starts. */ }
    await delay(400);
  }
  throw new Error(`${label} did not become ready within ${timeout / 1000} seconds.`);
}
async function stopChildren() {
  await Promise.all([...children].reverse().map(async ({ child }) => {
    if (!child.pid || child.finished) return;
    if (process.platform === 'win32') {
      await new Promise(done => { const stop = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); stop.on('error', done); stop.on('exit', done); });
      return;
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
    const deadline = Date.now() + 5000;
    while (!child.finished && Date.now() < deadline) await delay(100);
    if (!child.finished) try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already stopped. */ }
  }));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; void browser?.close(); void stopChildren(); });

async function localUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error('Cannot create ephemeral local API test user.');
  ownedUsers.add(data.user.id);
  const { createClient } = createRequire(resolve(root, 'frontend/package.json'))('@supabase/supabase-js');
  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session) throw new Error('Cannot sign in ephemeral local API test user.');
  secrets.push(result.data.session.access_token, result.data.session.refresh_token);
  return { id: data.user.id, token: result.data.session.access_token };
}
async function rememberBrowserUser() {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error('Cannot inspect ephemeral signup user for cleanup.');
    const user = data.users.find(item => item.email === emails.browser);
    if (user) { ownedUsers.add(user.id); return; }
    if (data.users.length < 100) break;
  }
  throw new Error('Browser signup did not create the expected local user.');
}
function confirmationLink(html) {
  const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(match => match[1].replaceAll('&amp;', '&').replaceAll('&#x3D;', '=').replaceAll('&#61;', '='));
  for (const candidate of links) {
    let url;
    try { url = new URL(candidate); } catch { continue; }
    if (url.pathname.includes('/auth/v1/verify') || url.pathname === '/auth/confirm') {
      if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw new Error('Local confirmation email unexpectedly points outside loopback.');
      return url.href;
    }
  }
  return null;
}
async function emailConfirmation() {
  const deadline = Date.now() + 45_000;
  const mailbox = emails.browser.split('@')[0];
  while (Date.now() < deadline) {
    // Supabase CLI currently exposes Mailpit; keep compatibility with older Inbucket images.
    const listing = await http(`${mailUrl}/api/v1/messages`);
    if (listing.status === 200 && Array.isArray(listing.data?.messages)) {
      const message = listing.data.messages.find(item => JSON.stringify(item.To || item.to || []).toLowerCase().includes(emails.browser));
      if (message) {
        const messageId = message.ID || message.id;
        const body = await http(`${mailUrl}/api/v1/message/${encodeURIComponent(messageId)}/html`);
        const link = confirmationLink(body.text);
        if (link) return link;
      }
    } else {
      const inbox = await http(`${mailUrl}/api/v1/mailbox/${encodeURIComponent(mailbox)}`);
      if (inbox.status === 200 && Array.isArray(inbox.data)) {
        for (const message of inbox.data) {
          const body = await http(`${mailUrl}/api/v1/mailbox/${encodeURIComponent(mailbox)}/${encodeURIComponent(message.id)}`);
          const link = confirmationLink(body.data?.body?.html || body.data?.body?.text || '');
          if (link) return link;
        }
      }
    }
    await delay(500);
  }
  throw new Error('No local confirmation email arrived. Check auth.email.enable_confirmations, Mailpit, and local redirect URLs.');
}

async function testApi() {
  log('Checking real JWT, ownership, concurrency, dates, and worker replay.');
  expected(await api(null, 'habits'), 401, 'unauthenticated API');
  const a = await localUser(emails.a); const b = await localUser(emails.b);
  const gate = await api(a.token, 'habits'); expected(gate, 409, 'profile gate'); assert.equal(gate.data.error.code, 'PROFILE_REQUIRED');
  for (const user of [a, b]) expected(await api(user.token, 'profile', 'POST', { timezone: 'Asia/Ho_Chi_Minh' }), 201, 'profile setup');
  expected(await api(a.token, 'profile', 'POST', { timezone: 'UTC' }), 409, 'immutable timezone');
  const created = expected(await api(a.token, 'habits', 'POST', { title: `API ${runId}`, description: 'Local integration fixture', icon: '📚', color: '#6366f1' }), 201, 'habit creation').habit;
  const foreign = expected(await api(b.token, 'habits', 'POST', { title: `Foreign ${runId}` }), 201, 'second user habit').habit;
  for (const [path, method, body] of [[`habits/${foreign.id}`, 'GET'], [`habits/${foreign.id}`, 'PATCH', { title: 'Forbidden' }], [`habits/${foreign.id}/checkin`, 'POST', {}], [`habits/${foreign.id}/checkins`, 'GET']]) expected(await api(a.token, path, method, body), 404, 'cross-user backend isolation');
  const isolated = await rest(a.token, `habits?id=eq.${foreign.id}&select=id`); assert.equal(isolated.status, 200); assert.deepEqual(isolated.data, []);
  assert.ok((await rest(a.token, 'habit_checkins', 'POST', { habit_id: foreign.id, user_id: a.id })).status >= 400, 'composite ownership FK must reject forged checkin');
  const me = expected(await api(a.token, 'auth/me'), 200, 'auth/me'); assert.match(me.today, /^\d{4}-\d{2}-\d{2}$/);
  for (const offset of [-1, 1]) {
    const date = new Date(`${me.today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
    assert.ok((await rest(a.token, 'habit_checkins', 'POST', { habit_id: created.id, user_id: a.id, checkin_date: date.toISOString().slice(0, 10) })).status >= 400, 'direct REST must reject backfill and future checkin');
  }
  assert.ok((await rest(a.token, `habits?id=eq.${created.id}`, 'DELETE')).status >= 400, 'raw hard delete must be denied');
  const race = await Promise.all(Array.from({ length: 12 }, () => api(a.token, `habits/${created.id}/checkin`, 'POST', {})));
  assert.ok(race.every(result => [200, 201].includes(result.status)), 'concurrent checkins must be idempotent');
  assert.equal(race.filter(result => result.status === 201).length, 1, 'exactly one concurrent insertion must win');
  const history = expected(await api(a.token, `habits/${created.id}/checkins`), 200, 'checkin history'); assert.equal(history.checkins.length, 1);
  assert.ok((await rest(a.token, `habit_checkins?habit_id=eq.${created.id}`, 'PATCH', { checkin_date: me.today })).status >= 400, 'raw checkin update must be denied');
  expected(await api(a.token, `habits/${created.id}`, 'PATCH', { is_active: false }), 200, 'pause');
  assert.equal(expected(await api(a.token, `habits/${created.id}/checkins`), 200, 'retained paused history').checkins.length, 1);
  expected(await api(a.token, `habits/${created.id}/checkin`, 'DELETE', {}), 200, 'paused undo');
  expected(await api(a.token, `habits/${created.id}/checkin`, 'POST', {}), 409, 'paused new checkin');
  expected(await api(a.token, `habits/${created.id}`, 'PATCH', { is_active: true }), 200, 'resume');
  expected(await api(a.token, `habits/${created.id}/checkin`, 'POST', {}), 201, 'resumed checkin');
  const summary = expected(await api(a.token, 'dashboard/summary'), 200, 'dashboard counts');
  assert.equal(summary.total_habits, 1); assert.equal(summary.completed_habits, 1); assert.equal(Number(summary.completion_rate), 100); assert.equal(summary.habits[0].current_streak, 1);
  const progress = expected(await api(a.token, 'dashboard/progress'), 200, 'seven-day chart'); assert.equal(progress.days.length, 7);
  expected(await api(a.token, `habits/${created.id}`, 'DELETE', {}), 200, 'soft deletion');
  assert.ok(expected(await api(a.token, `habits/${created.id}`), 200, 'archived detail').habit.deleted_at);
  assert.equal(expected(await api(a.token, `habits/${created.id}/checkins`), 200, 'retained archived history').checkins.length, 1);
  expected(await api(a.token, `habits/${created.id}/checkin`, 'DELETE', {}), 409, 'archived undo denial');
  expected(await api('incorrect-worker-secret', 'internal/daily-summary/run', 'POST', {}), 401, 'worker secret rejection');
  let cursor = null; let batches = 0;
  do {
    const result = expected(await api(workerKey, 'internal/daily-summary/run', 'POST', { cursor, limit: 2 }), 200, 'summary batch');
    assert.equal(typeof result.processed, 'number'); assert.equal(typeof result.has_more, 'boolean');
    cursor = result.has_more ? result.next_cursor : null;
    assert.ok(!result.has_more || cursor, 'unfinished summary batch must supply cursor');
    if (++batches > 1000) throw new Error('Summary pagination did not terminate.');
  } while (cursor);
  expected(await api(workerKey, 'internal/daily-summary/run', 'POST', {}), 200, 'summary replay');
  const summaries = await admin.from('daily_summaries').select('user_id,summary_date').in('user_id', [a.id, b.id]);
  assert.equal(summaries.error, null); assert.equal(new Set((summaries.data || []).map(row => `${row.user_id}:${row.summary_date}`)).size, summaries.data.length, 'summary replay must not duplicate days');
}

async function testBrowser(chromium, expect) {
  log('Checking browser signup → actual confirmation email → habits → logout.');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'vi-VN', timezoneId: 'America/New_York' });
  const page = await context.newPage(); page.setDefaultTimeout(30_000); page.setDefaultNavigationTimeout(60_000);
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(`${frontendUrl}/login`);
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng ký miễn phí', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(emails.browser);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  const registered = page.waitForResponse(response => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  const signup = await registered; assert.equal(signup.status(), 200, 'browser registration');
  assert.equal((await signup.json()).data.confirmationRequired, true, 'local signup must require real email confirmation');
  await rememberBrowserUser();
  await expect(page.getByRole('heading', { name: 'Kiểm tra email nhé!' })).toBeVisible();
  await page.goto(await emailConfirmation());
  await expect(page.getByRole('heading', { name: 'Một ngày của bạn bắt đầu ở đâu?' })).toBeVisible();
  await page.getByLabel('Múi giờ', { exact: true }).fill('Asia/Ho_Chi_Minh');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Sẵn sàng bắt đầu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Thêm thói quen', exact: true })).toBeEnabled();
  const csrf = await page.request.post(`${frontendUrl}/api/v1/profile`, { headers: { Origin: 'https://untrusted.example' }, data: { timezone: 'UTC' } });
  assert.equal(csrf.status(), 403, 'cookie-authenticated mutation must reject a foreign Origin');
  const title = `Đọc sách ${runId.slice(0, 8)}`; const renamed = `${title} mỗi ngày`;
  await page.getByRole('button', { name: 'Thêm thói quen', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Tên thói quen/).fill(title); await dialog.getByLabel(/Mô tả/).fill('Một bước nhỏ trong bài kiểm thử thật.');
  const creation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/habits' && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Tạo thói quen', exact: true }).click();
  assert.equal((await creation).status(), 201, 'browser habit creation');
  await expect(page.getByRole('button', { name: `Hoàn thành ${title}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Hoàn thành ${title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Bỏ hoàn thành ${title}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: `Bỏ hoàn thành ${title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Hoàn thành ${title}`, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: `Hoàn thành ${title}`, exact: true }).click();
  await page.getByRole('button', { name: `Chi tiết ${title}`, exact: true }).click();
  dialog = page.getByRole('dialog'); await expect(dialog.locator('.history-list > div')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('navigation', { name: 'Điều hướng chính', exact: true }).getByRole('button', { name: 'Thói quen', exact: true }).click();
  const pausedUndo = page.getByRole('button', { name: `Bỏ hoàn thành ${title}`, exact: true });
  await expect(pausedUndo).toBeEnabled(); await pausedUndo.click();
  await expect(page.getByRole('button', { name: `Hoàn thành ${title}`, exact: true })).toBeDisabled();
  await page.getByRole('button', { name: `Chi tiết ${title}`, exact: true }).click();
  dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
  dialog = page.getByRole('dialog'); await dialog.getByLabel(/Tên thói quen/).fill(renamed);
  await dialog.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByRole('button', { name: `Hoàn thành ${renamed}`, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: `Hoàn thành ${renamed}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Bỏ hoàn thành ${renamed}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: `Chi tiết ${renamed}`, exact: true }).click();
  dialog = page.getByRole('dialog'); await expect(dialog.locator('.history-list > div')).toHaveCount(1);
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: 'Xóa thói quen', exact: true }).click();
  await expect(page.getByRole('button', { name: `Chi tiết ${renamed}`, exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('navigation', { name: 'Điều hướng trên điện thoại', exact: true }).getByRole('button', { name: 'Tổng quan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nhịp điệu 7 ngày' })).toBeVisible();
  assert.equal(await page.locator('.chart-column').count(), 7, 'browser chart must contain seven days');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile viewport must not overflow horizontally');
  await page.getByRole('navigation', { name: 'Điều hướng trên điện thoại', exact: true }).getByRole('button', { name: 'Cá nhân', exact: true }).click();
  await expect(page.locator('.profile-card')).toContainText('Asia/Ho_Chi_Minh');
  const cookies = await context.cookies();
  const sessions = cookies.filter(cookie => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));
  assert.ok(sessions.length > 0, 'successful SSR authentication must set session cookies');
  assert.ok(sessions.every(cookie => cookie.httpOnly && cookie.sameSite === 'Lax'), 'session cookies must be HttpOnly/SameSite=Lax');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('sb-'))), false, 'browser must not persist Supabase tokens in localStorage');
  await page.locator('.profile-card').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill(emails.browser); await page.getByLabel('Mật khẩu', { exact: true }).fill('Incorrect-password-123!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Thêm thói quen', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Điều hướng trên điện thoại', exact: true }).getByRole('button', { name: 'Cá nhân', exact: true }).click();
  await page.locator('.profile-card').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(frontendUrl); await expect(page).toHaveURL(/\/login$/);
  assert.deepEqual(browserErrors, [], 'browser must not raise uncaught application errors');
  // Only the signed-out login page is saved. No cookies, traces, or authenticated screenshots are exported.
  await page.getByLabel('Email', { exact: true }).fill(''); await page.getByLabel('Mật khẩu', { exact: true }).fill('');
  await page.screenshot({ path: resolve(root, 'frontend/test-results/login-mobile.png'), fullPage: true });
  await context.close(); await browser.close(); browser = undefined;
}

async function main() {
  const requireFrontend = createRequire(resolve(root, 'frontend/package.json'));
  const { createClient } = requireFrontend('@supabase/supabase-js');
  const { chromium, expect } = requireFrontend('@playwright/test');
  admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) } });
  await ready(`${supabaseUrl}/auth/v1/health`, null, 'Local Supabase', 15_000);
  await ready(mailUrl, null, 'Local Mailpit/Inbucket', 15_000);
  await Promise.all([portFree(5000), portFree(3000)]);
  const backendEnv = { ...process.env, NODE_ENV: 'development', PORT: '5000', SUPABASE_URL: supabaseUrl, SUPABASE_PUBLISHABLE_KEY: publishableKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SERVICE_API_KEY: workerKey, FRONTEND_URL: frontendUrl, TRUST_PROXY_HOPS: '0' };
  const backend = startChild('backend', [resolve(root, 'backend/dist/server.js')], resolve(root, 'backend'), backendEnv);
  await ready(`${backendUrl}/health`, backend, 'Backend');
  const frontendEnv = { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', APP_URL: frontendUrl, API_INTERNAL_URL: backendUrl, NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey, NEXT_PUBLIC_SUPABASE_ANON_KEY: publishableKey };
  const frontend = startChild('frontend', [resolve(root, 'frontend/node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3000'], resolve(root, 'frontend'), frontendEnv);
  await ready(`${frontendUrl}/login`, frontend, 'Frontend');
  await testApi(); await testBrowser(chromium, expect);
  log('Real local API and browser flows passed.');
}
let failed = false;
const deadline = setTimeout(() => { interrupted = true; void browser?.close(); void stopChildren(); }, 8 * 60_000); deadline.unref();
try { await main(); }
catch (error) { failed = true; console.error(`[stack] ${safeMessage(error)}`); }
finally {
  clearTimeout(deadline);
  try { await browser?.close(); } catch { /* Browser already closed. */ }
  await stopChildren();
  if (admin) {
    // Locate a signup that succeeded immediately before an interrupted browser action.
    try { await rememberBrowserUser(); } catch { /* No signup user exists. */ }
    for (const id of ownedUsers) {
      try {
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) { failed = true; console.error('[stack] Failed to remove an ephemeral local test user; inspect local auth cascade constraints.'); }
      } catch { failed = true; console.error('[stack] Failed to remove an ephemeral local test user.'); }
    }
  }
}
if (interrupted) failed = true;
process.exitCode = failed ? 1 : 0;
