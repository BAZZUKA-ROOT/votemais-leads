import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cookieSecure, env } from '../config/env.js';
import { audit } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { CSRF_COOKIE, SESSION_COOKIE, parse } from '../api/plugins.js';
import { changePassword, login, logout } from '../services/auth.js';

const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const res = await login(body.email, body.password, { ip: req.ip, userAgent: req.headers['user-agent'] ?? null });
    if (!res.ok) {
      await audit('Falha de login', { email: body.email, reason: res.reason }, { ip: req.ip });
      if (res.reason === 'locked') throw new AppError(423, 'locked', 'Conta temporariamente bloqueada por excesso de tentativas. Tente em 15 minutos.');
      throw new AppError(401, 'invalid_credentials', 'E-mail ou senha inválidos');
    }
    const maxAge = env.SESSION_TTL_HOURS * 3600;
    reply.setCookie(SESSION_COOKIE, res.token, { httpOnly: true, secure: cookieSecure, sameSite: 'lax', path: '/', maxAge });
    reply.setCookie(CSRF_COOKIE, res.csrfToken, { httpOnly: false, secure: cookieSecure, sameSite: 'lax', path: '/', maxAge });
    await audit('Login', { email: res.user.email }, { userId: res.user.id, ip: req.ip });
    return { user: res.user, csrfToken: res.csrfToken };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await logout(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' }).clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => ({ user: req.auth!.user, csrfToken: req.auth!.csrfToken }));

  app.post('/api/auth/password', async (req, reply) => {
    const body = parse(z.object({ current: z.string().min(1), next: z.string().min(1).max(200) }), req.body);
    const err = await changePassword(req.auth!.user.id, body.current, body.next);
    if (err) throw new AppError(400, 'bad_request', err);
    await audit('Senha alterada', {}, { userId: req.auth!.user.id, ip: req.ip });
    reply.clearCookie(SESSION_COOKIE, { path: '/' }).clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
  });
}
