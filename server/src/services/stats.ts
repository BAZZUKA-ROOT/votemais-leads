import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { getSettings } from './settings.js';

async function rows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  const r = await db.execute(q);
  return r.rows as T[];
}

export async function dashboardStats() {
  const { timezone: tz } = await getSettings();
  const dayStart = sql`(date_trunc('day', now() at time zone ${tz}) at time zone ${tz})`;
  const weekStart = sql`(date_trunc('week', now() at time zone ${tz}) at time zone ${tz})`;
  const [k] = await rows<Record<string, number>>(sql`
    select
      (select count(*) from leads where not is_suppressed)::int as "totalLeads",
      (select count(*) from leads where discovered_at >= ${dayStart})::int as "newToday",
      (select count(*) from leads where discovered_at >= ${weekStart})::int as "thisWeek",
      (select count(*) from events)::int as "events",
      (select count(*) from organizers)::int as "organizers",
      (select count(*) from leads where primary_whatsapp is not null)::int as "withWhatsapp",
      (select count(*) from leads where primary_instagram is not null)::int as "withInstagram",
      (select count(*) from leads where qualification = 'qualified')::int as "qualified",
      (select count(*) from leads where last_contact_at is not null or stage in ('contatado','aguardando_resposta','interessado','negociacao','cliente'))::int as "contacted",
      (select count(*) from leads where stage in ('interessado','negociacao'))::int as "interested",
      (select count(*) from leads where stage = 'cliente')::int as "converted",
      (select count(*) from follow_ups where status = 'pending' and due_at <= now())::int as "followUpsDue"
  `);
  const kpis = { ...(k ?? {}), conversionRate: k && k.contacted ? Math.round((k.converted! / k.contacted) * 1000) / 10 : 0 };

  const perDay = await rows<{ day: string; total: number; qualified: number }>(sql`
    select to_char(d, 'YYYY-MM-DD') as day,
      coalesce(count(l.id), 0)::int as total,
      coalesce(count(l.id) filter (where l.qualification = 'qualified'), 0)::int as qualified
    from generate_series((now() at time zone ${tz})::date - 29, (now() at time zone ${tz})::date, '1 day') d
    left join leads l on (l.discovered_at at time zone ${tz})::date = d
    group by d order by d`);
  const byState = await rows<{ state: string; total: number }>(sql`
    select coalesce(state, '—') as state, count(*)::int as total from leads where not is_suppressed group by 1 order by 2 desc`);
  const byCategory = await rows<{ category: string; total: number }>(sql`
    select coalesce(c.name, 'Sem categoria') as category, count(*)::int as total
    from leads l left join categories c on c.id = l.category_id where not l.is_suppressed group by 1 order by 2 desc limit 12`);
  const byPotential = await rows<{ potential: string; total: number }>(sql`
    select coalesce(potential::text, 'pendente') as potential, count(*)::int as total from leads where not is_suppressed group by 1`);
  const contactsEvolution = await rows<{ day: string; opened: number; contacted: number }>(sql`
    select to_char(d, 'YYYY-MM-DD') as day,
      count(h.id) filter (where h.type = 'whatsapp_opened')::int as opened,
      count(h.id) filter (where h.type = 'contact_made')::int as contacted
    from generate_series((now() at time zone ${tz})::date - 29, (now() at time zone ${tz})::date, '1 day') d
    left join contact_history h on (h.created_at at time zone ${tz})::date = d and h.type in ('whatsapp_opened','contact_made')
    group by d order by d`);
  const funnel = await rows<{ stage: string; total: number }>(sql`select stage::text as stage, count(*)::int as total from leads where not is_suppressed group by 1`);
  const recent = await rows<Record<string, unknown>>(sql`
    select l.id, e.name as "eventName", l.city, l.state, l.score, l.potential, l.stage, l.discovered_at as "discoveredAt", l.primary_whatsapp as "primaryWhatsapp"
    from leads l join events e on e.id = l.event_id
    where l.qualification = 'qualified' and not l.is_suppressed and l.stage in ('qualificado','novo')
    order by l.discovered_at desc limit 8`);
  return { kpis, perDay, byState, byCategory, byPotential, contactsEvolution, funnel, recent };
}

export async function reportStats(from: string, to: string) {
  const { timezone: tz } = await getSettings();
  const range = sql`between (${from}::date at time zone ${tz}) and ((${to}::date + 1) at time zone ${tz})`;
  const weekly = await rows<Record<string, number | string>>(sql`
    select to_char(date_trunc('week', discovered_at at time zone ${tz}), 'YYYY-MM-DD') as week,
      count(*)::int as discovered,
      count(*) filter (where qualification = 'qualified')::int as qualified,
      count(*) filter (where last_contact_at is not null)::int as contacted,
      count(*) filter (where stage = 'cliente')::int as converted
    from leads where discovered_at ${range} group by 1 order by 1`);
  const bySourceType = await rows<{ type: string; total: number }>(sql`
    select ls.type::text as type, count(distinct ls.event_id)::int as total
    from lead_sources ls where ls.created_at ${range} group by 1 order by 2 desc`);
  const connectors = await rows<Record<string, number | string>>(sql`
    select sr.connector,
      count(*)::int as results,
      count(*) filter (where sr.status = 'processed')::int as leads,
      count(*) filter (where sr.status = 'duplicate')::int as duplicates,
      count(*) filter (where sr.status in ('irrelevant','discarded'))::int as discarded
    from search_results sr where sr.created_at ${range} group by 1 order by 2 desc`);
  const byRegion = await rows<Record<string, number | string>>(sql`
    select coalesce(region, '—') as region, count(*)::int as total,
      count(*) filter (where qualification = 'qualified')::int as qualified,
      count(*) filter (where stage = 'cliente')::int as converted
    from leads where discovered_at ${range} group by 1 order by 2 desc`);
  const categoryConversion = await rows<Record<string, number | string>>(sql`
    select coalesce(c.name, 'Sem categoria') as category, count(*)::int as total,
      count(*) filter (where l.last_contact_at is not null)::int as contacted,
      count(*) filter (where l.stage in ('interessado','negociacao','cliente'))::int as interested,
      count(*) filter (where l.stage = 'cliente')::int as converted
    from leads l left join categories c on c.id = l.category_id where l.discovered_at ${range} group by 1 order by 2 desc`);
  const recurringOrganizers = await rows<Record<string, unknown>>(sql`
    select o.id, o.name, o.state, o.events_count as "eventsCount", o.instagram_handle as "instagramHandle"
    from organizers o where o.is_recurring order by o.events_count desc limit 15`);
  const stageTransitions = await rows<Record<string, number | string>>(sql`
    select to_stage::text as stage, count(*)::int as total from contact_history
    where type = 'stage_change' and created_at ${range} group by 1 order by 2 desc`);
  return { weekly, bySourceType, connectors, byRegion, categoryConversion, recurringOrganizers, stageTransitions };
}

