export interface WorkerConfig {
  endpoint: string;
  serviceKey: string;
  intervalMs: number;
  timeoutMs: number;
  maxAttempts: number;
  batchLimit: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, production or test');
  }
  if (!env.BACKEND_URL) throw new Error('BACKEND_URL is required');
  let base: URL;
  try { base = new URL(env.BACKEND_URL); }
  catch { throw new Error('BACKEND_URL must be a valid origin'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
      base.search || base.hash || base.pathname !== '/') {
    throw new Error('BACKEND_URL must be an HTTP(S) origin without credentials or a path');
  }
  if (nodeEnv === 'production' && base.protocol !== 'https:') {
    throw new Error('BACKEND_URL must use HTTPS in production');
  }
  const serviceKey = env.SERVICE_API_KEY;
  if (!serviceKey || serviceKey.trim().length < 32) {
    throw new Error('SERVICE_API_KEY must contain at least 32 characters');
  }
  return {
    endpoint: new URL('/api/v1/internal/daily-summary/run', base).href,
    serviceKey,
    intervalMs: 60 * 60 * 1000,
    timeoutMs: 120_000,
    maxAttempts: 3,
    batchLimit: 100,
  };
}
