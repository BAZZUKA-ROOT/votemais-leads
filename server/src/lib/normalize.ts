import { sha256 } from './crypto.js';

export function stripAccents(v: string): string {
  return v.normalize('NFD').replace(/\p{M}/gu, '');
}

export function normalizeText(v: string): string {
  return stripAccents(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function slugify(v: string): string {
  return normalizeText(v).replace(/\s/g, '-');
}

// ---------- telefones ----------
const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47,
  48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87,
  88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export interface NormalizedPhone {
  e164: string; // 55DDDNUMERO (sem +)
  ddd: number;
  isMobile: boolean;
  display: string;
}

/** Normaliza telefone brasileiro. Retorna null se não for um número BR plausível. */
export function normalizeBrPhone(raw: string): NormalizedPhone | null {
  let d = raw.replace(/\D/g, '').replace(/^0+/, ''); // 0 de longa distância / 00 internacional
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (!VALID_DDD.has(ddd)) return null;
  const local = d.slice(2);
  if (local.length === 9 && local[0] !== '9') return null;
  if (local.length === 8 && !/^[2-9]/.test(local)) return null;
  if (/^(\d)\1+$/.test(local)) return null;
  const isMobile = local.length === 9;
  const display = isMobile
    ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
    : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  return { e164: `55${d}`, ddd, isMobile, display };
}

// ---------- e-mail ----------
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const NON_CONTACT_EMAIL = /(noreply|no-reply|donotreply|example\.|sentry|wixpress|@sentry|\.png|\.jpg|\.webp|\.gif)/i;

export function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase().replace(/^mailto:/, '').split('?')[0]!;
  if (!EMAIL_RE.test(v) || NON_CONTACT_EMAIL.test(v)) return null;
  return v;
}

// ---------- instagram ----------
const IG_RESERVED = new Set([
  'p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'about', 'legal', 'developer', 'direct',
  'web', 'tags', 'locations', 'popular', 'instagram', 'share', 's',
]);

/** Extrai handle de URL do Instagram ou "@handle". */
export function normalizeInstagram(raw: string): string | null {
  let v = raw.trim();
  const m = v.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i);
  if (m) v = m[1]!;
  else if (/^https?:\/\//i.test(v)) return null;
  v = v.replace(/^@/, '').toLowerCase().replace(/\/+$/, '');
  if (!/^[a-z0-9._]{1,30}$/.test(v) || IG_RESERVED.has(v) || /^\.|\.$|\.\./.test(v)) return null;
  return v;
}

export const instagramUrl = (handle: string) => `https://www.instagram.com/${handle}/`;

// ---------- URLs ----------
const TRACKING_PARAMS = /^(utm_|fbclid|gclid|igshid|mc_|ref$|ref_src|si$|srsltid)/i;

export function canonicalUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return null;
  }
}

export function domainOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export const urlHash = (url: string) => sha256(url.replace(/^https?:\/\/(www\.)?/i, '').toLowerCase());

/** Domínios que não identificam um organizador específico. */
const GENERIC_DOMAINS = [
  'instagram.com', 'facebook.com', 'fb.com', 'youtube.com', 'youtu.be', 'tiktok.com', 'twitter.com', 'x.com',
  'wa.me', 'whatsapp.com', 'google.com', 'linktr.ee', 'sympla.com.br', 'eventbrite.com', 'eventbrite.com.br',
  'bileto.sympla.com.br', 'ingresse.com', 'blueticket.com.br', 'even3.com.br', 'doity.com.br', 'linkedin.com',
  'kwai.com', 'threads.net', 'bit.ly', 'forms.gle', 'docs.google.com', 'wikipedia.org', 'globo.com', 'g1.globo.com',
  'uol.com.br', 'terra.com.br', 'r7.com',
];

export function isGenericDomain(domain: string | null | undefined): boolean {
  if (!domain) return true;
  return GENERIC_DOMAINS.some((g) => domain === g || domain.endsWith(`.${g}`));
}

export function isGovernmentDomain(domain: string): boolean {
  return /\.gov\.br$/.test(domain) || /\.leg\.br$/.test(domain);
}

// ---------- eventos ----------
const EVENT_STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'na', 'no', 'edicao', 'oficial', 'concurso', 'escolha',
  'inscricoes', 'abertas', 'evento', 'festa',
]);

/** Nome do evento sem ano/edição — base do fingerprint de deduplicação. */
export function eventBaseName(name: string): string {
  const n = normalizeText(name)
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b\d{1,3}\s?(a|o|ª|º)?\s?(edicao)?\b/g, ' ')
    .replace(/\b[ivxlc]+\b(?=\s|$)/g, ' ');
  return n
    .split(' ')
    .filter((w) => w && !EVENT_STOPWORDS.has(w))
    .join(' ');
}

export function eventFingerprint(input: { name: string; state?: string | null; city?: string | null; year?: number | null }): string {
  const base = eventBaseName(input.name);
  const parts = [base, (input.state ?? '').toUpperCase(), normalizeText(input.city ?? ''), input.year ?? ''];
  return sha256(parts.join('|'));
}

export function normalizeOrganizerName(name: string): string {
  return normalizeText(name)
    .replace(/\b(ltda|me|eireli|epp|s a|sa|producoes|producao|eventos|promocoes)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Verifica se `needle` aparece no texto-fonte (ignorando acentos/caixa/pontuação). */
export function appearsIn(source: string, needle: string): boolean {
  const n = normalizeText(needle);
  if (!n) return false;
  return normalizeText(source).includes(n);
}

export function queryHash(q: string): string {
  return sha256(normalizeText(q));
}
