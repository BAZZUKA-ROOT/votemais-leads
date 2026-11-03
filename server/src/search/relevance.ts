import type { Category } from '../db/schema.js';
import { domainOf, normalizeText } from '../lib/normalize.js';
import { stateInfo } from '../lib/regions.js';

const BLOCKED_DOMAINS = [
  'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.com', 'mercadolivre.com.br', 'olx.com.br', 'amazon.com.br',
  'shopee.com.br', 'aliexpress.com', 'magazineluiza.com.br', 'wikipedia.org', 'dicio.com.br', 'significados.com.br',
  'reclameaqui.com.br', 'jusbrasil.com.br', 'spotify.com', 'deezer.com', 'netflix.com', 'imdb.com', 'twitter.com', 'x.com',
];

const CONTEST_WORDS = [
  'concurso', 'rainha', 'princesa', 'miss', 'mister', 'garota', 'musa', 'votacao', 'vote', 'candidatas', 'candidatos',
  'inscricoes', 'eleita', 'escolha', 'premiacao', 'melhores do ano', 'destaque', 'trofeu', 'final', 'coroacao', 'desfile',
];

export interface RelevanceResult {
  score: number;
  relevant: boolean;
  reason: string;
}

export function scoreRelevance(
  hit: { url: string; title: string; snippet: string },
  category: Pick<Category, 'keywords' | 'negativeKeywords' | 'name'> | null,
  uf: string | null,
  now = new Date(),
): RelevanceResult {
  const domain = domainOf(hit.url) ?? '';
  if (BLOCKED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { score: 0, relevant: false, reason: `domínio sem valor para prospecção (${domain})` };
  }
  if (/\.(pdf|docx?|xlsx?|zip|mp4|jpg|png)(\?|$)/i.test(hit.url)) {
    return { score: 0, relevant: false, reason: 'arquivo não-HTML' };
  }
  const text = normalizeText(`${hit.title} ${hit.snippet} ${hit.url.replace(/[/_.-]+/g, ' ')}`);
  let score = 0;
  const reasons: string[] = [];
  const kws = category ? [category.name, ...category.keywords] : [];
  if (kws.some((k) => text.includes(normalizeText(k)))) {
    score += 45;
    reasons.push('palavra-chave');
  } else if (kws.some((k) => normalizeText(k).split(' ').filter((w) => w.length > 3).every((w) => text.includes(w)))) {
    score += 30;
    reasons.push('termos da categoria');
  }
  const contestHits = CONTEST_WORDS.filter((w) => text.includes(w)).length;
  score += Math.min(25, contestHits * 8);
  const year = now.getFullYear();
  if (text.includes(String(year)) || text.includes(String(year + 1))) {
    score += 12;
    reasons.push('ano atual/futuro');
  } else {
    const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
    if (years.length && Math.max(...years) < year - 2) {
      score -= 20;
      reasons.push('edição antiga');
    }
  }
  const st = uf ? stateInfo(uf) : undefined;
  if (st && (text.includes(normalizeText(st.name)) || new RegExp(`\\b${st.uf.toLowerCase()}\\b`).test(text))) {
    score += 10;
    reasons.push('estado');
  }
  if (category?.negativeKeywords.some((n) => text.includes(normalizeText(n)))) {
    score -= 60;
    reasons.push('palavra negativa');
  }
  if (/\.gov\.br$/.test(domain)) score += 5;
  score = Math.max(0, Math.min(100, score));
  return { score, relevant: score >= 40, reason: reasons.join(', ') || 'sem sinais' };
}
