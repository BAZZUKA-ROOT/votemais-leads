import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { aiCall, aiMode, isAiReady } from '../ai/client.js';
import { db } from '../db/client.js';
import {
  contactHistory,
  contacts,
  events,
  followUps,
  leads,
  searchJobs,
  searchQueries,
  searchResults,
  sessions,
  systemLogs,
} from '../db/schema.js';
import { extractFromHtml } from '../extraction/extract.js';
import { checkAvailability } from '../extraction/fetch-page.js';
import { appearsIn, eventBaseName } from '../lib/normalize.js';
import { errMsg, syslog } from '../lib/logger.js';
import { enqueue } from '../queue/queues.js';
import { refreshLeadDenormalized } from './discovery.js';
import { notifyN8n } from './notify.js';
import { createSearchJob } from './search-runner.js';
import { getSettings } from './settings.js';

const cancellationSchema = z.object({ cancelled: z.boolean(), evidence: z.string().nullable() });

/** Atualização automática: disponibilidade, contatos, cancelamentos e novas edições. */
export async function refreshEvents(): Promise<{ checked: number; cancelled: number; newContacts: number; nextEditionQueries: number }> {
  const settings = await getSettings();
  if (!settings.refreshEnabled) return { checked: 0, cancelled: 0, newContacts: 0, nextEditionQueries: 0 };
  const cutoff = new Date(Date.now() - settings.refreshIntervalDays * 86400_000);

  // eventos cujas datas já passaram
  await db.execute(sql`update events set status = 'past' where status in ('scheduled','ongoing','unknown') and coalesce(end_date, start_date) < current_date`);

  const batch = await db
    .select()
    .from(events)
    .where(and(or(isNull(events.lastVerifiedAt), lt(events.lastVerifiedAt, cutoff)), sql`${events.status} <> 'cancelled'`))
    .orderBy(sql`${events.lastVerifiedAt} asc nulls first`)
    .limit(settings.refreshBatchSize);

  let cancelled = 0;
  let newContacts = 0;
  const nextEdition: Array<{ query: string; categoryId: number | null; state: string | null }> = [];
  const year = new Date().getFullYear();
  // confirmação de cancelamento exige um LLM (no modo regras, nenhum evento é marcado como cancelado)
  const mode = await aiMode();
  const llmReady = mode === 'anthropic' || mode === 'ollama';

  for (const ev of batch) {
    try {
      const patch: Partial<typeof events.$inferInsert> = { lastVerifiedAt: new Date() };
      if (ev.website) {
        const av = await checkAvailability(ev.website);
        patch.siteAvailable = av.ok;
        if (av.ok && av.page?.html) {
          const page = extractFromHtml(av.page.html, av.page.finalUrl);
          for (const c of page.contacts.filter((x) => ['whatsapp', 'email', 'instagram', 'phone'].includes(x.type))) {
            const res = await db
              .insert(contacts)
              .values({
                eventId: ev.id,
                organizerId: ev.organizerId,
                type: c.type,
                value: c.value,
                normalizedValue: c.normalized,
                isCommercial: true,
                sourceUrl: c.sourceUrl,
                sourceExcerpt: c.excerpt.slice(0, 500),
                confidence: Math.min(c.confidence, 70),
                label: 'atualização automática (site oficial)',
                lastVerifiedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [contacts.eventId, contacts.type, contacts.normalizedValue],
                targetWhere: sql`${contacts.eventId} is not null`,
                set: { lastVerifiedAt: new Date(), isValid: true },
              })
              .returning({ inserted: sql<boolean>`(xmax = 0)` });
            if (res[0]?.inserted) newContacts++;
          }
          if (llmReady && /cancelad|adiad|suspens/i.test(page.text)) {
            const r = await aiCall({
              purpose: 'refresh',
              system: 'Responda se o texto afirma explicitamente que o evento indicado foi CANCELADO (não apenas adiado). Copie em evidence o trecho literal. Não suponha.',
              user: `EVENTO: ${ev.name} (${ev.year ?? ''})\n\nTEXTO:\n${page.text.slice(0, 12000)}`,
              schema: cancellationSchema,
              maxTokens: 1000,
            });
            if (r.data.cancelled && r.data.evidence && appearsIn(page.text, r.data.evidence)) {
              patch.status = 'cancelled';
              cancelled++;
              const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.eventId, ev.id));
              if (lead) await db.insert(contactHistory).values({ leadId: lead.id, type: 'edited', content: `Evento identificado como cancelado: "${r.data.evidence.slice(0, 300)}"` });
            }
          }
        }
      }
      await db.update(events).set(patch).where(eq(events.id, ev.id));
      const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.eventId, ev.id));
      if (lead) await refreshLeadDenormalized(db, lead.id);

      // detectar nova edição de eventos passados
      if (ev.year && ev.year < year + 1 && (ev.status === 'past' || ev.year < year)) {
        const nextYear = Math.max(ev.year + 1, year);
        const [already] = await db
          .select({ id: events.id })
          .from(events)
          .where(and(eq(events.normalizedName, ev.normalizedName), ev.state ? eq(events.state, ev.state) : sql`true`, sql`${events.year} >= ${nextYear}`))
          .limit(1);
        if (!already) {
          const base = eventBaseName(ev.name) || ev.name;
          nextEdition.push({ query: `"${ev.name.replace(/\b(19|20)\d{2}\b/g, '').trim()}" ${nextYear} ${[ev.city, ev.state].filter(Boolean).join(' ')}`.trim() || base, categoryId: ev.categoryId, state: ev.state });
        }
      }
    } catch (err) {
      await syslog('warn', 'refresh', 'Falha ao atualizar evento', { eventId: ev.id, error: errMsg(err) });
    }
  }

  if (nextEdition.length) {
    await createSearchJob({
      type: 'refresh',
      params: { reason: 'detecção de novas edições' },
      queries: nextEdition.slice(0, 30).map((q) => ({ ...q, origin: 'refresh' as const })),
    });
  }
  await syslog('info', 'refresh', `Atualização automática: ${batch.length} eventos verificados`, { cancelled, newContacts, nextEdition: nextEdition.length });
  return { checked: batch.length, cancelled, newContacts, nextEditionQueries: nextEdition.length };
}

