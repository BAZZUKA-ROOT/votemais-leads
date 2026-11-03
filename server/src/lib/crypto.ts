import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

function key(): Buffer {
  const raw = env.APP_ENCRYPTION_KEY.trim();
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('APP_ENCRYPTION_KEY deve ter 32 bytes (hex com 64 caracteres ou base64).');
  return buf;
}

/** AES-256-GCM: v1:iv:tag:ciphertext (base64url) */
export function encryptJson(data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join(':');
}

export function decryptJson<T = Record<string, string>>(payload: string): T {
  const [v, iv, tag, ct] = payload.split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Formato de credencial inválido');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]);
  return JSON.parse(pt.toString('utf8')) as T;
}

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function maskSecret(v: string): string {
  if (!v) return '';
  return v.length <= 8 ? '••••' : `••••${v.slice(-4)}`;
}
