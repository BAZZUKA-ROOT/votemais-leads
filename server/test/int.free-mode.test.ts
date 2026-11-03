import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiMode } from '../src/ai/client.js';
import { extractionSchema, groundExtraction } from '../src/ai/extraction.js';
import { rulesExtract, rulesMessage } from '../src/ai/rules.js';
import { validateMessage } from '../src/ai/messages.js';
import { db } from '../src/db/client.js';
import { aiAnalyses, apiUsage, contacts, events, generatedMessages, leads, organizers, searchQueries, searchResults } from '../src/db/schema.js';
import { extractFromHtml } from '../src/extraction/extract.js';
import { analyzeLead, generateMessage } from '../src/services/analysis.js';
import { saveIntegration } from '../src/services/integrations.js';
import { createSearchJob, executeQuery, processResult } from '../src/services/search-runner.js';
import { updateSettings } from '../src/services/settings.js';
import { EVENT_PAGE, EVENT_URL, resetDb, useStubPages, useStubSearch } from './helpers.js';

const cats = [{ slug: 'rainha-da-expo', name: 'Rainha da Expo' }];

describe('modo gratuito por regras (sem IA)', () => {
  beforeEach(async () => {
    await resetDb();
    await updateSettings({ maxFollowupDepth: 0 });
  });

  it('é o modo padrão quando nenhuma IA paga está configurada', async () => {
    expect(await aiMode()).toBe('rules');
    await saveIntegration('rules', { enabled: false });
    expect(await aiMode()).toBeNull();
  });

  it('extrai evento, local, data, organizador e fatos literalmente da página', () => {
    const page = extractFromHtml(EVENT_PAGE, EVENT_URL);
    const input = { url: EVENT_URL, title: page.title, snippet: '', page, candidates: page.contacts, categories: cats, currentDate: '2026-11-03' };
    const out = extractionSchema.parse(rulesExtract(input));
    expect(out.is_event_opportunity).toBe(true);
    expect(out.event).toMatchObject({ name: 'Rainha da Expo Goiânia 2027', year: 2027, city: 'Goiânia', state: 'GO', category_slug: 'rainha-da-expo', has_contest: 'confirmed', has_participants: 'confirmed', registration_open: 'confirmed', status: 'scheduled' });
    expect(out.organizer.name).toMatch(/Associação Expo Goiânia/);
    const g = groundExtraction(out, input);
    expect(g.accepted).toBe(true);
    const agency = g.contacts.find((c) => c.normalized === '551133334444');
    expect(agency?.isCommercial).toBe(false);
    expect(g.contacts.find((c) => c.normalized === '5562998765432')?.isCommercial).toBe(true);
  });

  it('descarta páginas sem indício de concurso', () => {
    const html = '<html><head><title>Loja de roupas em Goiânia</title></head><body>Promoções da semana</body></html>';
    const page = extractFromHtml(html, 'https://loja.com.br');
    const out = rulesExtract({ url: 'https://loja.com.br', title: page.title, snippet: '', page, candidates: page.contacts, categories: cats, currentDate: '2026-11-03' });
    expect(out.is_event_opportunity).toBe(false);
  });

  it('mensagens de modelo passam nas regras e variam', () => {
    const base = { eventName: 'Rainha da Expo 2027', city: 'Goiânia', state: 'GO', categoryName: null, organizerName: null, confirmedFacts: [], votingConfirmed: false, kind: 'initial' as const, approach: '' };
    const texts = new Set<string>();
    for (let v = 0; v < 4; v++) {
      const m = rulesMessage(base, v).message;
      expect(validateMessage(m, base)).toBeNull();
      texts.add(m);
    }
    expect(texts.size).toBe(4);
    const fu = rulesMessage({ ...base, kind: 'followup' }, 0).message;
    expect(validateMessage(fu, { ...base, kind: 'followup' })).toBeNull();
  });

  it('pipeline completo sem custo: pesquisa → lead → classificação → mensagem', async () => {
    await useStubSearch(() => [{ url: EVENT_URL, title: 'Rainha da Expo Goiânia 2027 — inscrições abertas', snippet: 'Concurso em Goiânia, Goiás', position: 1 }]);
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    const job = await createSearchJob({ type: 'manual', queries: [{ query: 'rainha expo goiás', origin: 'manual', categoryId: 12, state: 'GO' }] });
    const [q] = await db.select().from(searchQueries).where(eq(searchQueries.jobId, job!.id));
    await executeQuery(q!.id);
    const [r] = await db.select().from(searchResults);
    expect((await processResult(r!.id)).outcome).toBe('created');

    const [ev] = await db.select().from(events);
    expect(ev).toMatchObject({ name: 'Rainha da Expo Goiânia 2027', state: 'GO' });
    expect(await db.$count(organizers)).toBe(1);
    expect(await db.$count(contacts)).toBeGreaterThan(2);

    const [lead] = await db.select().from(leads);
    const res = await analyzeLead(lead!.id);
    expect(res.qualified).toBe(true);
    const [an] = await db.select().from(aiAnalyses).where(eq(aiAnalyses.type, 'classification'));
    expect(an!.model).toBe('regras');
    expect(Number(an!.costUsd)).toBe(0);

    const msg = await generateMessage(lead!.id, 'initial');
    expect(msg.content).toContain('Rainha da Expo Goiânia 2027');
    expect(msg.model).toBe('regras');
    expect(await db.$count(generatedMessages)).toBe(1);
    const paid = (await db.select().from(apiUsage)).filter((u) => Number(u.costUsd) > 0);
    expect(paid).toHaveLength(0);
  });
});

describe('Ollama (IA local gratuita)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('usa saída estruturada do Ollama com prioridade sobre o modo regras', async () => {
    await resetDb();
    await saveIntegration('ollama', { enabled: true, config: { baseUrl: 'http://ollama.test:11434', model: 'qwen2.5:7b' } });
    expect(await aiMode()).toBe('ollama');
    const realFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).startsWith('http://ollama.test')) {
        const body = JSON.parse(String(init?.body));
        expect(body.format.type).toBe('object');
        expect(body.stream).toBe(false);
        return new Response(JSON.stringify({ message: { content: JSON.stringify({ message: 'x', approach: 'y', used_facts: [] }) }, prompt_eval_count: 50, eval_count: 20 }), { status: 200 });
      }
      return realFetch(url, init);
    });
    const { aiCall } = await import('../src/ai/client.js');
    const { messageSchema } = await import('../src/ai/messages.js');
    const r = await aiCall({ purpose: 'message', system: 's', user: 'u', schema: messageSchema });
    expect(r).toMatchObject({ model: 'ollama:qwen2.5:7b', costUsd: 0, inputTokens: 50 });
    expect(spy).toHaveBeenCalled();
    const [u] = await db.select().from(apiUsage).where(eq(apiUsage.provider, 'ollama'));
    expect(u).toMatchObject({ success: true, costUsd: '0.000000' });
  });
});
