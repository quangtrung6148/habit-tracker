import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { runCycle, runWorker, type Dependencies } from '../src/runner.js';

const config = loadConfig({ NODE_ENV: 'test', BACKEND_URL: 'http://localhost:5000', SERVICE_API_KEY: 'x'.repeat(32) });
const cursor = { user_id: '00000000-0000-4000-8000-000000000001', summary_date: '2026-10-16' };
function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), { status, headers: { 'Content-Type': 'application/json' } });
}
function dependencies(fetcher: typeof fetch) {
  const sleeps: number[] = [];
  const logs: Record<string, unknown>[] = [];
  const deps: Dependencies = {
    fetch: fetcher,
    sleep: async ms => { sleeps.push(ms); },
    now: () => 100,
    random: () => 0.5,
    log: event => { logs.push(event); },
  };
  return { deps, sleeps, logs };
}
const finished = { processed: 1, has_more: false, next_cursor: null };

test('pages through the cursor contract and keeps bearer in headers only', async () => {
  const requests: RequestInit[] = [];
  const { deps, logs } = dependencies(async (_url, init) => {
    requests.push(init!);
    return response(requests.length === 1 ? { processed: 100, has_more: true, next_cursor: cursor } : finished);
  });
  assert.equal(await runCycle(config, new AbortController().signal, deps), 101);
  assert.deepEqual(JSON.parse(requests[0]!.body as string), { limit: 100 });
  assert.deepEqual(JSON.parse(requests[1]!.body as string), { limit: 100, cursor });
  assert.equal((requests[0]!.headers as Record<string, string>).Authorization, `Bearer ${config.serviceKey}`);
  assert.equal(JSON.stringify(logs).includes(config.serviceKey), false);
});

test('retries transient network and HTTP failures with bounded jitter', async () => {
  let calls = 0;
  const { deps, sleeps } = dependencies(async () => {
    calls++;
    if (calls === 1) throw new TypeError('network error containing sensitive context');
    if (calls === 2) return response(null, 503);
    return response(finished);
  });
  await runCycle(config, new AbortController().signal, deps);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [1250, 2250]);
});

test('unauthorized API response fails once without retry', async () => {
  let calls = 0;
  const { deps, sleeps } = dependencies(async () => { calls++; return response(null, 401); });
  await assert.rejects(runCycle(config, new AbortController().signal, deps), /HTTP 401/);
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
});

test('exhausted transient retries fail one-shot mode without leaking raw errors', async () => {
  let calls = 0;
  const { deps, logs } = dependencies(async () => { calls++; throw new TypeError(`secret=${config.serviceKey}`); });
  await assert.rejects(runWorker(config, new AbortController().signal, true, deps), /Summary job failed/);
  assert.equal(calls, 3);
  assert.equal(logs.at(-1)?.event, 'summary_failed');
  assert.equal(JSON.stringify(logs).includes(config.serviceKey), false);
});

test('repeated pagination cursor stops instead of looping forever', async () => {
  let calls = 0;
  const { deps } = dependencies(async () => { calls++; return response({ processed: 1, has_more: true, next_cursor: cursor }); });
  await assert.rejects(runCycle(config, new AbortController().signal, deps), /did not advance/);
  assert.equal(calls, 2);
});

test('malformed pagination fails without transport retries', async () => {
  let calls = 0;
  const { deps } = dependencies(async () => { calls++; return response({ processed: 0, has_more: true, next_cursor: cursor }); });
  await assert.rejects(runCycle(config, new AbortController().signal, deps), /pagination/);
  assert.equal(calls, 1);
});

test('timeout aborts each stalled attempt and respects retry cap', async () => {
  let calls = 0;
  const { deps } = dependencies(async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  });
  await assert.rejects(runCycle({ ...config, timeoutMs: 5 }, new AbortController().signal, deps), /transport failure/);
  assert.equal(calls, 3);
});

test('SIGTERM-style abort cancels an in-flight request without retry', async () => {
  const controller = new AbortController();
  let calls = 0;
  const { deps, sleeps } = dependencies(async (_url, init) => {
    calls++;
    const promise = new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    controller.abort();
    return promise;
  });
  await runWorker(config, controller.signal, false, deps);
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
});

test('continuous mode runs immediately, then waits, and stops gracefully without overlap', async () => {
  const controller = new AbortController();
  let calls = 0;
  const { deps } = dependencies(async () => { calls++; return response(finished); });
  deps.sleep = async (ms, signal) => {
    assert.equal(ms, 3_600_000);
    controller.abort();
    signal.throwIfAborted();
  };
  await runWorker(config, controller.signal, false, deps);
  assert.equal(calls, 1);
});

test('production rejects HTTP and origins containing credentials or paths', () => {
  const base = { NODE_ENV: 'production', SERVICE_API_KEY: 'x'.repeat(32) };
  for (const url of ['http://example.com', 'https://key@example.com', 'https://example.com/path']) {
    assert.throws(() => loadConfig({ ...base, BACKEND_URL: url }));
  }
  assert.equal(loadConfig({ ...base, BACKEND_URL: 'https://example.com' }).timeoutMs, 120_000);
});
