import { and, desc, eq, gte, ilike, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idParam, parse, requireAdmin, userId } from '../api/plugins.js';
import { isAiReady, testAnthropic } from '../ai/client.js';
import { db, pool } from '../db/client.js';
import { searchJobs, searchQueries, searchResults, suppressionList, systemLogs, users } from '../db/schema.js';
import { badRequest, IntegrationUnavailableError, notFound } from '../lib/errors.js';
import { audit, errMsg } from '../lib/logger.js';
import { UFS } from '../lib/regions.js';
import { redis } from '../queue/connection.js';
import { ALL_QUEUES, enqueue, getQueue, type QueueName } from '../queue/queues.js';
import { getConnector } from '../search/connectors/registry.js';
import { createUser } from '../services/auth.js';
import {
  getIntegration,
  listIntegrations,
  providerDef,
  saveIntegration,
  saveIntegrationSchema,
  setIntegrationHealth,
  type ProviderId,
} from '../services/integrations.js';
import { addSuppression, erasePersonalData } from '../services/privacy.js';
import { createSearchJob, finalizeJobIfDone } from '../services/search-runner.js';
import { listSchedules, syncSchedules } from '../services/scheduler.js';
import { getSettings, settingsUpdateSchema, updateSettings } from '../services/settings.js';

const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(30) };

