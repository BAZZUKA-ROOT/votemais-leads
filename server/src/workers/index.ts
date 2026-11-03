import os from 'node:os';
import { DelayedError, UnrecoverableError, Worker, type Job, type Processor } from 'bullmq';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { closeDb, db } from '../db/client.js';
import { leads } from '../db/schema.js';
import { IntegrationUnavailableError } from '../lib/errors.js';
import { errMsg, log, syslog } from '../lib/logger.js';
import { closeRedis, newRedisConnection, redis } from '../queue/connection.js';
import { closeQueues, type JobPayloads, type QueueName } from '../queue/queues.js';
import { AiRefusalError } from '../ai/client.js';
import { analyzeLead, generateMessage } from '../services/analysis.js';
import { ensureIntegrationRows } from '../services/integrations.js';
import { applyRetention, processDueFollowUps, refreshEvents, resumeStaleJobs } from '../services/maintenance.js';
import { planRun } from '../services/planner.js';
import { syncSchedules } from '../services/scheduler.js';
import {
  AiNotConfiguredError,
  DailyLimitReachedError,
  executeQuery,
  failQuery,
  markResultFailed,
  NoSearchProviderError,
  processResult,
} from '../services/search-runner.js';
import { getSettings } from '../services/settings.js';

function msUntilNextDay(tz: string): number {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const next = new Date(local);
  next.setHours(24, 5, 0, 0);
  return Math.max(60_000, next.getTime() - local.getTime());
}

const processors: { [N in QueueName]: Processor<JobPayloads[N]> } = {
  plan: async (job) => planRun(job.data),

  search: async (job) => {
    try {
      await executeQuery(job.data.queryId);
    } catch (err) {
      if (err instanceof NoSearchProviderError) throw new UnrecoverableError(err.message);
      throw err;
    }
  },

  process: async (job, token) => {
    try {
      return await processResult(job.data.resultId);
    } catch (err) {
      if (err instanceof DailyLimitReachedError) {
        const s = await getSettings();
        await job.moveToDelayed(Date.now() + msUntilNextDay(s.timezone), token);
        throw new DelayedError();
      }
      if (err instanceof AiNotConfiguredError || err instanceof IntegrationUnavailableError || err instanceof AiRefusalError) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
  },

  analyze: async (job) => {
    try {
      return await analyzeLead(job.data.leadId, job.data.jobId ?? null);
    } catch (err) {
      if (err instanceof IntegrationUnavailableError || err instanceof AiRefusalError) throw new UnrecoverableError(err.message);
      throw err;
    }
  },

  message: async (job) => {
    try {
      const m = await generateMessage(job.data.leadId, job.data.kind, job.data.followUpId ?? null);
      return { messageId: m.id };
    } catch (err) {
      if (err instanceof IntegrationUnavailableError || err instanceof AiRefusalError) throw new UnrecoverableError(err.message);
      throw err;
    }
  },

  maintenance: async (job) => {
    switch (job.data.task) {
      case 'refresh':
        return refreshEvents();
      case 'retention':
        return applyRetention();
      case 'resume':
        return resumeStaleJobs();
      case 'followups_due':
        return processDueFollowUps();
      case 'sync_schedules':
        return syncSchedules();
    }
  },
};

/** Ações quando uma tarefa esgota as tentativas. */
async function onFinalFailure(name: QueueName, job: Job, err: Error) {
  const msg = errMsg(err);
  if (name === 'search') {
    const d = job.data as JobPayloads['search'];
    await failQuery({ id: d.queryId, jobId: d.jobId }, msg);
  } else if (name === 'process') {
    const d = job.data as JobPayloads['process'];
    if (!(err instanceof UnrecoverableError && /IA não configurada/.test(msg))) await markResultFailed(d.resultId, msg);
  } else if (name === 'analyze') {
    const d = job.data as JobPayloads['analyze'];
    await db.update(leads).set({ qualification: 'analysis_failed' }).where(eq(leads.id, d.leadId));
  }
  await syslog('error', `worker:${name}`, `Tarefa falhou definitivamente: ${msg}`, { jobId: job.id, data: job.data as Record<string, unknown> });
}

export async function startWorkers() {
  await ensureIntegrationRows();
  const settings = await getSettings();
  const concurrency: Record<QueueName, number> = {
    plan: 1,
    search: settings.concurrency,
    process: settings.concurrency,
    analyze: Math.max(1, Math.ceil(settings.concurrency / 2)),
    message: 2,
    maintenance: 1,
  };
  const workers = (Object.keys(processors) as QueueName[]).map((name) => {
    const w = new Worker(name, processors[name] as Processor, {
      connection: newRedisConnection(),
      prefix: env.QUEUE_PREFIX,
      concurrency: concurrency[name],
      // rate limit global de chamadas de busca (proteção de cota)
      ...(name === 'search' ? { limiter: { max: 30, duration: 60_000 } } : {}),
      lockDuration: name === 'process' || name === 'maintenance' ? 300_000 : 120_000,
    });
    w.on('failed', (job, err) => {
      if (!job) return;
      const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
      if (final) void onFinalFailure(name, job, err);
      else log.warn({ queue: name, jobId: job.id, err: err.message }, 'tarefa falhou; nova tentativa com backoff');
    });
    w.on('error', (err) => log.error({ queue: name, err }, 'erro no worker'));
    return { name, w };
  });

  await syncSchedules();
  await resumeStaleJobs(2);

  const beat = async () => {
    await redis().set('vml:worker:heartbeat', JSON.stringify({ at: Date.now(), pid: process.pid, host: os.hostname() }), 'EX', 300);
  };
  await beat();
  const hb = setInterval(() => void beat().catch(() => undefined), 30_000);
  const poll = setInterval(async () => {
    try {
      const s = await getSettings();
      for (const { name, w } of workers) {
        if (name === 'search' || name === 'process') w.concurrency = s.concurrency;
        if (name === 'analyze') w.concurrency = Math.max(1, Math.ceil(s.concurrency / 2));
      }
    } catch (err) {
      log.warn({ err }, 'falha ao recarregar configurações');
    }
  }, 60_000);

  await syslog('info', 'worker', `Workers iniciados (concorrência ${settings.concurrency})`, { host: os.hostname() });

  return async () => {
    clearInterval(hb);
    clearInterval(poll);
    await Promise.all(workers.map(({ w }) => w.close()));
  };
}

