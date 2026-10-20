import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import { api, readApiResponse } from '../src/lib/api.ts';

const originalFetch = globalThis.fetch;
const originalTimeout = AbortSignal.timeout;
afterEach(() => { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; mock.timers.reset(); });
const success = () => Response.json({ success: true, data: { ready: true }, message: 'Thành công' });
const failure = status => Response.json({ success: false, data: null, message: 'Lỗi an toàn', error: { code: 'TEST_ERROR' } }, { status });
function sequence(responses) {
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    const response = responses.shift();
    if (response instanceof Error) throw response;
    assert.ok(response, 'Không được gửi request vượt giới hạn');
    return response;
  };
  return calls;
}
async function finishRetries(promise) {
  // Response.json() and fetch settle on the microtask queue before backoff starts.
  await new Promise(resolve => setImmediate(resolve));
  mock.timers.tick(1000);
  await new Promise(resolve => setImmediate(resolve));
  mock.timers.tick(2000);
  return promise;
}

test('GET tự phục hồi sau 503 và lỗi mạng, giữ no-store và timeout', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const calls = sequence([failure(503), new TypeError('fetch failed'), success()]);
  assert.deepEqual(await finishRetries(api('auth/me')), { ready: true });
  assert.equal(calls.length, 3);
  for (const [, init] of calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.body, undefined);
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test('GET dừng sau ba lượt và che lỗi transport thô', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const calls = sequence(Array.from({ length: 3 }, () => new Error('PRIVATE-UPSTREAM-DETAILS')));
  const checked = assert.rejects(api('auth/me'), error => error.code === 'NETWORK_ERROR' && !error.message.includes('PRIVATE'));
  await finishRetries(checked);
  assert.equal(calls.length, 3);
});

test('lỗi 400/401/403/404/409/429/500 không được tự thử lại', async () => {
  for (const status of [400, 401, 403, 404, 409, 429, 500]) {
    const calls = sequence([failure(status)]);
    await assert.rejects(api('auth/me'), { status, code: 'TEST_ERROR', message: 'Lỗi an toàn' });
    assert.equal(calls.length, 1);
  }
});

test('POST/PATCH/DELETE không tự gửi lại kể cả khi timeout hoặc 503', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    for (const response of [failure(503), new DOMException('timeout details', 'TimeoutError')]) {
      const calls = sequence([response]);
      await assert.rejects(api('habits', method, { title: 'Đọc sách' }));
      assert.equal(calls.length, 1);
      assert.equal(calls[0][1].body, JSON.stringify({ title: 'Đọc sách' }));
    }
  }
});

test('HTML, JSON hỏng và envelope sai trở thành lỗi máy chủ an toàn', async () => {
  for (const response of [
    new Response('<html>PRIVATE-DETAILS</html>', { status: 503 }),
    new Response('{broken', { status: 200 }),
    Response.json({ unexpected: 'PRIVATE-DETAILS' }),
    Response.json({ success: true, data: 'PRIVATE-DETAILS', message: 'ok' }, { status: 500 }),
  ]) {
    const result = await readApiResponse(response);
    assert.ok([502, 503].includes(result.status));
    assert.equal(result.payload.error.code, 'UPSTREAM_ERROR');
    assert.equal(result.payload.data, null);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});

test('lỗi validation thật giữ nguyên mã, thông báo và request ID từ backend', async () => {
  const payload = { success: false, data: null, message: 'Dữ liệu không hợp lệ.', error: { code: 'VALIDATION_ERROR' }, requestId: 'request-123' };
  assert.deepEqual(await readApiResponse(Response.json(payload, { status: 400 })), { payload, status: 400 });
});

test('JSON hỏng được thử lại khi đọc, không lộ SyntaxError cho người dùng', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const calls = sequence([new Response('<html>starting</html>'), success()]);
  assert.deepEqual(await finishRetries(api('dashboard/summary')), { ready: true });
  assert.equal(calls.length, 2);
});

test('mọi HTTP transient được retry khi đọc, bảo toàn status và không lặp mutation', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  for (const status of [408, 502, 503, 504]) {
    const calls = sequence([failure(status), success()]);
    assert.deepEqual(await finishRetries(api('auth/me')), { ready: true });
    assert.equal(calls.length, 2);
    const decoded = await readApiResponse(new Response('upstream unavailable', { status }));
    assert.equal(decoded.status, status);
    const writes = sequence([failure(status)]);
    await assert.rejects(api('habits', 'POST', {}), { code: 'MUTATION_UNCERTAIN', status });
    assert.equal(writes.length, 1);
  }
});

test('timeout thực sự abort pending fetch, GET hữu hạn và mutation chỉ một lần', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const timeouts = [];
  AbortSignal.timeout = milliseconds => {
    timeouts.push(milliseconds);
    const controller = new AbortController();
    queueMicrotask(() => controller.abort(new DOMException('private timeout detail', 'TimeoutError')));
    return controller.signal;
  };
  let calls = 0;
  globalThis.fetch = (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  };
  const checked = assert.rejects(api('auth/me'), { code: 'NETWORK_ERROR' });
  await finishRetries(checked);
  assert.equal(calls, 3);
  assert.deepEqual(timeouts, [45000, 45000, 45000]);
  await assert.rejects(api('habits', 'POST', {}), { code: 'MUTATION_UNCERTAIN' });
  assert.equal(calls, 4);
  assert.equal(timeouts.at(-1), 125000);
});
