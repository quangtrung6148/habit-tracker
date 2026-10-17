import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  SERVICE_API_KEY: z.string().default(''),
  FRONTEND_URL: z.url().default('http://localhost:3000'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
}).superRefine((value, ctx) => {
  if (Boolean(value.SUPABASE_SERVICE_ROLE_KEY) !== Boolean(value.SERVICE_API_KEY)) ctx.addIssue({ code: 'custom', message: 'Set both worker credentials or neither.', path: ['SERVICE_API_KEY'] });
  if (value.SERVICE_API_KEY && value.SERVICE_API_KEY.length < 32) ctx.addIssue({ code: 'custom', message: 'Worker key must have at least 32 characters.', path: ['SERVICE_API_KEY'] });
  if (value.NODE_ENV === 'production') {
    for (const key of ['SUPABASE_URL', 'FRONTEND_URL'] as const) if (!value[key].startsWith('https://')) ctx.addIssue({ code: 'custom', message: 'Production URLs must use HTTPS.', path: [key] });
  }
});
export type Config = z.infer<typeof schema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) throw new Error(`Invalid backend configuration: ${[...new Set(result.error.issues.map(issue => issue.path.join('.')))].join(', ')}`);
  return result.data;
}
