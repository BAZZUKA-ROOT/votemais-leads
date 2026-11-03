import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { generatedMessages, leads, searchJobs, searchQueries, systemLogs } from '../src/db/schema.js';
import { enqueue, getQueue } from '../src/queue/queues.js';
import { planRun } from '../src/services/planner.js';
import { resumeStaleJobs } from '../src/services/maintenance.js';
import { cronFor, syncSchedules } from '../src/services/scheduler.js';
import { createSearchJob } from '../src/services/search-runner.js';
import { updateSettings } from '../src/services/settings.js';
import { startWorkers } from '../src/workers/index.js';
import { login } from './api-client.js';
import { classificationOk, createAdmin, EVENT_PAGE, EVENT_URL, extractionFor, messageOk, resetDb, useStubAi, useStubPages, useStubSearch, waitFor } from './helpers.js';

const HIT = { url: EVENT_URL, title: 'Rainha da Expo Goiânia 2027 — inscrições abertas', snippet: 'Concurso Rainha da Expo Goiânia 2027 em Goiás', position: 1 };

describe('automações e agendamento', () => {
  beforeEach(async () => {
    await resetDb();
    await createAdmin();
  });

  it('valida e persiste configurações; sincroniza agendamentos', async () => {
    const c = await login();
    expect((await c.send('PUT', '/api/automation/settings', { runTimes: ['25:00'] })).status).toBe(400);
    expect((await c.send('PUT', '/api/automation/settings', { concurrency: 0 })).status).toBe(400);
    expect((await c.send('PUT', '/api/automation/settings', { unknownField: 1 })).status).toBe(400);
    const r = await c.send('PUT', '/api/automation/settings', { runTimes: ['07:30', '15:00'], daysOfWeek: [1, 3, 5], dailyLeadLimit: 40 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ runTimes: ['07:30', '15:00'], daysOfWeek: [1, 3, 5], dailyLeadLimit: 40 });
    const schedulers = await getQueue('plan').getJobSchedulers(0, -1);
    expect(schedulers.map((s) => s.pattern).sort()).toEqual(['0 15 * * 1,3,5', '30 7 * * 1,3,5']);
    expect(schedulers.every((s) => s.tz === 'America/Sao_Paulo')).toBe(true);
    await c.send('PUT', '/api/automation/settings', { enabled: false });
    expect(await getQueue('plan').getJobSchedulers(0, -1)).toHaveLength(0);
    expect(cronFor('06:05', [6, 1])).toBe('5 6 * * 1,6');
  });

  it('planner respeita pausa, ausência de provedores e limite diário', async () => {
    await updateSettings({ paused: true });
    expect(await planRun({ trigger: 'schedule' })).toMatchObject({ status: 'skipped', reason: 'automação pausada' });
    await updateSettings({ paused: false });
    expect(await planRun({ trigger: 'schedule' })).toMatchObject({ status: 'skipped', reason: 'nenhum provedor de pesquisa configurado' });
    await useStubSearch(() => []);
    const res = await planRun({ trigger: 'schedule' });
    expect(res.status).toBe('created');
    const [job] = await db.select().from(searchJobs);
    const qs = await db.select().from(searchQueries).where(eq(searchQueries.jobId, job!.id));
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.length).toBeLessThanOrEqual(30);
    const states = new Set(qs.map((q) => q.state));
    expect(states.size).toBe(3); // statesPerRun
    // cursor avança: próxima rodada usa outros estados
    await planRun({ trigger: 'schedule' });
    const jobs = await db.select().from(searchJobs);
    const qs2 = await db.select().from(searchQueries).where(eq(searchQueries.jobId, jobs.find((j) => j.id !== job!.id)!.id));
    expect([...new Set(qs2.map((q) => q.state))].some((s) => !states.has(s))).toBe(true);
    await updateSettings({ dailyLeadLimit: 1 });
    await db.execute(`insert into events (name, normalized_name, fingerprint) values ('x','x','fp')` as never);
    const [ev] = (await db.execute(`select id from events limit 1` as never)).rows as Array<{ id: string }>;
    await db.insert(leads).values({ eventId: ev!.id });
    expect((await planRun({ trigger: 'schedule' })).reason).toMatch(/limite diário/);
    const logs = await db.select().from(systemLogs).where(eq(systemLogs.scope, 'planner'));
    expect(logs.length).toBeGreaterThan(0);
  });

  it('retoma pesquisas interrompidas', async () => {
    await useStubSearch(() => []);
    const job = await createSearchJob({ type: 'manual', queries: [{ query: 'consulta interrompida', origin: 'manual' }] });
    await getQueue('search').obliterate({ force: true });
    await db.update(searchJobs).set({ status: 'running', heartbeatAt: new Date(Date.now() - 3600_000), createdAt: new Date(Date.now() - 3600_000) }).where(eq(searchJobs.id, job!.id));
    const r = await resumeStaleJobs(15);
    expect(r).toMatchObject({ jobs: 1, requeued: 1 });
    expect(await getQueue('search').count()).toBe(1);
  });
});

