import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { aiAnalyses, apiUsage, contacts, events, generatedMessages, leads, organizers, searchJobs, searchQueries, searchResults } from '../src/db/schema.js';
import { registerConnector } from '../src/search/connectors/registry.js';
import { ConnectorHttpError } from '../src/search/connectors/types.js';
import { analyzeLead, generateMessage } from '../src/services/analysis.js';
import { createSearchJob, executeQuery, processResult } from '../src/services/search-runner.js';
import { updateSettings } from '../src/services/settings.js';
import { saveIntegration } from '../src/services/integrations.js';
import {
  classificationOk,
  EVENT_PAGE,
  EVENT_URL,
  extractionFor,
  messageOk,
  resetDb,
  useStubAi,
  useStubPages,
  useStubSearch,
} from './helpers.js';

const HIT = { url: EVENT_URL, title: 'Rainha da Expo Goiânia 2027 — inscrições abertas', snippet: 'Concurso Rainha da Expo Goiânia 2027 em Goiânia, Goiás. Candidatas.', position: 1 };

async function runJob(queries: string[]) {
  const job = await createSearchJob({ type: 'manual', queries: queries.map((q) => ({ query: q, origin: 'manual' as const, categoryId: 12, state: 'GO' })) });
  const qs = await db.select().from(searchQueries).where(eq(searchQueries.jobId, job!.id));
  for (const q of qs) await executeQuery(q.id);
  const rs = await db.select().from(searchResults).where(eq(searchResults.jobId, job!.id));
  const outcomes = [];
  for (const r of rs.filter((x) => x.status === 'new')) outcomes.push(await processResult(r.id));
  return { job: job!, outcomes };
}

