import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { isAiReady } from '../ai/client.js';
import { runExtraction } from '../ai/extraction.js';
import { db } from '../db/client.js';
import { aiAnalyses, categories, events, searchJobs, searchQueries, searchResults, type SearchQuery } from '../db/schema.js';
import { extractFromHtml, extractFromSearchSnippet, type ExtractedPage } from '../extraction/extract.js';
import { fetchPage, FetchBlockedError } from '../extraction/fetch-page.js';
import { canonicalUrl, domainOf, queryHash, urlHash } from '../lib/normalize.js';
import { errMsg, syslog } from '../lib/logger.js';
import { enqueue } from '../queue/queues.js';
import { getConnector } from '../search/connectors/registry.js';
import { ConnectorHttpError } from '../search/connectors/types.js';
import { scoreRelevance } from '../search/relevance.js';
import { classifySource, persistDiscovery } from './discovery.js';
import { lookupCnpj } from './enrichment.js';
import { readyProviders, recordUsage, type ResolvedIntegration } from './integrations.js';
import { getSettings } from './settings.js';

export interface NewQuery {
  query: string;
  categoryId?: number | null;
  state?: string | null;
  city?: string | null;
  origin: 'template' | 'ai_followup' | 'refresh' | 'manual';
  depth?: number;
  parentQueryId?: string | null;
}

export async function createSearchJob(input: {
  type: 'scheduled' | 'manual' | 'followup' | 'refresh';
  queries: NewQuery[];
  params?: Record<string, unknown>;
  triggeredBy?: string | null;
  contextEventId?: string | null;
  campaignId?: number | null;
}) {
  const unique = [...new Map(input.queries.map((q) => [queryHash(q.query), q])).values()];
  if (!unique.length) return null;
  const { job, rows } = await db.transaction(async (tx) => {
    const [job] = await tx
      .insert(searchJobs)
      .values({
        type: input.type,
        status: 'queued',
        params: input.params ?? {},
        triggeredBy: input.triggeredBy ?? null,
        contextEventId: input.contextEventId ?? null,
        campaignId: input.campaignId ?? null,
        totalQueries: unique.length,
      })
      .returning();
    const rows = await tx
      .insert(searchQueries)
      .values(
        unique.map((q) => ({
          jobId: job!.id,
          query: q.query.slice(0, 500),
          queryHash: queryHash(q.query),
          categoryId: q.categoryId ?? null,
          state: q.state ?? null,
          city: q.city ?? null,
          origin: q.origin,
          depth: q.depth ?? 0,
          parentQueryId: q.parentQueryId ?? null,
        })),
      )
      .returning({ id: searchQueries.id });
    return { job: job!, rows };
  });
  for (const r of rows) await enqueue('search', { queryId: r.id, jobId: job.id }, { jobId: `q-${r.id}` });
  await syslog('info', 'search', `Pesquisa ${input.type} criada com ${rows.length} consultas`, { jobId: job.id });
  return job;
}

async function jobIsActive(jobId: string) {
  const [j] = await db.select({ status: searchJobs.status }).from(searchJobs).where(eq(searchJobs.id, jobId));
  return j && j.status !== 'cancelled' && j.status !== 'failed';
}

async function heartbeat(jobId: string) {
  await db
    .update(searchJobs)
    .set({ status: sql`case when ${searchJobs.status} = 'queued' then 'running'::search_job_status else ${searchJobs.status} end`, heartbeatAt: new Date(), startedAt: sql`coalesce(${searchJobs.startedAt}, now())` })
    .where(eq(searchJobs.id, jobId));
}

