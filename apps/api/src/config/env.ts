import { z } from 'zod';

const boolean = (defaultValue: 'true' | 'false' = 'false') =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(defaultValue)
    .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis.'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit contenir au moins 32 caractères.'),
  TOKEN_PEPPER: z.string().min(16, 'TOKEN_PEPPER doit contenir au moins 16 caractères.'),
  PIN_PEPPER: z.string().min(16, 'PIN_PEPPER doit contenir au moins 16 caractères.'),

  APP_BASE_URL: z.url().default('http://localhost:5173'),
  COOKIE_SECURE: boolean(),
  COOKIE_DOMAIN: z.string().optional(),

  EMAIL_VERIFICATION_REQUIRED: boolean(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_SECURE: boolean(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Pokero <no-reply@pokero.local>'),

  ADMIN_EMAILS: z.string().default(''),
  SEED_DEMO: boolean(),

  TRUST_PROXY: boolean(),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export type Env = z.infer<typeof envSchema> & { adminEmails: string[] };

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  const adminEmails = parsed.data.ADMIN_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return { ...parsed.data, adminEmails };
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached === null) cached = loadEnv();
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