describe('processamento em filas (workers reais BullMQ + Redis)', () => {
  let stop: (() => Promise<void>) | null = null;
  afterAll(async () => {
    if (stop) await stop();
  });

  it('pesquisa manual percorre plan → search → process → analyze → message', async () => {
    await resetDb();
    await createAdmin();
    await updateSettings({ maxFollowupDepth: 0 });
    await useStubSearch(() => [HIT]);
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    useStubAi({ extraction: extractionFor(), classification: classificationOk(85), message: messageOk });
    stop = await startWorkers();
    await enqueue('plan', { trigger: 'manual', categoryIds: [12], states: ['GO'], maxQueries: 2 });
    const lead = await waitFor(async () => {
      const [l] = await db.select().from(leads);
      return l?.qualification === 'qualified' ? l : null;
    }, 30_000);
    expect(lead.stage).toBe('qualificado');
    const msg = await waitFor(async () => (await db.select().from(generatedMessages))[0], 20_000);
    expect(msg.content).toContain('votemais.online');
    const job = await waitFor(async () => {
      const [j] = await db.select().from(searchJobs).where(eq(searchJobs.type, 'manual'));
      return j?.status === 'completed' ? j : null;
    });
    expect(job.leadsCreated).toBe(1);

    // pausa e retomada pela central
    const c = await login();
    expect((await c.send('POST', '/api/automation/pause')).body.paused).toBe(true);
    expect(await getQueue('search').isPaused()).toBe(true);
    expect((await c.send('POST', '/api/automation/resume')).body.paused).toBe(false);
    const queues = await c.get('/api/automation/queues');
    expect(queues.body.map((q: any) => q.name)).toEqual(['plan', 'search', 'process', 'analyze', 'message', 'maintenance']);
    const control = await c.get('/api/control');
    expect(control.body.jobs.leadsApproved).toBe(1);
    expect(control.body.usage.searchCalls).toBeGreaterThan(0);
  }, 60_000);

  it('cancelar pesquisa interrompe consultas pendentes e permite reexecutar falhas', async () => {
    const c = await login();
    await useStubSearch(() => []);
    await getQueue('search').pause();
    const job = await createSearchJob({ type: 'manual', queries: [{ query: 'a cancelar 1', origin: 'manual' }, { query: 'a cancelar 2', origin: 'manual' }] });
    expect((await c.send('POST', `/api/search/jobs/${job!.id}/cancel`)).status).toBe(200);
    await getQueue('search').resume();
    const qs = await db.select().from(searchQueries).where(eq(searchQueries.jobId, job!.id));
    expect(qs.every((q) => q.status === 'cancelled')).toBe(true);
    const retry = await c.send('POST', `/api/search/jobs/${job!.id}/retry`);
    expect(retry.body.queries).toBe(2);
    await waitFor(async () => {
      const [j] = await db.select().from(searchJobs).where(eq(searchJobs.id, job!.id));
      return j?.status === 'completed';
    });
  }, 30_000);
});