export async function finalizeJobIfDone(jobId: string) {
  const [j] = await db.select().from(searchJobs).where(eq(searchJobs.id, jobId));
  if (!j || j.status === 'cancelled' || j.status === 'completed' || j.status === 'failed') return;
  const [pendingQ] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(searchQueries)
    .where(and(eq(searchQueries.jobId, jobId), inArray(searchQueries.status, ['pending', 'running'])));
  const [pendingR] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(searchResults)
    .where(and(eq(searchResults.jobId, jobId), inArray(searchResults.status, ['new', 'processing'])));
  if ((pendingQ?.n ?? 0) > 0 || (pendingR?.n ?? 0) > 0) return;
  const allFailed = j.failedQueries > 0 && j.failedQueries >= j.totalQueries;
  await db
    .update(searchJobs)
    .set({ status: allFailed ? 'failed' : 'completed', finishedAt: new Date(), error: allFailed ? (j.error ?? 'Todas as consultas falharam') : j.error })
    .where(eq(searchJobs.id, jobId));
}

/** Ordem de provedores: configuração do usuário, depois os demais prontos. */
export async function orderedSearchProviders(): Promise<ResolvedIntegration[]> {
  const ready = await readyProviders('search');
  const settings = await getSettings();
  const order = settings.searchConnectorOrder;
  return ready.sort((a, b) => {
    const ia = order.indexOf(a.provider);
    const ib = order.indexOf(b.provider);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export class NoSearchProviderError extends Error {
  constructor() {
    super('Nenhum provedor de pesquisa configurado. Configure ao menos um em Integrações.');
  }
}

/** Executa uma consulta: provedor principal com fallback; persiste resultados novos e enfileira os relevantes. */
export async function executeQuery(queryId: string): Promise<void> {
  const [q] = await db.select().from(searchQueries).where(eq(searchQueries.id, queryId));
  if (!q || q.status === 'done' || q.status === 'skipped' || q.status === 'cancelled') return;
  if (!(await jobIsActive(q.jobId))) {
    await db.update(searchQueries).set({ status: 'cancelled' }).where(eq(searchQueries.id, q.id));
    return;
  }
  await heartbeat(q.jobId);
  const settings = await getSettings();

  if (settings.queryCacheDays > 0 && q.origin !== 'manual') {
    const since = new Date(Date.now() - settings.queryCacheDays * 86400_000);
    const [recent] = await db
      .select({ id: searchQueries.id })
      .from(searchQueries)
      .where(and(eq(searchQueries.queryHash, q.queryHash), eq(searchQueries.status, 'done'), gte(searchQueries.finishedAt, since), sql`${searchQueries.id} <> ${q.id}`))
      .limit(1);
    if (recent) {
      await db.update(searchQueries).set({ status: 'skipped', error: 'Consulta executada recentemente (cache)', finishedAt: new Date() }).where(eq(searchQueries.id, q.id));
      await db.update(searchJobs).set({ completedQueries: sql`${searchJobs.completedQueries} + 1` }).where(eq(searchJobs.id, q.jobId));
      await finalizeJobIfDone(q.jobId);
      return;
    }
  }

  const providers = await orderedSearchProviders();
  if (!providers.length) {
    await failQuery(q, new NoSearchProviderError().message);
    throw new NoSearchProviderError();
  }

  const started = Date.now();
  await db.update(searchQueries).set({ status: 'running', startedAt: new Date(), attempts: sql`${searchQueries.attempts} + 1` }).where(eq(searchQueries.id, q.id));

  let lastErr: unknown = null;
  for (const integ of providers) {
    const connector = getConnector(integ.provider);
    if (!connector) continue;
    const t0 = Date.now();
    try {
      const hits = await connector.search(q.query, { count: settings.resultsPerQuery, integration: integ });
      const price = Number(integ.config.pricePer1000 ?? 0);
      await recordUsage({ provider: integ.provider, operation: 'search', units: 1, costUsd: price / 1000, success: true, durationMs: Date.now() - t0, jobId: q.jobId });
      await storeHits(q, integ.provider, hits);
      await db.update(searchQueries).set({ connector: integ.provider }).where(eq(searchQueries.id, q.id));
      await db.update(searchQueries).set({ durationMs: Date.now() - started }).where(eq(searchQueries.id, q.id));
      await finalizeJobIfDone(q.jobId);
      return;
    } catch (err) {
      lastErr = err;
      await recordUsage({ provider: integ.provider, operation: 'search', units: 1, success: false, durationMs: Date.now() - t0, jobId: q.jobId, error: errMsg(err) });
      await syslog('warn', 'search', `Falha no provedor ${integ.provider}; tentando próximo`, { queryId: q.id, error: errMsg(err) });
    }
  }
  const msg = errMsg(lastErr);
  const retryable = !(lastErr instanceof ConnectorHttpError) || lastErr.retryable;
  if (!retryable) {
    await failQuery(q, msg);
    return;
  }
  await db.update(searchQueries).set({ status: 'pending', error: msg }).where(eq(searchQueries.id, q.id));
  throw lastErr instanceof Error ? lastErr : new Error(msg);
}

export async function failQuery(q: Pick<SearchQuery, 'id' | 'jobId'>, error: string) {
  const [updated] = await db
    .update(searchQueries)
    .set({ status: 'failed', error: error.slice(0, 1000), finishedAt: new Date() })
    .where(and(eq(searchQueries.id, q.id), inArray(searchQueries.status, ['pending', 'running'])))
    .returning({ id: searchQueries.id });
  if (updated) {
    await db.update(searchJobs).set({ failedQueries: sql`${searchJobs.failedQueries} + 1`, error: error.slice(0, 1000) }).where(eq(searchJobs.id, q.jobId));
    await syslog('error', 'search', 'Consulta falhou', { queryId: q.id, error });
  }
  await finalizeJobIfDone(q.jobId);
}

async function storeHits(q: SearchQuery, connector: string, hits: Array<{ url: string; title: string; snippet: string; position: number }>) {
  const [job] = await db.select().from(searchJobs).where(eq(searchJobs.id, q.jobId));
  const [cat] = q.categoryId ? await db.select().from(categories).where(eq(categories.id, q.categoryId)) : [];
  let fresh = 0;
  let dup = 0;
  let irrelevant = 0;
  const toProcess: string[] = [];
  for (const h of hits) {
    const url = canonicalUrl(h.url);
    const domain = url ? domainOf(url) : null;
    if (!url || !domain) continue;
    const rel = job?.contextEventId ? { score: 60, relevant: true, reason: 'pesquisa complementar' } : scoreRelevance(h, cat ?? null, q.state);
    const [row] = await db
      .insert(searchResults)
      .values({
        queryId: q.id,
        jobId: q.jobId,
        connector,
        url,
        urlHash: urlHash(url),
        domain,
        title: h.title.slice(0, 500),
        snippet: h.snippet.slice(0, 2000),
        position: h.position,
        relevanceScore: rel.score,
        status: rel.relevant ? 'new' : 'irrelevant',
        discardReason: rel.relevant ? null : rel.reason,
        contextEventId: job?.contextEventId ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: searchResults.id });
    if (!row) {
      dup++;
      continue;
    }
    fresh++;
    if (rel.relevant) toProcess.push(row.id);
    else irrelevant++;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(searchQueries)
      .set({ status: 'done', finishedAt: new Date(), resultsCount: hits.length, newResultsCount: fresh, error: null })
      .where(eq(searchQueries.id, q.id));
    await tx
      .update(searchJobs)
      .set({
        completedQueries: sql`${searchJobs.completedQueries} + 1`,
        resultsFound: sql`${searchJobs.resultsFound} + ${hits.length}`,
        duplicates: sql`${searchJobs.duplicates} + ${dup}`,
        discarded: sql`${searchJobs.discarded} + ${irrelevant}`,
      })
      .where(eq(searchJobs.id, q.jobId));
  });
  for (const id of toProcess) await enqueue('process', { resultId: id, jobId: q.jobId }, { jobId: `r-${id}` });
}

async function countLeadsToday(tz: string): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from leads where discovered_at >= (date_trunc('day', now() at time zone ${tz}) at time zone ${tz})`);
  return r.rows[0]?.n ?? 0;
}

export class DailyLimitReachedError extends Error {}
export class AiNotConfiguredError extends Error {}

async function setResult(id: string, patch: Partial<typeof searchResults.$inferInsert>) {
  await db.update(searchResults).set(patch).where(eq(searchResults.id, id));
}

/** Processa um resultado: acessa a página, extrai contatos, analisa com IA, valida e persiste o lead. */
export async function processResult(resultId: string): Promise<{ outcome: string; leadId?: string | null }> {
  const [r] = await db.select().from(searchResults).where(eq(searchResults.id, resultId));
  if (!r || !['new', 'awaiting_ai', 'failed', 'processing'].includes(r.status)) return { outcome: 'skip' };
  if (r.jobId && !(await jobIsActive(r.jobId))) {
    await setResult(r.id, { status: 'cancelled' });
    return { outcome: 'cancelled' };
  }
  const settings = await getSettings();
  if (!r.contextEventId && (await countLeadsToday(settings.timezone)) >= settings.dailyLeadLimit) {
    throw new DailyLimitReachedError('Limite diário de leads atingido');
  }
  if (!(await isAiReady())) {
    await setResult(r.id, { status: 'awaiting_ai', discardReason: 'Integração de IA não configurada' });
    if (r.jobId) await finalizeJobIfDone(r.jobId);
    throw new AiNotConfiguredError('IA não configurada — resultado aguardando processamento');
  }
  await setResult(r.id, { status: 'processing', attempts: (r.attempts ?? 0) + 1 });
  if (r.jobId) await heartbeat(r.jobId);

  let page: ExtractedPage | null = null;
  let httpStatus: number | null = null;
  let contentHash: string | null = null;
  const isInstagram = r.domain.endsWith('instagram.com');
  if (!isInstagram) {
    try {
      const fetched = await fetchPage(r.url);
      httpStatus = fetched.status;
      if (fetched.status < 400 && fetched.html) {
        page = extractFromHtml(fetched.html, fetched.finalUrl);
        contentHash = createHash('sha256').update(page.text).digest('hex');
      }
    } catch (err) {
      if (err instanceof FetchBlockedError) {
        await syslog('info', 'crawler', 'Página não acessada (bloqueio/robots)', { url: r.url, reason: errMsg(err) });
      } else {
        await syslog('warn', 'crawler', 'Falha ao acessar página; usando dados do resultado de busca', { url: r.url, error: errMsg(err) });
      }
    }
  }
  const candidates = page ? page.contacts : extractFromSearchSnippet(r.url, r.title, r.snippet);
  const cats = await db.select({ slug: categories.slug, name: categories.name }).from(categories).where(eq(categories.isActive, true));
  const [ctxEvent] = r.contextEventId
    ? await db.select({ name: events.name, city: events.city, state: events.state, year: events.year }).from(events).where(eq(events.id, r.contextEventId))
    : [];
  const [q] = r.queryId ? await db.select().from(searchQueries).where(eq(searchQueries.id, r.queryId)) : [];

  const input = {
    url: r.url,
    title: r.title,
    snippet: r.snippet,
    page,
    candidates,
    categories: cats,
    contextEvent: ctxEvent ?? null,
    currentDate: new Date().toISOString().slice(0, 10),
  };
  const extraction = await runExtraction(input, r.jobId);
  const { grounded, model } = extraction;

  if (!grounded.accepted) {
    await setResult(r.id, { status: 'discarded', discardReason: grounded.reason?.slice(0, 500) ?? 'descartado pela IA', processedAt: new Date(), error: null });
    if (r.jobId) {
      await db.update(searchJobs).set({ discarded: sql`${searchJobs.discarded} + 1` }).where(eq(searchJobs.id, r.jobId));
      await finalizeJobIfDone(r.jobId);
    }
    return { outcome: 'discarded' };
  }

  let enrichedCompanyName: string | null = null;
  if (grounded.data.cnpj) {
    const info = await lookupCnpj(grounded.data.cnpj);
    enrichedCompanyName = info?.nomeFantasia || info?.razaoSocial || null;
  }

  const outcome = await persistDiscovery(grounded, {
    url: r.url,
    title: page?.title || r.title,
    snippet: r.snippet,
    searchResultId: r.id,
    fallbackCategoryId: q?.categoryId ?? null,
    contextEventId: r.contextEventId,
    campaignId: null,
    sourceType: classifySource(r.url),
    httpStatus,
    contentHash,
    enrichedCompanyName,
  });

  if (outcome.eventId) {
    await db.insert(aiAnalyses).values({
      leadId: outcome.leadId,
      eventId: outcome.eventId,
      searchResultId: r.id,
      type: 'extraction',
      model,
      facts: grounded.data.facts,
      hypotheses: grounded.data.hypotheses,
      output: { ...grounded.data, dropped: grounded.dropped },
      inputTokens: extraction.inputTokens,
      outputTokens: extraction.outputTokens,
      costUsd: extraction.costUsd.toFixed(6),
    });
  }

  const status = outcome.status === 'created' ? 'processed' : outcome.status === 'merged' ? 'duplicate' : 'discarded';
  await setResult(r.id, {
    status,
    eventId: outcome.eventId,
    processedAt: new Date(),
    error: null,
    discardReason: outcome.status === 'suppressed' ? 'Contato na lista de supressão' : grounded.dropped.length ? `Campos não verificados descartados: ${grounded.dropped.join(', ')}` : null,
  });
  if (r.jobId) {
    if (outcome.status === 'created') await db.update(searchJobs).set({ leadsCreated: sql`${searchJobs.leadsCreated} + 1` }).where(eq(searchJobs.id, r.jobId));
    else if (outcome.status === 'merged') await db.update(searchJobs).set({ duplicates: sql`${searchJobs.duplicates} + 1` }).where(eq(searchJobs.id, r.jobId));
    else await db.update(searchJobs).set({ discarded: sql`${searchJobs.discarded} + 1` }).where(eq(searchJobs.id, r.jobId));
  }

  if (outcome.leadId) {
    await enqueueAnalysis(outcome.leadId, r.jobId);
    // pesquisa progressiva: consultas sugeridas pela IA para aprofundar o evento recém-descoberto
    const depth = q?.depth ?? 0;
    if (outcome.status === 'created' && outcome.eventId && grounded.data.followup_queries.length && depth < settings.maxFollowupDepth) {
      await createSearchJob({
        type: 'followup',
        contextEventId: outcome.eventId,
        params: { reason: 'pesquisa progressiva', model, parentResultId: r.id },
        queries: grounded.data.followup_queries.slice(0, 3).map((query) => ({
          query,
          categoryId: q?.categoryId ?? null,
          state: grounded.data.event.state,
          origin: 'ai_followup' as const,
          depth: depth + 1,
          parentQueryId: q?.id ?? null,
        })),
      });
    }
  }
  if (r.jobId) await finalizeJobIfDone(r.jobId);
  return { outcome: outcome.status, leadId: outcome.leadId };
}

/** Debounce: várias fontes do mesmo evento geram uma única reanálise. */
export async function enqueueAnalysis(leadId: string, jobId?: string | null, delayMs = Number(process.env.ANALYSIS_DEBOUNCE_MS ?? 20_000)) {
  await enqueue('analyze', { leadId, jobId: jobId ?? null }, { delay: delayMs, deduplication: { id: `analyze-${leadId}`, ttl: delayMs } });
}

export async function markResultFailed(resultId: string, error: string) {
  const [r] = await db
    .update(searchResults)
    .set({ status: 'failed', error: error.slice(0, 1000) })
    .where(and(eq(searchResults.id, resultId), inArray(searchResults.status, ['new', 'processing'])))
    .returning({ jobId: searchResults.jobId });
  if (r?.jobId) await finalizeJobIfDone(r.jobId);
}
