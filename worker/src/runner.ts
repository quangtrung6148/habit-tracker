import { setTimeout as delay } from 'node:timers/promises';
import type { WorkerConfig } from './config.js';

export interface Cursor { user_id: string; summary_date: string }
export interface BatchResult { processed: number; has_more: boolean; next_cursor: Cursor | null }
export interface Dependencies {
  fetch: typeof fetch;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  now: () => number;
  random: () => number;
  log: (event: Record<string, unknown>) => void;
}

export const defaultDependencies: Dependencies = {
  fetch: globalThis.fetch,
  sleep: async (ms, signal) => { await delay(ms, undefined, { signal }); },
  now: Date.now,
  random: Math.random,
  log: event => console.log(JSON.stringify(event)),
};

class RequestFailure extends Error {
  constructor(readonly retryable: boolean, readonly status?: number) {
    super(status ? `Internal API HTTP ${status}` : 'Internal API transport failure');
  }
}

function parseBatch(value: unknown): BatchResult {
  if (!value || typeof value !== 'object') throw new Error('Invalid internal API response');
  const envelope = value as Record<string, unknown>;
  const data = envelope.data as Partial<BatchResult> | null;
  if (envelope.success !== true || !data || !Number.isInteger(data.processed) ||
      (data.processed as number) < 0 || typeof data.has_more !== 'boolean') {
    throw new Error('Invalid internal API response');
  }
  const cursor = data.next_cursor;
  if (data.has_more) {
    if (!cursor || typeof cursor.user_id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.user_id) ||
        typeof cursor.summary_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cursor.summary_date) ||
        data.processed === 0) throw new Error('Invalid internal API pagination');
  } else if (cursor !== null) throw new Error('Invalid internal API pagination');
  return data as BatchResult;
}

async function requestBatch(
  config: WorkerConfig, cursor: Cursor | undefined, signal: AbortSignal, deps: Dependencies,
): Promise<BatchResult> {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    signal.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error('Request timeout')), config.timeoutMs);
    let failure: unknown;
    try {
      const response = await deps.fetch(config.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: config.batchLimit, ...(cursor ? { cursor } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new RequestFailure(response.status === 408 || response.status === 429 || response.status >= 500, response.status);
      }
      return parseBatch(await response.json());
    } catch (error) {
      signal.throwIfAborted();
      // Malformed successful responses are contract errors, never retried.
      if (error instanceof RequestFailure) failure = error;
      else if (controller.signal.aborted || error instanceof TypeError) failure = new RequestFailure(true);
      else throw error;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
    if (!(failure instanceof RequestFailure) || !failure.retryable || attempt === config.maxAttempts) throw failure;
    const waitMs = Math.min(10_000, 1000 * 2 ** (attempt - 1)) + Math.floor(deps.random() * 500);
    deps.log({ event: 'summary_retry', attempt, wait_ms: waitMs, status: failure.status ?? null });
    await deps.sleep(waitMs, signal);
  }
  throw new Error('Retry attempts exhausted');
}

export async function runCycle(
  config: WorkerConfig, signal: AbortSignal, deps: Dependencies = defaultDependencies,
): Promise<number> {
  const started = deps.now();
  const seen = new Set<string>();
  let cursor: Cursor | undefined;
  let processed = 0;
  for (;;) {
    const batch = await requestBatch(config, cursor, signal, deps);
    processed += batch.processed;
    if (!batch.has_more) break;
    const next = batch.next_cursor!;
    const key = `${next.user_id}:${next.summary_date}`;
    if (seen.has(key)) throw new Error('Internal API cursor did not advance');
    seen.add(key);
    cursor = next;
  }
  deps.log({ event: 'summary_complete', processed, duration_ms: deps.now() - started });
  return processed;
}

export async function runWorker(
  config: WorkerConfig, signal: AbortSignal, once: boolean, deps: Dependencies = defaultDependencies,
): Promise<void> {
  do {
    try { await runCycle(config, signal, deps); }
    catch (error) {
      if (signal.aborted) return;
      // Log only controlled messages: raw transport errors can contain URLs or secrets.
      deps.log({ event: 'summary_failed', message: error instanceof RequestFailure ? error.message : 'Summary job failed' });
      if (once) throw new Error('Summary job failed');
    }
    if (once || signal.aborted) return;
    try { await deps.sleep(config.intervalMs, signal); }
    catch { if (signal.aborted) return; throw new Error('Worker timer failed'); }
  } while (!signal.aborted);
}
