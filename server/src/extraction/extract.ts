import * as cheerio from 'cheerio';
import {
  canonicalUrl,
  domainOf,
  isGenericDomain,
  normalizeBrPhone,
  normalizeEmail,
  normalizeInstagram,
} from '../lib/normalize.js';
import type { ContactType } from '../db/schema.js';

export interface ContactCandidate {
  type: ContactType;
  value: string; // forma exibível
  normalized: string; // chave de dedup
  excerpt: string;
  sourceUrl: string;
  confidence: number;
  isMobile?: boolean;
}

export interface JsonLdEvent {
  name?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  organizer?: string;
  url?: string;
}

export interface ExtractedPage {
  title: string;
  description: string;
  text: string;
  links: string[];
  contacts: ContactCandidate[];
  jsonLdEvents: JsonLdEvent[];
}

const PHONE_RE = /(?:\+?55[\s.-]?)?\(?0?([1-9]\d)\)?[\s.-]?(9?\s?\d{4})[\s.-]?(\d{4})(?!\d)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IG_AT_RE = /(?:instagram|insta|ig)\s*[:\-–]?\s*@([A-Za-z0-9._]{2,30})/gi;
const WHATS_HINT = /(whats|zap|wpp|whatsapp)/i;

function excerptAround(text: string, idx: number, len: number): string {
  const s = Math.max(0, idx - 80);
  const e = Math.min(text.length, idx + len + 80);
  return text.slice(s, e).replace(/\s+/g, ' ').trim();
}

class ContactBag {
  private map = new Map<string, ContactCandidate>();
  add(c: ContactCandidate) {
    const key = `${c.type}:${c.normalized}`;
    const prev = this.map.get(key);
    if (!prev || prev.confidence < c.confidence) this.map.set(key, c);
  }
  list() {
    return [...this.map.values()];
  }
}

function asText(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'name' in v && typeof (v as { name: unknown }).name === 'string') {
    return (v as { name: string }).name;
  }
  return undefined;
}

function parseJsonLd($: cheerio.CheerioAPI): JsonLdEvent[] {
  const out: JsonLdEvent[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items: unknown[] = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const o = it as Record<string, unknown>;
        const type = String(o['@type'] ?? '');
        if (!/Event/i.test(type)) continue;
        const loc = o.location as Record<string, unknown> | undefined;
        const addr = loc?.address as Record<string, unknown> | string | undefined;
        out.push({
          name: asText(o.name),
          startDate: asText(o.startDate),
          endDate: asText(o.endDate),
          location:
            [asText(loc?.name), typeof addr === 'string' ? addr : [addr?.addressLocality, addr?.addressRegion].filter(Boolean).join(' - ')]
              .filter(Boolean)
              .join(', ') || undefined,
          organizer: asText(o.organizer),
          url: asText(o.url),
        });
      }
    } catch {
      /* JSON-LD inválido: ignora */
    }
  });
  return out;
}

