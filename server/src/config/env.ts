import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  /** 32 bytes em base64 ou hex — cifra credenciais de integrações (AES-256-GCM). */
  APP_ENCRYPTION_KEY: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(72),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CRAWLER_USER_AGENT: z
    .string()
    .default('VoteMaisLeadsBot/1.0 (+https://leads.votemais.online/bot)'),
  QUEUE_PREFIX: z.string().default('vml'),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return parsed.data;
}

export const env = load();
export const isProd = env.NODE_ENV === 'production';
export const cookieSecure = env.COOKIE_SECURE ?? isProd;