/** Política de retenção (LGPD): remove dados sem uso comercial após o prazo configurado. */
export async function applyRetention() {
  const s = await getSettings();
  const dataCutoff = new Date(Date.now() - s.dataRetentionDays * 86400_000);
  const logCutoff = new Date(Date.now() - s.logRetentionDays * 86400_000);
  const staleLeads = await db
    .select({ id: leads.id, eventId: leads.eventId })
    .from(leads)
    .where(and(inArray(leads.qualification, ['disqualified', 'analysis_failed']), inArray(leads.stage, ['novo', 'sem_interesse']), lt(leads.updatedAt, dataCutoff)));
  if (staleLeads.length) {
    await db.delete(events).where(inArray(events.id, staleLeads.map((l) => l.eventId)));
  }
  const delResults = await db
    .delete(searchResults)
    .where(and(inArray(searchResults.status, ['irrelevant', 'discarded', 'duplicate', 'cancelled']), lt(searchResults.createdAt, new Date(Date.now() - 90 * 86400_000))))
    .returning({ id: searchResults.id });
  const delLogs = await db.delete(systemLogs).where(and(lt(systemLogs.createdAt, logCutoff), sql`${systemLogs.level} <> 'audit'`)).returning({ id: systemLogs.id });
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.execute(sql`delete from organizers o where not exists (select 1 from events e where e.organizer_id = o.id) and o.updated_at < ${dataCutoff}`);
  await syslog('info', 'retention', 'Política de retenção aplicada', { leads: staleLeads.length, results: delResults.length, logs: delLogs.length });
  return { leads: staleLeads.length, results: delResults.length, logs: delLogs.length };
}

/** Retoma pesquisas interrompidas (worker reiniciado, queda de energia etc.). */
export async function resumeStaleJobs(staleMinutes = 15) {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000);
  const stale = await db
    .select({ id: searchJobs.id })
    .from(searchJobs)
    .where(and(inArray(searchJobs.status, ['queued', 'running']), or(isNull(searchJobs.heartbeatAt), lt(searchJobs.heartbeatAt, cutoff)), lt(searchJobs.createdAt, cutoff)));
  let requeued = 0;
  for (const j of stale) {
    const qs = await db
      .select({ id: searchQueries.id })
      .from(searchQueries)
      .where(and(eq(searchQueries.jobId, j.id), inArray(searchQueries.status, ['pending', 'running'])));
    await db.update(searchQueries).set({ status: 'pending' }).where(and(eq(searchQueries.jobId, j.id), eq(searchQueries.status, 'running')));
    for (const q of qs) await enqueue('search', { queryId: q.id, jobId: j.id }, { jobId: `q-${q.id}-resume-${Date.now()}` });
    const rs = await db
      .select({ id: searchResults.id })
      .from(searchResults)
      .where(and(eq(searchResults.jobId, j.id), inArray(searchResults.status, ['new', 'processing'])));
    await db.update(searchResults).set({ status: 'new' }).where(and(eq(searchResults.jobId, j.id), eq(searchResults.status, 'processing')));
    for (const r of rs) await enqueue('process', { resultId: r.id, jobId: j.id }, { jobId: `r-${r.id}-resume-${Date.now()}` });
    requeued += qs.length + rs.length;
    await db.update(searchJobs).set({ heartbeatAt: new Date() }).where(eq(searchJobs.id, j.id));
  }
  if (stale.length) await syslog('warn', 'resume', `Retomadas ${stale.length} pesquisas interrompidas`, { requeued });
  return { jobs: stale.length, requeued };
}

/** Follow-ups vencidos: prepara sugestão de mensagem e notifica n8n (nunca envia ao lead). */
export async function processDueFollowUps() {
  const due = await db
    .select({ id: followUps.id, leadId: followUps.leadId, title: followUps.title, suggested: followUps.suggestedMessage })
    .from(followUps)
    .where(and(eq(followUps.status, 'pending'), lt(followUps.dueAt, new Date(Date.now() + 3600_000))));
  const aiReady = await isAiReady();
  for (const f of due) {
    if (!f.suggested && aiReady) await enqueue('message', { leadId: f.leadId, kind: 'followup', followUpId: f.id }, { jobId: `m-fu-${f.id}` });
  }
  if (due.length) await notifyN8n('followups.due', { count: due.length, items: due.map((d) => ({ id: d.id, leadId: d.leadId, title: d.title })) });
  return { due: due.length };
}

export async function recomputeNextFollowUp(leadId: string) {
  const [r] = await db
    .select({ next: sql<Date | null>`min(${followUps.dueAt})` })
    .from(followUps)
    .where(and(eq(followUps.leadId, leadId), eq(followUps.status, 'pending')));
  await db.update(leads).set({ nextFollowUpAt: r?.next ? new Date(r.next) : null }).where(eq(leads.id, leadId));
}

