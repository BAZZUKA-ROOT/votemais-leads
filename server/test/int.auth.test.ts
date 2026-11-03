import { beforeEach, describe, expect, it } from 'vitest';
import { getApp, login } from './api-client.js';
import { ADMIN, createAdmin, resetDb } from './helpers.js';

describe('autenticação e proteção de rotas', () => {
  beforeEach(async () => {
    await resetDb();
    await createAdmin();
  });

  it('bloqueia rotas sem sessão', async () => {
    const app = await getApp();
    const r = await app.inject({ method: 'GET', url: '/api/leads' });
    expect(r.statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });

  it('login válido define cookie httpOnly e retorna CSRF', async () => {
    const app = await getApp();
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: ADMIN.email.toUpperCase(), password: ADMIN.password } });
    expect(r.statusCode).toBe(200);
    const session = r.cookies.find((c) => c.name === 'vml_session')!;
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe('Lax');
    expect(r.json().csrfToken).toBeTruthy();
    expect(r.json().user.email).toBe(ADMIN.email);
  });

  it('rejeita credenciais inválidas e bloqueia após excesso de tentativas', async () => {
    const app = await getApp();
    for (let i = 0; i < 7; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: ADMIN.email, password: 'errada' } });
      expect(r.statusCode).toBe(401);
    }
    const locked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: ADMIN.email, password: 'errada' } });
    expect(locked.statusCode).toBe(423);
    const evenCorrect = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: ADMIN.email, password: ADMIN.password } });
    expect(evenCorrect.statusCode).toBe(423);
  });

  it('exige token CSRF em mutações', async () => {
    const app = await getApp();
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: ADMIN.email, password: ADMIN.password } });
    const cookie = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const noCsrf = await app.inject({ method: 'POST', url: '/api/automation/run-now', headers: { cookie } });
    expect(noCsrf.statusCode).toBe(403);
    const wrong = await app.inject({ method: 'POST', url: '/api/automation/run-now', headers: { cookie, 'x-csrf-token': 'x' } });
    expect(wrong.statusCode).toBe(403);
  });

  it('valida entrada e trata SQL malicioso como texto', async () => {
    const c = await login();
    const bad = await c.get("/api/leads?scoreMin=abc");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('validation_error');
    const inj = await c.get(`/api/leads?q=${encodeURIComponent("'; drop table leads; --")}`);
    expect(inj.status).toBe(200);
    expect(inj.body.total).toBe(0);
  });

  it('logout invalida a sessão; troca de senha exige senha forte', async () => {
    const c = await login();
    expect((await c.send('POST', '/api/auth/password', { current: ADMIN.password, next: 'fraca' })).status).toBe(400);
    expect((await c.send('POST', '/api/auth/logout')).status).toBe(200);
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });
});