export async function controlStats() {
  const [jobs] = await rows<Record<string, number>>(sql`
    select count(*)::int as total,
      count(*) filter (where status = 'running')::int as running,
      count(*) filter (where status = 'queued')::int as queued,
      count(*) filter (where status = 'completed')::int as completed,
      count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status = 'cancelled')::int as cancelled,
      coalesce(sum(results_found),0)::int as "resultsFound",
      coalesce(sum(leads_created),0)::int as "leadsApproved",
      coalesce(sum(duplicates),0)::int as duplicates,
      coalesce(sum(discarded),0)::int as discarded,
      coalesce(round(avg(extract(epoch from finished_at - started_at)) filter (where finished_at is not null and started_at is not null)), 0)::int as "avgDurationSec"
    from search_jobs where created_at >= now() - interval '30 days'`);
  const [queries] = await rows<Record<string, number>>(sql`
    select count(*)::int as total, count(*) filter (where status = 'failed')::int as failed,
      coalesce(round(avg(duration_ms)), 0)::int as "avgMs"
    from search_queries where created_at >= now() - interval '30 days'`);
  const [results] = await rows<Record<string, number>>(sql`
    select count(*) filter (where status = 'awaiting_ai')::int as "awaitingAi",
      count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status in ('new','processing'))::int as pending
    from search_results`);
  const [usage] = await rows<Record<string, number>>(sql`
    select coalesce(sum(units) filter (where provider not in ('anthropic')), 0)::int as "searchCalls",
      coalesce(sum(units) filter (where provider = 'anthropic'), 0)::int as "aiCalls",
      coalesce(sum(input_tokens + output_tokens), 0)::bigint as "aiTokens",
      coalesce(sum(cost_usd), 0)::float as "costUsd",
      coalesce(sum(cost_usd) filter (where provider = 'anthropic'), 0)::float as "aiCostUsd"
    from api_usage where created_at >= date_trunc('month', now())`);
  return { jobs, queries, results, usage };
}

export async function usageStats(days: number) {
  const byDay = await rows<Record<string, number | string>>(sql`
    select to_char(created_at::date, 'YYYY-MM-DD') as day, provider,
      sum(units)::int as calls, sum(input_tokens)::int as "inputTokens", sum(output_tokens)::int as "outputTokens",
      round(sum(cost_usd)::numeric, 4)::float as "costUsd"
    from api_usage where created_at >= now() - make_interval(days => ${days})
    group by 1, 2 order by 1`);
  const byProvider = await rows<Record<string, number | string>>(sql`
    select provider, sum(units)::int as calls,
      count(*) filter (where not success)::int as errors,
      sum(input_tokens)::int as "inputTokens", sum(output_tokens)::int as "outputTokens",
      round(sum(cost_usd)::numeric, 4)::float as "costUsd",
      coalesce(round(avg(duration_ms)), 0)::int as "avgMs"
    from api_usage where created_at >= now() - make_interval(days => ${days}) group by 1 order by "costUsd" desc`);
  const byOperation = await rows<Record<string, number | string>>(sql`
    select provider, operation, coalesce(model, '') as model, sum(units)::int as calls,
      round(sum(cost_usd)::numeric, 4)::float as "costUsd"
    from api_usage where created_at >= now() - make_interval(days => ${days}) group by 1, 2, 3 order by "costUsd" desc`);
  const [totals] = await rows<Record<string, number>>(sql`
    select round(coalesce(sum(cost_usd), 0)::numeric, 4)::float as "costUsd",
      round(coalesce(sum(cost_usd) filter (where created_at >= date_trunc('month', now())), 0)::numeric, 4)::float as "monthUsd",
      (select count(*) from leads where discovered_at >= now() - make_interval(days => ${days}))::int as leads,
      (select count(*) from leads where qualification = 'qualified' and discovered_at >= now() - make_interval(days => ${days}))::int as qualified
    from api_usage where created_at >= now() - make_interval(days => ${days})`);
  const t = totals ?? { costUsd: 0, monthUsd: 0, leads: 0, qualified: 0 };
  return {
    byDay,
    byProvider,
    byOperation,
    totals: { ...t, costPerQualifiedLead: t.qualified ? Math.round((t.costUsd! / t.qualified) * 10000) / 10000 : null },
  };
}
