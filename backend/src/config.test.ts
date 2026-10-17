import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { databaseError } from './errors.js';
const base = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'publishable-key' };
describe('configuration boundaries', () => {
  it('supports explicit degraded mode and requires paired strong worker credentials', () => {
    expect(loadConfig(base).SERVICE_API_KEY).toBe('');
    expect(() => loadConfig({ ...base, SERVICE_API_KEY: 'x'.repeat(40) })).toThrow('SERVICE_API_KEY');
    expect(() => loadConfig({ ...base, SERVICE_API_KEY: 'weak', SUPABASE_SERVICE_ROLE_KEY: 'secret' })).toThrow('SERVICE_API_KEY');
  });
  it('requires HTTPS in production and never includes secret values in startup errors', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', FRONTEND_URL: 'http://localhost:3000' })).toThrow('FRONTEND_URL');
    try { loadConfig({ ...base, SERVICE_API_KEY: 'SENSITIVE' }); } catch (error) { expect(String(error)).not.toContain('SENSITIVE'); }
  });
});
describe('database failure translation', () => {
  it('maps uniqueness, ownership, and unknown errors without revealing SQL details', () => {
    expect(databaseError({ code: '23505', message: 'secret SQL' }).code).toBe('CONFLICT');
    expect(databaseError({ code: '42501' }).status).toBe(403);
    expect(databaseError({ code: 'XX000', message: 'secret SQL' }).message).not.toContain('secret SQL');
  });
});