async function testProvider(provider: ProviderId) {
  const def = providerDef(provider);
  if (!def) throw notFound('Integração');
  const integ = await getIntegration(provider);
  if (integ.missing.length) throw new IntegrationUnavailableError(provider, `Configuração pendente: ${integ.missing.join(', ')}`);
  try {
    if (def.kind === 'search') {
      const c = getConnector(provider);
      if (!c) throw new Error('Conector não registrado');
      await c.search('concurso rainha do rodeio', { count: 3, integration: { ...integ, ready: true } });
    } else if (provider === 'anthropic') {
      await testAnthropic();
    } else if (provider === 'brasilapi') {
      const res = await fetch(`${String(integ.config.baseUrl ?? 'https://brasilapi.com.br')}/api/cnpj/v1/00000000000191`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } else if (provider === 'n8n') {
      const res = await fetch(String(integ.config.webhookUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(integ.credentials.token ? { 'x-vml-token': integ.credentials.token } : {}) },
        body: JSON.stringify({ event: 'test', at: new Date().toISOString() }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }
    await setIntegrationHealth(provider, true);
    return { ok: true };
  } catch (err) {
    await setIntegrationHealth(provider, false, errMsg(err));
    return { ok: false, error: errMsg(err) };
  }
}

export async function systemHealth() {
  const out: Record<string, { ok: boolean; detail?: string }> = {};
  try {
    await pool.query('select 1');
    out.database = { ok: true };
  } catch (err) {
    out.database = { ok: false, detail: errMsg(err) };
  }
  try {
    out.redis = { ok: (await redis().ping()) === 'PONG' };
  } catch (err) {
    out.redis = { ok: false, detail: errMsg(err) };
  }
  try {
    const hb = await redis().get('vml:worker:heartbeat');
    const parsed = hb ? (JSON.parse(hb) as { at: number; pid: number; host: string }) : null;
    const fresh = parsed ? Date.now() - parsed.at < 90_000 : false;
    out.worker = { ok: fresh, detail: parsed ? `último sinal ${new Date(parsed.at).toISOString()} (${parsed.host})` : 'worker nunca reportou atividade' };
  } catch (err) {
    out.worker = { ok: false, detail: errMsg(err) };
  }
  out.ai = { ok: await isAiReady(), detail: (await isAiReady()) ? undefined : 'Integração Anthropic pendente' };
  return out;
}

export async function operationsRoutes(app: FastifyInstance) {
  // ---------- pesquisas ----------
  app.get('/api/search/jobs', async (req) => {
    const q = parse(z.object({ status: z.string().optional(), type: z.string().optional(), ...page }), req.query);
    const where = and(q.status ? eq(searchJobs.status, q.status as never) : undefined, q.type ? eq(searchJobs.type, q.type as never) : undefined);
    const items = await db.select().from(searchJobs).where(where).orderBy(desc(searchJobs.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
    const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(searchJobs).where(where);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get('/api/search/jobs/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const [job] = await db.select().from(searchJobs).where(eq(searchJobs.id, id));
    if (!job) throw notFound('Pesquisa');
    const queries = await db.select().from(searchQueries).where(eq(searchQueries.jobId, id)).orderBy(searchQueries.createdAt);
    const results = await db
      .select({
        id: searchResults.id,
        url: searchResults.url,
        title: searchResults.title,
        domain: searchResults.domain,
        connector: searchResults.connector,
        status: searchResults.status,
        relevanceScore: searchResults.relevanceScore,
        discardReason: searchResults.discardReason,
        error: searchResults.error,
        eventId: searchResults.eventId,
        queryId: searchResults.queryId,
      })
      .from(searchResults)
      .where(eq(searchResults.jobId, id))
      .orderBy(desc(searchResults.relevanceScore))
      .limit(500);
    return { job, queries, results };
  });

  app.post('/api/search/run', async (req) => {
    const body = parse(
      z.object({
        categoryIds: z.array(z.number().int()).max(50).optional(),
        states: z.array(z.enum(UFS as [string, ...string[]])).max(27).optional(),
        maxQueries: z.number().int().min(1).max(200).optional(),
        customQueries: z.array(z.string().min(3).max(300)).max(50).optional(),
        campaignId: z.number().int().nullable().optional(),
      }),
      req.body,
    );
    if (body.customQueries?.length) {
      const job = await createSearchJob({
        type: 'manual',
        triggeredBy: userId(req),
        campaignId: body.campaignId ?? null,
        params: { custom: true },
        queries: body.customQueries.map((query) => ({ query, origin: 'manual' as const, categoryId: body.categoryIds?.[0] ?? null, state: body.states?.[0] ?? null })),
      });
      return { status: 'created', jobId: job?.id };
    }
    await enqueue('plan', { trigger: 'manual', userId: userId(req), categoryIds: body.categoryIds, states: body.states, maxQueries: body.maxQueries, campaignId: body.campaignId ?? null });
    return { status: 'queued' };
  });

  app.post('/api/search/jobs/:id/cancel', async (req) => {
    const { id } = parse(idParam, req.params);
    const [job] = await db
      .update(searchJobs)
      .set({ status: 'cancelled', finishedAt: new Date() })
      .where(and(eq(searchJobs.id, id), inArray(searchJobs.status, ['queued', 'running'])))
      .returning();
    if (!job) throw badRequest('Pesquisa não está em andamento');
    await db.update(searchQueries).set({ status: 'cancelled' }).where(and(eq(searchQueries.jobId, id), eq(searchQueries.status, 'pending')));
    await db.update(searchResults).set({ status: 'cancelled' }).where(and(eq(searchResults.jobId, id), eq(searchResults.status, 'new')));
    for (const name of ['search', 'process'] as const) {
      const waiting = await getQueue(name).getJobs(['waiting', 'delayed', 'prioritized']);
      for (const j of waiting) if (j.data.jobId === id) await j.remove().catch(() => undefined);
    }
    await audit('Pesquisa cancelada', { jobId: id }, { userId: userId(req), ip: req.ip });
    return { ok: true };
  });

  app.post('/api/search/jobs/:id/retry', async (req) => {
    const { id } = parse(idParam, req.params);
    const [job] = await db.select().from(searchJobs).where(eq(searchJobs.id, id));
    if (!job) throw notFound('Pesquisa');
    const failedQ = await db.select({ id: searchQueries.id }).from(searchQueries).where(and(eq(searchQueries.jobId, id), inArray(searchQueries.status, ['failed', 'cancelled'])));
    const failedR = await db.select({ id: searchResults.id }).from(searchResults).where(and(eq(searchResults.jobId, id), inArray(searchResults.status, ['failed', 'awaiting_ai', 'cancelled'])));
    if (!failedQ.length && !failedR.length) throw badRequest('Nada a reexecutar nesta pesquisa');
    await db
      .update(searchJobs)
      .set({ status: 'running', finishedAt: null, error: null, failedQueries: sql`greatest(${searchJobs.failedQueries} - ${failedQ.length}, 0)`, heartbeatAt: new Date() })
      .where(eq(searchJobs.id, id));
    const stamp = Date.now();
    for (const q of failedQ) {
      await db.update(searchQueries).set({ status: 'pending', error: null }).where(eq(searchQueries.id, q.id));
      await enqueue('search', { queryId: q.id, jobId: id }, { jobId: `q-${q.id}-retry-${stamp}` });
    }
    for (const r of failedR) {
      await db.update(searchResults).set({ status: 'new', error: null }).where(eq(searchResults.id, r.id));
      await enqueue('process', { resultId: r.id, jobId: id }, { jobId: `r-${r.id}-retry-${stamp}` });
    }
    return { queries: failedQ.length, results: failedR.length };
  });

  app.get('/api/search/results', async (req) => {
    const q = parse(z.object({ status: z.string().optional(), q: z.string().max(200).optional(), ...page }), req.query);
    const where = and(q.status ? eq(searchResults.status, q.status as never) : undefined, q.q ? ilike(searchResults.title, `%${q.q}%`) : undefined);
    const items = await db.select().from(searchResults).where(where).orderBy(desc(searchResults.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
    const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(searchResults).where(where);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.post('/api/search/results/reprocess', async (req) => {
    const body = parse(z.object({ status: z.enum(['awaiting_ai', 'failed']).default('awaiting_ai'), limit: z.number().int().min(1).max(1000).default(200) }), req.body ?? {});
    if (!(await isAiReady())) throw new IntegrationUnavailableError('anthropic', 'Configure a IA antes de reprocessar.');
    const rows = await db.select({ id: searchResults.id, jobId: searchResults.jobId }).from(searchResults).where(eq(searchResults.status, body.status)).limit(body.limit);
    const stamp = Date.now();
    for (const r of rows) {
      await db.update(searchResults).set({ status: 'new' }).where(eq(searchResults.id, r.id));
      if (r.jobId) await db.update(searchJobs).set({ status: 'running', finishedAt: null }).where(and(eq(searchJobs.id, r.jobId), inArray(searchJobs.status, ['completed', 'failed'])));
      await enqueue('process', { resultId: r.id, jobId: r.jobId }, { jobId: `r-${r.id}-re-${stamp}` });
    }
    return { requeued: rows.length };
  });

  // ---------- automação ----------
  app.get('/api/automation/settings', async () => getSettings());
  app.put('/api/automation/settings', async (req) => {
    const body = parse(settingsUpdateSchema, req.body);
    let row;
    try {
      row = await updateSettings(body);
    } catch (err) {
      throw badRequest(errMsg(err));
    }
    await syncSchedules();
    await audit('Configurações de automação alteradas', { fields: Object.keys(body) }, { userId: userId(req), ip: req.ip });
    return row;
  });
  app.post('/api/automation/pause', async (req) => {
    await updateSettings({ paused: true });
    for (const n of ALL_QUEUES) if (n !== 'maintenance') await getQueue(n).pause();
    await audit('Automações pausadas', {}, { userId: userId(req), ip: req.ip });
    return { paused: true };
  });
  app.post('/api/automation/resume', async (req) => {
    await updateSettings({ paused: false });
    for (const n of ALL_QUEUES) await getQueue(n).resume();
    await audit('Automações retomadas', {}, { userId: userId(req), ip: req.ip });
    return { paused: false };
  });
  app.post('/api/automation/run-now', async (req) => {
    await enqueue('plan', { trigger: 'manual', userId: userId(req) });
    return { status: 'queued' };
  });
  app.post('/api/automation/tasks/:task', async (req) => {
    const { task } = parse(z.object({ task: z.enum(['refresh', 'retention', 'resume', 'followups_due']) }), req.params);
    await enqueue('maintenance', { task });
    return { status: 'queued' };
  });
  app.get('/api/automation/queues', async () => {
    const out = [];
    for (const n of ALL_QUEUES) {
      const q = getQueue(n);
      const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused', 'prioritized');
      out.push({ name: n, paused: await q.isPaused(), counts });
    }
    return out;
  });
  app.get('/api/automation/failed-jobs', async (req) => {
    const q = parse(z.object({ queue: z.enum(ALL_QUEUES as [string, ...string[]]) }), req.query);
    const jobs = await getQueue(q.queue as QueueName).getFailed(0, 50);
    return jobs.map((j) => ({ id: j.id, name: j.name, data: j.data, failedReason: j.failedReason, attemptsMade: j.attemptsMade, finishedOn: j.finishedOn }));
  });
  app.post('/api/automation/failed-jobs/retry', async (req) => {
    const body = parse(z.object({ queue: z.enum(ALL_QUEUES as [string, ...string[]]), jobId: z.string().optional() }), req.body);
    const q = getQueue(body.queue as QueueName);
    if (body.jobId) {
      const job = await q.getJob(body.jobId);
      if (!job) throw notFound('Tarefa');
      await job.retry();
      return { retried: 1 };
    }
    const failed = await q.getFailed(0, 500);
    for (const j of failed) await j.retry().catch(() => undefined);
    return { retried: failed.length };
  });
  app.get('/api/automation/schedules', async () => listSchedules());

  // ---------- integrações ----------
  app.get('/api/integrations', async () => {
    const list = await listIntegrations();
    return { integrations: list, system: await systemHealth() };
  });
  app.put('/api/integrations/:provider', async (req) => {
    requireAdmin(req);
    const { provider } = parse(z.object({ provider: z.string().max(32) }), req.params);
    const body = parse(saveIntegrationSchema, req.body);
    await saveIntegration(provider, body);
    await audit('Integração atualizada', { provider, enabled: body.enabled, fields: [...Object.keys(body.config ?? {}), ...Object.keys(body.credentials ?? {})] }, { userId: userId(req), ip: req.ip });
    if (body.enabled !== false && (await getIntegration(provider as ProviderId)).ready) return testProvider(provider as ProviderId);
    return { ok: true };
  });
  app.post('/api/integrations/:provider/test', async (req) => {
    const { provider } = parse(z.object({ provider: z.string().max(32) }), req.params);
    return testProvider(provider as ProviderId);
  });
  app.get('/api/health/system', async () => systemHealth());

  // ---------- logs ----------
  app.get('/api/logs', async (req) => {
    const q = parse(
      z.object({ level: z.string().optional(), scope: z.string().max(40).optional(), q: z.string().max(200).optional(), since: z.string().optional(), ...page, pageSize: z.coerce.number().int().min(1).max(500).default(100) }),
      req.query,
    );
    const where = and(
      q.level ? inArray(systemLogs.level, q.level.split(',') as never) : undefined,
      q.scope ? eq(systemLogs.scope, q.scope) : undefined,
      q.q ? ilike(systemLogs.message, `%${q.q}%`) : undefined,
      q.since ? gte(systemLogs.createdAt, new Date(q.since)) : undefined,
    );
    const items = await db.select().from(systemLogs).where(where).orderBy(desc(systemLogs.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
    const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(systemLogs).where(where);
    const scopes = await db.selectDistinct({ scope: systemLogs.scope }).from(systemLogs).limit(100);
    return { items, total, page: q.page, pageSize: q.pageSize, scopes: scopes.map((s) => s.scope) };
  });

  // ---------- LGPD / supressão ----------
  const supType = z.enum(['phone', 'email', 'instagram', 'domain']);
  app.get('/api/suppression', async () => db.select().from(suppressionList).orderBy(desc(suppressionList.createdAt)).limit(2000));
  app.post('/api/suppression', async (req) => {
    const body = parse(z.object({ type: supType, value: z.string().min(3).max(300), reason: z.string().max(500).nullable().optional() }), req.body);
    const row = await addSuppression(body.type, body.value, body.reason ?? null, userId(req));
    if (!row) throw badRequest('Valor inválido para o tipo informado');
    await audit('Contato adicionado à lista de supressão', { type: body.type }, { userId: userId(req), ip: req.ip });
    return row;
  });
  app.delete('/api/suppression/:id', async (req) => {
    requireAdmin(req);
    const { id } = parse(z.object({ id: z.coerce.number().int() }), req.params);
    await db.delete(suppressionList).where(eq(suppressionList.id, id));
    await audit('Contato removido da lista de supressão', { id }, { userId: userId(req), ip: req.ip });
    return { ok: true };
  });
  app.post('/api/privacy/erase', async (req) => {
    requireAdmin(req);
    const body = parse(z.object({ type: supType, value: z.string().min(3).max(300) }), req.body);
    const res = await erasePersonalData(body.type, body.value, userId(req));
    await audit('Exclusão de dados pessoais (LGPD)', { type: body.type, removed: res.removed }, { userId: userId(req), ip: req.ip });
    return res;
  });

  // ---------- usuários ----------
  app.get('/api/users', async (req) => {
    requireAdmin(req);
    return db.select({ id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt }).from(users);
  });
  app.post('/api/users', async (req) => {
    requireAdmin(req);
    const body = parse(z.object({ email: z.string().email(), name: z.string().min(2).max(120), password: z.string().min(12).max(200), role: z.enum(['admin', 'operator']).default('operator') }), req.body);
    try {
      const u = await createUser(body);
      await audit('Usuário criado', { email: u.email }, { userId: userId(req), ip: req.ip });
      return u;
    } catch (err) {
      throw badRequest(errMsg(err).includes('users_email_uq') ? 'E-mail já cadastrado' : errMsg(err));
    }
  });
  app.patch('/api/users/:id', async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ isActive: z.boolean().optional(), role: z.enum(['admin', 'operator']).optional(), name: z.string().min(2).max(120).optional() }), req.body);
    if (id === userId(req) && (body.isActive === false || body.role === 'operator')) throw badRequest('Você não pode remover seu próprio acesso de administrador');
    const [row] = await db.update(users).set(body).where(eq(users.id, id)).returning({ id: users.id });
    if (!row) throw notFound('Usuário');
    return { ok: true };
  });

  app.post('/api/system/finalize-jobs', async () => {
    const running = await db.select({ id: searchJobs.id }).from(searchJobs).where(inArray(searchJobs.status, ['queued', 'running']));
    for (const j of running) await finalizeJobIfDone(j.id);
    return { checked: running.length };
  });
}
