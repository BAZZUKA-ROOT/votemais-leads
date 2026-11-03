import { buildApp } from '../src/api/app.js';
import { ADMIN } from './helpers.js';

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App | null = null;
export async function getApp(): Promise<App> {
  app ??= await buildApp();
  return app;
}

export interface Client {
  get: (url: string) => Promise<{ status: number; body: any; headers: Record<string, unknown>; text: string }>;
  send: (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => Promise<{ status: number; body: any }>;
}

export async function login(email = ADMIN.email, password = ADMIN.password): Promise<Client> {
  const a = await getApp();
  const res = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login falhou: ${res.statusCode} ${res.body}`);
  const cookies = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const csrf = res.json().csrfToken as string;
  return {
    get: async (url) => {
      const r = await a.inject({ method: 'GET', url, headers: { cookie: cookies } });
      let body: unknown = null;
      try {
        body = r.json();
      } catch {
        body = null;
      }
      return { status: r.statusCode, body, headers: r.headers, text: r.body };
    },
    send: async (method, url, payload) => {
      const r = await a.inject({ method, url, payload: payload as never, headers: { cookie: cookies, 'x-csrf-token': csrf } });
      return { status: r.statusCode, body: r.body ? r.json() : null };
    },
  };
}
