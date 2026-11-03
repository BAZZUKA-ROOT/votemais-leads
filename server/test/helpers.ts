import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { setAiImpl, type AiRequest } from '../src/ai/client.js';
import { db } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { setFetchImpl } from '../src/extraction/fetch-page.js';
import { redis } from '../src/queue/connection.js';
import { registerConnector } from '../src/search/connectors/registry.js';
import { searxngConnector } from '../src/search/connectors/searxng.js';
import type { SearchHit } from '../src/search/connectors/types.js';
import { createUser } from '../src/services/auth.js';
import { saveIntegration } from '../src/services/integrations.js';

let migrated = false;

export async function resetDb() {
  if (!migrated) {
    await runMigrations();
    migrated = true;
  }
  const r = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const tables = r.rows.map((t) => `"${t.tablename}"`).join(', ');
  await db.execute(sql.raw(`truncate ${tables} restart identity cascade`));
  await redis().flushdb();
  await seed();
  setAiImpl(null);
  setFetchImpl(null);
  registerConnector(searxngConnector);
}

export const ADMIN = { email: 'teste@votemais.online', password: 'SenhaForte12345', name: 'Teste' };
export async function createAdmin() {
  return createUser({ ...ADMIN, role: 'admin' });
}

/** Configura SearXNG e registra conector de teste no lugar do real. */
export async function useStubSearch(handler: (q: string) => SearchHit[] | Promise<SearchHit[]>, id = 'searxng') {
  await saveIntegration(id, { enabled: true, config: id === 'searxng' ? { baseUrl: 'http://searxng.test' } : {}, credentials: id === 'searxng' ? {} : { apiKey: 'test-key' } });
  registerConnector({ id, search: async (q) => handler(q) });
}

export function useStubPages(pages: Record<string, string>) {
  setFetchImpl(
    async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const html = pages[url];
      if (!html) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    },
    { skipGuards: true },
  );
}

type Responder = (req: AiRequest<z.ZodType>) => unknown;
/** Substitui a IA por respostas determinísticas por finalidade (apenas em testes). */
export function useStubAi(responders: Partial<Record<'extraction' | 'classification' | 'message' | 'refresh', Responder>>) {
  const calls: AiRequest<z.ZodType>[] = [];
  setAiImpl(async (req) => {
    calls.push(req as AiRequest<z.ZodType>);
    const fn = responders[req.purpose];
    if (!fn) throw new Error(`stub de IA sem resposta para ${req.purpose}`);
    const data = req.schema.parse(fn(req as AiRequest<z.ZodType>));
    return { data, model: 'stub-model', inputTokens: 100, outputTokens: 50, costUsd: 0.001 };
  });
  return calls;
}

export const EVENT_URL = 'https://expogoiania.com.br/rainha';
export const EVENT_PAGE = `<!doctype html><html><head><title>Rainha da Expo Goiânia 2027 — Inscrições abertas</title>
<meta name="description" content="Concurso Rainha da Expo Goiânia 2027"></head><body>
<h1>Rainha da Expo Goiânia 2027</h1>
<p>A Associação Expo Goiânia realiza o concurso Rainha da Expo Goiânia 2027, em Goiânia - GO, no dia 2027-05-20.</p>
<p>Inscrições abertas para candidatas de 18 a 26 anos.</p>
<p>Contato comercial: WhatsApp (62) 99876-5432 · e-mail contato@expogoiania.com.br</p>
<a href="https://www.instagram.com/expogoiania/">Instagram</a>
<a href="https://wa.me/5562998765432">Fale no WhatsApp</a>
<p>Desenvolvido por agência XYZ - (11) 3333-4444</p>
</body></html>`;

export function extractionFor(overrides: Record<string, unknown> = {}) {
  return (req: AiRequest<z.ZodType>) => {
    const lines = req.user.split('\n').filter((l) => /^\[\d+\]/.test(l));
    const idx = (pred: (l: string) => boolean) => {
      const line = lines.find(pred);
      return line ? Number(line.match(/^\[(\d+)\]/)![1]) : -1;
    };
    const contacts = [
      { index: idx((l) => l.includes('whatsapp') && l.includes('99876')), is_commercial: true, label: 'WhatsApp comercial' },
      { index: idx((l) => l.includes('email: contato@')), is_commercial: true, label: null },
      { index: idx((l) => l.includes('instagram: @expogoiania')), is_commercial: true, label: null },
      { index: idx((l) => l.includes('3333-4444')), is_commercial: false, label: 'agência' },
    ].filter((c) => c.index >= 0);
    return {
      is_event_opportunity: true,
      discard_reason: null,
      event: {
        name: 'Rainha da Expo Goiânia 2027',
        edition: null,
        year: 2027,
        city: 'Goiânia',
        state: 'GO',
        start_date: '2027-05-20',
        end_date: null,
        category_slug: 'rainha-da-expo',
        status: 'scheduled',
        description: 'Concurso Rainha da Expo Goiânia',
        has_contest: 'confirmed',
        has_participants: 'confirmed',
        registration_open: 'confirmed',
        has_popular_voting: 'not_found',
        voting_evidence: null,
        current_voting_method: null,
      },
      organizer: { name: 'Associação Expo Goiânia', company_name: null, person_name: null, type: 'associacao', evidence: 'A Associação Expo Goiânia realiza o concurso' },
      contacts,
      official_website: EVENT_URL,
      official_instagram: 'expogoiania',
      cnpj: null,
      facts: ['Inscrições abertas'],
      hypotheses: ['Pode haver votação popular'],
      followup_queries: [],
      ...overrides,
    };
  };
}

export const classificationOk = (score = 82) => () => ({
  score,
  potential: score >= 70 ? 'alta' : score >= 40 ? 'media' : 'baixa',
  voting_probability: 70,
  justification: 'Concurso com inscrições abertas, organizador e WhatsApp identificados.',
  facts: ['Inscrições abertas'],
  hypotheses: ['Votação popular não confirmada'],
  approach_hooks: ['Edição 2027 com inscrições abertas'],
  enrichment_queries: [],
});

export const MESSAGE_TEXT =
  'Olá! Tudo bem? Vi que vocês estão organizando o concurso Rainha da Expo Goiânia 2027, com inscrições abertas. A VoteMais oferece uma plataforma personalizada para concursos, com votação online, ranking em tempo real, pagamentos via PIX e cartão e painel administrativo. Caso pensem em votação online, pode ser interessante para vocês. Conheça: https://votemais.online — podemos conversar?';

export const messageOk = () => ({ message: MESSAGE_TEXT, approach: 'direta', used_facts: ['Inscrições abertas'] });

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 20_000, stepMs = 200): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('waitFor: tempo esgotado');
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