describe('pipeline de descoberta', () => {
  beforeEach(async () => {
    await resetDb();
    await updateSettings({ maxFollowupDepth: 0 });
  });

  it('pesquisa → página → IA → evento/organizador/contatos/lead com fontes', async () => {
    await useStubSearch(() => [HIT, { url: 'https://www.youtube.com/watch?v=x', title: 'Rainha da Expo vídeo', snippet: '', position: 2 }]);
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    useStubAi({ extraction: extractionFor() });

    const { job, outcomes } = await runJob(['"Rainha da Expo" 2027 Goiás']);
    expect(outcomes.map((o) => o.outcome)).toEqual(['created']);

    const [ev] = await db.select().from(events);
    expect(ev).toMatchObject({ name: 'Rainha da Expo Goiânia 2027', state: 'GO', region: 'Centro-Oeste', year: 2027, startDate: '2027-05-20', hasContest: 'confirmed', hasPopularVoting: 'not_found', instagramHandle: 'expogoiania' });
    expect(ev!.fieldSources.name).toBe(EVENT_URL);
    const [org] = await db.select().from(organizers);
    expect(org).toMatchObject({ name: 'Associação Expo Goiânia', type: 'associacao', instagramHandle: 'expogoiania', websiteDomain: 'expogoiania.com.br' });
    const cts = await db.select().from(contacts);
    expect(cts.every((c) => c.sourceUrl.length > 0)).toBe(true);
    expect(cts.find((c) => c.normalizedValue === '551133334444')?.isCommercial).toBe(false);
    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({ primaryWhatsapp: '5562998765432', primaryEmail: 'contato@expogoiania.com.br', primaryInstagram: 'expogoiania', state: 'GO', stage: 'novo', qualification: 'pending_analysis' });

    const [j] = await db.select().from(searchJobs).where(eq(searchJobs.id, job.id));
    expect(j).toMatchObject({ status: 'completed', leadsCreated: 1, completedQueries: 1 });
    expect(j!.discarded).toBeGreaterThanOrEqual(1); // youtube
    const usage = await db.select().from(apiUsage);
    expect(usage.some((u) => u.provider === 'searxng' && u.success)).toBe(true);
    const [extraction] = await db.select().from(aiAnalyses).where(eq(aiAnalyses.type, 'extraction'));
    expect(extraction?.eventId).toBe(ev!.id);
  });

  it('deduplica: mesmo evento por outra fonte agrega sem criar novo lead', async () => {
    const OTHER = 'https://portalgoias.com.br/noticia/rainha-expo';
    await useStubSearch((q) => (q.includes('noticia') ? [{ ...HIT, url: OTHER }] : [HIT]));
    useStubPages({ [EVENT_URL]: EVENT_PAGE, [OTHER]: EVENT_PAGE.replace('contato@expogoiania.com.br', 'imprensa@portalgoias.com.br') });
    useStubAi({ extraction: extractionFor({ official_website: null }) });

    await runJob(['q1 rainha expo']);
    const second = await runJob(['q2 noticia rainha expo']);
    expect(second.outcomes.map((o) => o.outcome)).toEqual(['merged']);
    expect(await db.$count(leads)).toBe(1);
    expect(await db.$count(events)).toBe(1);
    expect(await db.$count(organizers)).toBe(1);
    const [j] = await db.select().from(searchJobs).where(eq(searchJobs.id, second.job.id));
    expect(j!.duplicates).toBeGreaterThanOrEqual(1);
    // mesma URL novamente não é considerada novo resultado
    const third = await runJob(['q3 rainha expo outra']);
    expect(third.outcomes).toHaveLength(0);
  });

  it('sem IA configurada: resultado fica aguardando, sem simular análise', async () => {
    await saveIntegration('rules', { enabled: false });
    await useStubSearch(() => [HIT]);
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    const job = await createSearchJob({ type: 'manual', queries: [{ query: 'rainha expo goiás', origin: 'manual', categoryId: 12, state: 'GO' }] });
    const [q] = await db.select().from(searchQueries).where(eq(searchQueries.jobId, job!.id));
    await executeQuery(q!.id);
    const [r] = await db.select().from(searchResults);
    await expect(processResult(r!.id)).rejects.toThrow(/IA não configurada/);
    const [after] = await db.select().from(searchResults);
    expect(after!.status).toBe('awaiting_ai');
    expect(await db.$count(leads)).toBe(0);
  });

  it('fallback entre provedores e falha não-recuperável', async () => {
    await updateSettings({ searchConnectorOrder: ['brave', 'searxng'] });
    await useStubSearch(() => {
      throw new ConnectorHttpError('brave', 503, 'indisponível');
    }, 'brave');
    await useStubSearch(() => [HIT], 'searxng');
    const job = await createSearchJob({ type: 'manual', queries: [{ query: 'x rainha', origin: 'manual' }] });
    const [q] = await db.select().from(searchQueries).where(eq(searchQueries.jobId, job!.id));
    await executeQuery(q!.id);
    const [done] = await db.select().from(searchQueries).where(eq(searchQueries.id, q!.id));
    expect(done).toMatchObject({ status: 'done', connector: 'searxng' });
    const usage = await db.select().from(apiUsage);
    expect(usage.find((u) => u.provider === 'brave')?.success).toBe(false);

    // erro 401 em todos os provedores => falha definitiva registrada
    registerConnector({ id: 'searxng', search: async () => { throw new ConnectorHttpError('searxng', 401, 'chave inválida'); } });
    registerConnector({ id: 'brave', search: async () => { throw new ConnectorHttpError('brave', 401, 'chave inválida'); } });
    const job2 = await createSearchJob({ type: 'manual', queries: [{ query: 'y rainha', origin: 'manual' }] });
    const [q2] = await db.select().from(searchQueries).where(eq(searchQueries.jobId, job2!.id));
    await executeQuery(q2!.id);
    const [failed] = await db.select().from(searchQueries).where(eq(searchQueries.id, q2!.id));
    expect(failed!.status).toBe('failed');
    const [j2] = await db.select().from(searchJobs).where(eq(searchJobs.id, job2!.id));
    expect(j2!.status).toBe('failed');
  });

  it('cache evita repetir a mesma consulta dentro do período', async () => {
    let calls = 0;
    await useStubSearch(() => {
      calls++;
      return [];
    });
    for (let i = 0; i < 2; i++) {
      const job = await createSearchJob({ type: 'scheduled', queries: [{ query: 'Rainha do Rodeio 2027 Goiás', origin: 'template' }] });
      const [q] = await db.select().from(searchQueries).where(eq(searchQueries.jobId, job!.id));
      await executeQuery(q!.id);
    }
    expect(calls).toBe(1);
    const skipped = await db.select().from(searchQueries).where(eq(searchQueries.status, 'skipped'));
    expect(skipped).toHaveLength(1);
  });

  it('classificação por IA qualifica lead, gera checklist factual e mensagem', async () => {
    await useStubSearch(() => [HIT]);
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    const calls = useStubAi({ extraction: extractionFor(), classification: classificationOk(82), message: messageOk });
    await runJob(['rainha expo']);
    const [lead] = await db.select().from(leads);
    const res = await analyzeLead(lead!.id);
    expect(res).toMatchObject({ score: 82, qualified: true });
    const [updated] = await db.select().from(leads);
    expect(updated).toMatchObject({ qualification: 'qualified', stage: 'qualificado', potential: 'alta', score: 82 });
    const [an] = await db.select().from(aiAnalyses).where(eq(aiAnalyses.type, 'classification'));
    const items = Object.fromEntries(an!.checklist!.map((c) => [c.item, c.status]));
    expect(items['Existe concurso/premiação']).toBe('confirmed');
    expect(items['Possui votação popular']).toBe('not_found');
    expect(items['Organizador identificado']).toBe('confirmed');
    expect(items['Contato comercial encontrado']).toBe('confirmed');
    expect(an!.dataQuality).toBeGreaterThan(60);
    // dossiê enviado à IA marca votação como não confirmada
    expect(calls.find((c) => c.purpose === 'classification')!.user).toContain('Votação popular: not_found');

    const msg = await generateMessage(lead!.id, 'initial');
    expect(msg.content).toContain('https://votemais.online');
    expect(msg.status).toBe('draft');
    const prompt = calls.find((c) => c.purpose === 'message')!.user;
    expect(prompt).toContain('VOTAÇÃO POPULAR CONFIRMADA: não');
    expect(prompt).toContain('Rainha da Expo Goiânia 2027');
  });

  it('lead com pontuação baixa não é qualificado nem recebe mensagem automática', async () => {
    await useStubSearch(() => [HIT]);
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    useStubAi({ extraction: extractionFor(), classification: classificationOk(30) });
    await runJob(['rainha expo']);
    const [lead] = await db.select().from(leads);
    await analyzeLead(lead!.id);
    const [l] = await db.select().from(leads);
    expect(l).toMatchObject({ qualification: 'disqualified', stage: 'novo' });
    expect(await db.$count(generatedMessages)).toBe(0);
  });

  it('mensagem que viola regras é regenerada e, se persistir, falha', async () => {
    await useStubSearch(() => [HIT]);
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    let n = 0;
    useStubAi({
      extraction: extractionFor(),
      message: () => {
        n++;
        return { message: 'Olá [nome], conheça nossa plataforma de votação online para o seu concurso, é muito boa e completa para eventos.', approach: 'x', used_facts: [] };
      },
    });
    await runJob(['rainha expo']);
    const [lead] = await db.select().from(leads);
    await expect(generateMessage(lead!.id, 'initial')).rejects.toThrow(/validação/);
    expect(n).toBe(2);
  });

  it('pesquisa progressiva cria consultas complementares ligadas ao evento', async () => {
    await updateSettings({ maxFollowupDepth: 1 });
    await useStubSearch(() => [HIT]);
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    useStubAi({ extraction: extractionFor({ followup_queries: ['"Rainha da Expo Goiânia" 2027 instagram oficial', 'Expo Goiânia contato comercial'] }) });
    await runJob(['rainha expo']);
    const follow = await db.select().from(searchJobs).where(eq(searchJobs.type, 'followup'));
    expect(follow).toHaveLength(1);
    const [ev] = await db.select().from(events);
    expect(follow[0]!.contextEventId).toBe(ev!.id);
    const fq = await db.select().from(searchQueries).where(eq(searchQueries.jobId, follow[0]!.id));
    expect(fq.map((q) => q.origin)).toEqual(['ai_followup', 'ai_followup']);
    expect(fq.every((q) => q.depth === 1)).toBe(true);
  });

  it('não cria lead quando contato está na lista de supressão', async () => {
    const { addSuppression } = await import('../src/services/privacy.js');
    await addSuppression('phone', '(62) 99876-5432', 'pediu para não ser contatado', null);
    await useStubSearch(() => [HIT]);
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    useStubAi({ extraction: extractionFor() });
    const { outcomes } = await runJob(['rainha expo']);
    expect(outcomes[0]!.outcome).toBe('suppressed');
    expect(await db.$count(leads)).toBe(0);
    expect(await db.$count(contacts)).toBe(0);
  });

  it('integrações nunca expõem segredos', async () => {
    await saveIntegration('brave', { enabled: true, credentials: { apiKey: 'BSA-super-secret-key-9876' } });
    const { listIntegrations } = await import('../src/services/integrations.js');
    const list = await listIntegrations();
    const brave = list.find((i) => i.provider === 'brave')!;
    expect(JSON.stringify(list)).not.toContain('super-secret');
    expect(brave.secrets.apiKey).toBe('••••9876');
    expect(brave.status).toBe('configured');
    const anth = list.find((i) => i.provider === 'anthropic')!;
    expect(anth.status).toBe('not_configured');
    expect(anth.missing).toContain('API Key');
  });
});
