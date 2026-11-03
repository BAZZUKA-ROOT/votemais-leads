import pino from 'pino';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { systemLogs } from '../db/schema.js';

export const log = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.cookie', 'req.headers.authorization', '*.apiKey', '*.password', '*.credentials'],
});

type Level = 'debug' | 'info' | 'warn' | 'error' | 'audit';

/** Persiste log operacional no banco (visível em "Logs do sistema") e espelha no stdout. */
export async function syslog(
  level: Level,
  scope: string,
  message: string,
  context?: Record<string, unknown>,
  meta?: { userId?: string | null; ip?: string | null },
): Promise<void> {
  const pinoLevel = level === 'audit' ? 'info' : level;
  log[pinoLevel]({ scope, ...context }, message);
  try {
    await db.insert(systemLogs).values({
      level,
      scope,
      message: message.slice(0, 2000),
      context: context ? sanitize(context) : null,
      userId: meta?.userId ?? null,
      ip: meta?.ip ?? null,
    });
  } catch (err) {
    log.error({ err }, 'falha ao gravar system_log');
  }
}

export const audit = (message: string, context: Record<string, unknown>, meta: { userId?: string | null; ip?: string | null }) =>
  syslog('audit', 'audit', message, context, meta);

const SECRET_KEYS = /(key|secret|token|password|credential)/i;
function sanitize(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (SECRET_KEYS.test(k)) out[k] = '[redacted]';
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else out[k] = v;
  }
  return out;
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
