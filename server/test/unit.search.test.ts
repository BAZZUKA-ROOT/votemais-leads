import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Category } from '../src/db/schema.js';
import { buildQueries } from '../src/search/query-builder.js';
import { scoreRelevance } from '../src/search/relevance.js';
import { searxngConnector } from '../src/search/connectors/searxng.js';
import { ConnectorHttpError } from '../src/search/connectors/types.js';

const cat = { id: 1, name: 'Rainha do Rodeio', slug: 'rainha-do-rodeio', group: 'rodeio', keywords: ['Rainha do Rodeio'], negativeKeywords: ['fantasia de'], priority: 9, isActive: true, description: null, createdAt: new Date(), updatedAt: new Date() } as Category;
const now = new Date('2026-11-03T12:00:00Z');

describe('geração de consultas', () => {
  it('cria consultas por estado com ano atual/próximo e Instagram', () => {
    const qs = buildQueries(cat, 'GO', now, 10).map((q) => q.query);
    expect(qs).toContain('"Rainha do Rodeio" 2026 Goiás');
    expect(qs).toContain('"Rainha do Rodeio" 2027 inscrições Goiás');
    expect(qs.some((q) => q.startsWith('site:instagram.com'))).toBe(true);
    expect(qs.some((q) => q.includes('prefeitura'))).toBe(true);
    expect(new Set(qs).size).toBe(qs.length);
  });
  it('respeita limite e UF inválida', () => {
    expect(buildQueries(cat, 'GO', now, 2)).toHaveLength(2);
    expect(buildQueries(cat, 'XX', now)).toHaveLength(0);
  });
});

describe('relevância', () => {
  it('aprova resultado claramente relevante', () => {
    const r = scoreRelevance({ url: 'https://expo.com.br/rainha', title: 'Concurso Rainha do Rodeio 2027 — inscrições abertas', snippet: 'Candidatas de Goiás' }, cat, 'GO', now);
    expect(r.relevant).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(60);
  });
  it('rejeita domínios bloqueados, negativos e antigos', () => {
    expect(scoreRelevance({ url: 'https://www.youtube.com/watch?v=1', title: 'Rainha do Rodeio 2027', snippet: '' }, cat, 'GO', now).relevant).toBe(false);
    expect(scoreRelevance({ url: 'https://loja.com/x', title: 'Fantasia de Rainha do Rodeio', snippet: 'comprar' }, cat, 'GO', now).relevant).toBe(false);
    const old = scoreRelevance({ url: 'https://a.com/x', title: 'Rainha do Rodeio 2015', snippet: 'resultado' }, cat, null, now);
    expect(old.score).toBeLessThan(scoreRelevance({ url: 'https://a.com/x', title: 'Rainha do Rodeio 2027', snippet: 'resultado' }, cat, null, now).score);
  });
});

describe('conector SearXNG', () => {
  const integ = { provider: 'searxng', config: { baseUrl: 'http://searx' } } as unknown as Parameters<typeof searxngConnector.search>[1]['integration'];
  const respond = (body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
  afterEach(() => vi.unstubAllGlobals());

  it('mecanismos bloqueados sem resultados viram erro temporário (para cair no próximo provedor)', async () => {
    respond({ results: [], unresponsive_engines: [['duckduckgo', 'CAPTCHA'], ['brave', 'Suspended: timeout']] });
    const err = await searxngConnector.search('Rainha do Rodeio', { count: 10, integration: integ }).catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorHttpError);
    expect(err.retryable).toBe(true);
    expect(err.message).toContain('duckduckgo: CAPTCHA');
  });

  it('sem resultados e sem falhas é apenas uma busca vazia', async () => {
    respond({ results: [], unresponsive_engines: [] });
    expect(await searxngConnector.search('x', { count: 10, integration: integ })).toEqual([]);
  });

  it('resultados parciais com algum mecanismo falhando são aproveitados', async () => {
    respond({ results: [{ url: 'https://a.com', title: 'A', content: 'c' }], unresponsive_engines: [['duckduckgo', 'CAPTCHA']] });
    expect(await searxngConnector.search('x', { count: 10, integration: integ })).toHaveLength(1);
  });
});
