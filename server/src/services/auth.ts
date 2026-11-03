import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { randomToken, sha256 } from '../lib/crypto.js';

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export const hashPassword = (pw: string) => hash(pw, ARGON);

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 12) return 'A senha deve ter ao menos 12 caracteres';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Use letras maiúsculas, minúsculas e números';
  return null;
}

export type LoginResult =
  | { ok: true; token: string; csrfToken: string; user: { id: string; email: string; name: string; role: string }; expiresAt: Date }
  | { ok: false; reason: 'invalid' | 'locked' | 'inactive' };

// hash fixo para equalizar tempo de resposta quando o usuário não existe
let dummyHash: string | null = null;

export async function login(email: string, password: string, meta: { ip: string | null; userAgent: string | null }): Promise<LoginResult> {
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
  if (!user) {
    dummyHash ??= await hashPassword('dummy-password-for-timing');
    await verify(dummyHash, password).catch(() => false);
    return { ok: false, reason: 'invalid' };
  }
  if (!user.isActive) return { ok: false, reason: 'inactive' };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, reason: 'locked' };
  const valid = await verify(user.passwordHash, password).catch(() => false);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db
      .update(users)
      .set({ failedLoginCount: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil })
      .where(eq(users.id, user.id));
    return { ok: false, reason: failed >= MAX_FAILED ? 'locked' : 'invalid' };
  }
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600_000);
  await db.insert(sessions).values({ id: sha256(token), userId: user.id, csrfToken, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null, expiresAt });
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return { ok: true, token, csrfToken, user: { id: user.id, email: user.email, name: user.name, role: user.role }, expiresAt };
}

export interface SessionUser {
  sessionId: string;
  csrfToken: string;
  user: { id: string; email: string; name: string; role: 'admin' | 'operator' };
}

export async function resolveSession(token: string): Promise<SessionUser | null> {
  const id = sha256(token);
  const [row] = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date()), eq(users.isActive, true)));
  if (!row) return null;
  // renovação deslizante (no máximo 1x por minuto)
  if (Date.now() - row.s.lastSeenAt.getTime() > 60_000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + env.SESSION_TTL_HOURS * 3600_000) })
      .where(eq(sessions.id, id));
  }
  return { sessionId: id, csrfToken: row.s.csrfToken, user: { id: row.u.id, email: row.u.email, name: row.u.name, role: row.u.role } };
}

export async function logout(token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function changePassword(userId: string, current: string, next: string): Promise<string | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return 'Usuário não encontrado';
  if (!(await verify(user.passwordHash, current).catch(() => false))) return 'Senha atual incorreta';
  const weak = validatePasswordStrength(next);
  if (weak) return weak;
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  return null;
}

export async function createUser(input: { email: string; name: string; password: string; role?: 'admin' | 'operator' }) {
  const weak = validatePasswordStrength(input.password);
  if (weak) throw new Error(weak);
  const [u] = await db
    .insert(users)
    .values({ email: input.email.trim().toLowerCase(), name: input.name, passwordHash: await hashPassword(input.password), role: input.role ?? 'admin' })
    .returning({ id: users.id, email: users.email });
  return u!;
}
