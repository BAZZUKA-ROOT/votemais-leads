import { normalizeBrPhone } from './normalize.js';

/**
 * Monta link oficial de conversa (https://wa.me/<numero>?text=<mensagem>).
 * Número no formato internacional sem "+", zeros ou pontuação.
 */
export function buildWhatsAppLink(phone: string, message?: string | null): string | null {
  const p = normalizeBrPhone(phone);
  if (!p) return null;
  const base = `https://wa.me/${p.e164}`;
  const text = message?.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function buildMailtoLink(email: string, subject?: string, body?: string | null): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const qs = params.toString().replace(/\+/g, '%20');
  return `mailto:${email}${qs ? `?${qs}` : ''}`;
}
