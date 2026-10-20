import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import ts from 'typescript';

// Execute the real BFF route and HTTP helpers. Only Next's response class and
// Supabase auth boundary are replaced; no database or real credentials are used.
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const httpSource = await readFile(new URL('../src/lib/http.ts', import.meta.url), 'utf8');
const nextMock = moduleUrl('export const NextResponse = { json: (body, options) => Response.json(body, options) };');
const httpUrl = moduleUrl(compile(httpSource)
  .replace('import "server-only";', '')
  .replace('"next/server"', JSON.stringify(nextMock)));
const authUrl = moduleUrl(`
export const authConfigured = () => true;
export const supabaseServer = async () => ({auth: {
  getUser: async () => ({data: {user: {id: 'test-user'}}, error: null}),
  getSession: async () => ({data: {session: {access_token: 'fixture-token'}}})
}});
`);
const routeSource = await readFile(new URL('../src/app/api/v1/[...path]/route.ts', import.meta.url), 'utf8');
const route = await import(moduleUrl(compile(routeSource)
  .replace('"@/lib/auth"', JSON.stringify(authUrl))
  .replace('"@/lib/http"', JSON.stringify(httpUrl))
  .replace('"@/lib/api"', JSON.stringify(new URL('../src/lib/api.ts', import.meta.url).href))));

const originalFetch = globalThis.fetch;
const previousEnv = { API_INTERNAL_URL: process.env.API_INTERNAL_URL, APP_URL: process.env.APP_URL };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
function request(method = 'GET', body) {
  process.env.API_INTERNAL_URL = 'https://backend.example';
  process.env.APP_URL = 'https://app.example';
  const req = new Request('https://app.example/api/v1/auth/me', {
    method, headers: { origin: 'https://app.example', 'content-type': 'application/json' }, body,
  });
  req.nextUrl = new URL(req.url);
  return req;
}
const context = { params: Promise.resolve({ path: ['auth', 'me'] }) };

test('BFF đổi HTML hoặc JSON hỏng upstream thành 502/503, không phải INVALID_JSON 400', async () => {
  for (const upstream of [new Response('<html>PRIVATE</html>', { status: 503 }), new Response('{broken')]) {
    globalThis.fetch = async () => upstream;
    const response = await route.GET(request(), context);
    assert.ok([502, 503].includes(response.status));
    const payload = await response.json();
    assert.equal(payload.error.code, 'UPSTREAM_ERROR');
    assert.ok(!JSON.stringify(payload).includes('PRIVATE'));
    assert.ok(response.headers.get('cache-control').includes('no-store'));
  }
});

test('BFF giữ 400 INVALID_JSON cho body client sai và không gọi backend', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected fetch'); };
  const response = await route.POST(request('POST', '{broken'), context);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_JSON');
  assert.equal(calls, 0);
});

test('BFF giữ lỗi validation thật, không retry và không gửi cookie tới backend', async () => {
  const payload = { success: false, data: null, message: 'Sai dữ liệu.', error: { code: 'VALIDATION_ERROR' }, requestId: 'fixture-request' };
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url.origin, 'https://backend.example');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer fixture-token');
    assert.equal(new Headers(init.headers).get('cookie'), null);
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(payload, { status: 400 });
  };
  const response = await route.GET(request(), context);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), payload);
  assert.equal(calls, 1);
});

test('Origin guard vẫn chặn mutation từ nguồn khác trước mọi request', async () => {
  const req = request('POST', '{}');
  req.headers.set('origin', 'https://evil.example');
  globalThis.fetch = async () => { throw new Error('Unexpected fetch'); };
  const response = await route.POST(req, context);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'ORIGIN_REJECTED');
});
