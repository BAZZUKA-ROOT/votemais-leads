import type { FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { env } from '../config/env.js';
import { safeEqual } from '../lib/crypto.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { resolveSession, type SessionUser } from '../services/auth.js';

export const SESSION_COOKIE = 'vml_session';
export const CSRF_COOKIE = 'vml_csrf';

declare module 'fastify' {
  interface FastifyRequest {
    auth: SessionUser | null;
  }
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

/** Atualização parcial: no Zod 4, `.partial()` ainda aplica `.default()`; mantém só os campos enviados. */
export function parsePatch<T extends z.ZodRawShape>(schema: z.ZodObject<T>, data: unknown): Partial<z.infer<z.ZodObject<T>>> {
  const parsed = schema.partial().parse(data) as Record<string, unknown>;
  const sent = data && typeof data === 'object' ? data : {};
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => k in sent)) as Partial<z.infer<z.ZodObject<T>>>;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PUBLIC = new Set(['/api/auth/login', '/api/health']);

export async function authHook(req: FastifyRequest, _reply: FastifyReply) {
  req.auth = null;
  const path = req.url.split('?')[0]!;
  if (!path.startsWith('/api/') || PUBLIC.has(path)) return;
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    // Token de API: sem cookie, portanto imune a CSRF. Age como o administrador mais antigo ativo.
    if (!env.VML_API_TOKEN || !safeEqual(bearer, env.VML_API_TOKEN)) throw unauthorized('Token de API inválido');
    const [admin] = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (!admin) throw unauthorized('Nenhum usuário ativo');
    req.auth = { sessionId: 'api-token', csrfToken: '', user: { ...admin, name: `${admin.name} (API)` } };
    return;
  }
  const token = req.cookies[SESSION_COOKIE];
  const session = token ? await resolveSession(token) : null;
  if (!session) throw unauthorized();
  req.auth = session;
  if (MUTATING.has(req.method)) {
    const origin = req.headers.origin;
    if (origin && new URL(env.APP_URL).origin !== origin && env.NODE_ENV === 'production') throw forbidden('Origem não permitida');
    const header = req.headers['x-csrf-token'];
    if (typeof header !== 'string' || !safeEqual(header, session.csrfToken)) throw forbidden('Token CSRF inválido');
  }
}

export function requireAdmin(req: FastifyRequest) {
  if (req.auth?.user.role !== 'admin') throw forbidden('Apenas administradores');
}

export const userId = (req: FastifyRequest) => req.auth?.user.id ?? null;

export function errorHandler(err: unknown, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ZodError) {
    return reply.status(400).send({ error: 'validation_error', message: 'Dados inválidos', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err instanceof AppError) return reply.status(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
  const e = err as { statusCode?: number; message?: string; code?: string };
  if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.code ?? 'error', message: e.message });
  req.log.error({ err }, 'erro não tratado');
  return reply.status(500).send({ error: 'internal_error', message: 'Erro interno. Consulte os logs do sistema.' });
}

export const idParam = z.object({ id: z.string().uuid() });
export const intIdParam = z.object({ id: z.coerce.number().int().positive() });
