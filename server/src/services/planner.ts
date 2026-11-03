import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { automationSettings, categories } from '../db/schema.js';
import { syslog } from '../lib/logger.js';
import { UFS } from '../lib/regions.js';
import type { JobPayloads } from '../queue/queues.js';
import { buildQueries, type PlannedQuery } from '../search/query-builder.js';
import { createSearchJob, orderedSearchProviders } from './search-runner.js';
import { getSettings } from './settings.js';

export interface PlanResult {
  status: 'created' | 'skipped';
  reason?: string;
  jobId?: string;
  queries?: number;
}

function rotate<T>(arr: T[], start: number, n: number): T[] {
  if (!arr.length) return [];
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, arr.length); i++) out.push(arr[(start + i) % arr.length]!);
  return out;
}

async function todayCounts(tz: string) {
  const r = await db.execute<{ leads: number; qualified: number }>(sql`
    select count(*)::int as leads,
           count(*) filter (where qualification = 'qualified')::int as qualified
    from leads where discovered_at >= (date_trunc('day', now() at time zone ${tz}) at time zone ${tz})`);
  return r.rows[0] ?? { leads: 0, qualified: 0 };
}

/** Planeja uma rodada de pesquisa alternando categorias e estados. */
export async function planRun(payload: JobPayloads['plan']): Promise<PlanResult> {
  const settings = await getSettings();
  const skip = async (reason: string): Promise<PlanResult> => {
    await syslog('info', 'planner', `Rodada não iniciada: ${reason}`, { trigger: payload.trigger });
    return { status: 'skipped', reason };
  };
  if (payload.trigger === 'schedule') {
    if (!settings.enabled) return skip('automação desativada');
    if (settings.paused) return skip('automação pausada');
  }
  const counts = await todayCounts(settings.timezone);
  if (counts.leads >= settings.dailyLeadLimit) return skip(`limite diário de leads atingido (${counts.leads}/${settings.dailyLeadLimit})`);
  if (payload.trigger === 'schedule' && counts.qualified >= settings.dailyQualifiedTarget) {
    return skip(`meta diária de qualificados atingida (${counts.qualified}/${settings.dailyQualifiedTarget})`);
  }
  if (!(await orderedSearchProviders()).length) {
    await syslog('error', 'planner', 'Nenhum provedor de pesquisa configurado — configure em Integrações');
    return { status: 'skipped', reason: 'nenhum provedor de pesquisa configurado' };
  }

  const allCats = payload.categoryIds?.length
    ? await db.select().from(categories).where(and(inArray(categories.id, payload.categoryIds), eq(categories.isActive, true)))
    : await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(desc(categories.priority), asc(categories.id));
  if (!allCats.length) return skip('nenhuma categoria ativa');
  const states = payload.states?.length ? payload.states.filter((s) => (UFS as string[]).includes(s)) : (UFS as string[]);
  if (!states.length) return skip('nenhum estado válido');

  const manual = Boolean(payload.categoryIds?.length || payload.states?.length);
  const cats = manual ? allCats.slice(0, settings.categoriesPerRun * 3) : rotate(allCats, settings.categoryCursor, settings.categoriesPerRun);
  const sts = manual ? states : rotate(states, settings.stateCursor, settings.statesPerRun);
  const maxQueries = Math.min(payload.maxQueries ?? settings.queriesPerRun, 500);
  const perPair = Math.max(1, Math.ceil(maxQueries / (cats.length * sts.length)));

  const planned: PlannedQuery[] = [];
  for (const st of sts) for (const c of cats) planned.push(...buildQueries(c, st, new Date(), perPair));
  // intercala pares para não esgotar o limite em uma única categoria
  const queries = planned
    .map((q, i) => ({ q, k: (i % perPair) * 1000 + Math.floor(i / perPair) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.q)
    .slice(0, maxQueries);

  if (!manual) {
    await db
      .update(automationSettings)
      .set({
        categoryCursor: (settings.categoryCursor + cats.length) % allCats.length,
        stateCursor: (settings.stateCursor + sts.length) % states.length,
      })
      .where(eq(automationSettings.id, 1));
  }

  const job = await createSearchJob({
    type: payload.trigger === 'schedule' ? 'scheduled' : 'manual',
    triggeredBy: payload.userId ?? null,
    campaignId: payload.campaignId ?? null,
    params: { categories: cats.map((c) => c.slug), states: sts, maxQueries },
    queries: queries.map((q) => ({ ...q, origin: payload.trigger === 'manual' ? ('manual' as const) : ('template' as const) })),
  });
  if (!job) return skip('nenhuma consulta gerada');
  return { status: 'created', jobId: job.id, queries: job.totalQueries };
}