/** Extrai texto, links e contatos publicados na página. Só retorna o que existe literalmente no HTML. */
export function extractFromHtml(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  const jsonLdEvents = parseJsonLd($);
  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '').trim();
  const description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim();
  const bag = new ContactBag();
  const links = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim();
    const anchor = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 120);
    const ctx = `${anchor} ${href}`.slice(0, 300);
    if (/^tel:/i.test(href)) {
      const p = normalizeBrPhone(href.slice(4));
      if (p) bag.add({ type: p.isMobile && WHATS_HINT.test(ctx) ? 'whatsapp' : 'phone', value: p.display, normalized: p.e164, excerpt: ctx, sourceUrl: pageUrl, confidence: 85, isMobile: p.isMobile });
      return;
    }
    if (/^mailto:/i.test(href)) {
      const e = normalizeEmail(href);
      if (e) bag.add({ type: 'email', value: e, normalized: e, excerpt: ctx, sourceUrl: pageUrl, confidence: 90 });
      return;
    }
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    const host = abs.hostname.replace(/^www\./, '');
    if (host === 'wa.me' || host.endsWith('whatsapp.com')) {
      const num = host === 'wa.me' ? abs.pathname.slice(1) : abs.searchParams.get('phone') ?? '';
      const p = normalizeBrPhone(num);
      if (p) bag.add({ type: 'whatsapp', value: p.display, normalized: p.e164, excerpt: ctx, sourceUrl: pageUrl, confidence: 95, isMobile: p.isMobile });
      return;
    }
    if (host.endsWith('instagram.com')) {
      const h = normalizeInstagram(abs.toString());
      if (h) bag.add({ type: 'instagram', value: `@${h}`, normalized: h, excerpt: ctx, sourceUrl: pageUrl, confidence: 85 });
      return;
    }
    if (host.endsWith('facebook.com') && /^\/[A-Za-z0-9.\-]{3,}\/?$/.test(abs.pathname) && !/sharer|plugins|tr$/.test(abs.pathname)) {
      const v = `https://www.facebook.com${abs.pathname.replace(/\/$/, '')}`;
      bag.add({ type: 'facebook', value: v, normalized: v.toLowerCase(), excerpt: ctx, sourceUrl: pageUrl, confidence: 70 });
      return;
    }
    const c = canonicalUrl(abs.toString());
    if (c && (abs.protocol === 'http:' || abs.protocol === 'https:')) links.add(c);
  });

  $('script, style, noscript, svg, iframe, template').remove();
  const text = $('body').text().replace(/[\t\r ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

  for (const m of text.matchAll(PHONE_RE)) {
    const p = normalizeBrPhone(m[0]);
    if (!p) continue;
    const idx = m.index ?? 0;
    const ex = excerptAround(text, idx, m[0].length);
    const near = text.slice(Math.max(0, idx - 50), idx + m[0].length + 20);
    bag.add({
      type: p.isMobile && WHATS_HINT.test(near) ? 'whatsapp' : 'phone',
      value: p.display,
      normalized: p.e164,
      excerpt: ex,
      sourceUrl: pageUrl,
      confidence: p.isMobile && WHATS_HINT.test(near) ? 80 : 60,
      isMobile: p.isMobile,
    });
  }
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = normalizeEmail(m[0]);
    if (e) bag.add({ type: 'email', value: e, normalized: e, excerpt: excerptAround(text, m.index ?? 0, m[0].length), sourceUrl: pageUrl, confidence: 75 });
  }
  for (const m of text.matchAll(IG_AT_RE)) {
    const h = normalizeInstagram(m[1]!);
    if (h) bag.add({ type: 'instagram', value: `@${h}`, normalized: h, excerpt: excerptAround(text, m.index ?? 0, m[0].length), sourceUrl: pageUrl, confidence: 70 });
  }

  const pageDomain = domainOf(pageUrl);
  if (pageDomain && !isGenericDomain(pageDomain)) {
    const origin = new URL(pageUrl).origin;
    bag.add({ type: 'website', value: origin, normalized: pageDomain, excerpt: title.slice(0, 200), sourceUrl: pageUrl, confidence: 60 });
  }

  return { title, description, text, links: [...links].slice(0, 300), contacts: bag.list(), jsonLdEvents };
}

/** Contatos a partir de resultado de busca (sem acessar a página — ex.: Instagram). */
export function extractFromSearchSnippet(url: string, title: string, snippet: string): ContactCandidate[] {
  const bag = new ContactBag();
  const text = `${title}\n${snippet}`;
  const h = /instagram\.com/i.test(url) ? normalizeInstagram(url) : null;
  if (h) bag.add({ type: 'instagram', value: `@${h}`, normalized: h, excerpt: title.slice(0, 200), sourceUrl: url, confidence: 80 });
  for (const m of text.matchAll(PHONE_RE)) {
    const p = normalizeBrPhone(m[0]);
    if (!p) continue;
    const near = text.slice(Math.max(0, (m.index ?? 0) - 50), (m.index ?? 0) + m[0].length + 20);
    const wa = p.isMobile && WHATS_HINT.test(near);
    bag.add({ type: wa ? 'whatsapp' : 'phone', value: p.display, normalized: p.e164, excerpt: excerptAround(text, m.index ?? 0, m[0].length), sourceUrl: url, confidence: wa ? 75 : 55, isMobile: p.isMobile });
  }
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = normalizeEmail(m[0]);
    if (e) bag.add({ type: 'email', value: e, normalized: e, excerpt: excerptAround(text, m.index ?? 0, m[0].length), sourceUrl: url, confidence: 70 });
  }
  return bag.list();
}
