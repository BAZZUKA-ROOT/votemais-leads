import { and, desc, eq, or, sql } from 'drizzle-orm';
import { aiMode } from '../ai/client.js';
import { runClassification } from '../ai/classification.js';
import { rulesClassify, RULES_MODEL } from '../ai/rules.js';
import { APPROACHES, runMessageGeneration } from '../ai/messages.js';
import { db } from '../db/client.js';
import {
  aiAnalyses,
  categories,
  contactHistory,
  contacts,
  events,
  followUps,
  generatedMessages,
  leadSources,
  leads,
  organizers,
  type Contact,
  type Event,
  type Organizer,
} from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { syslog } from '../lib/logger.js';
import { enqueue } from '../queue/queues.js';
import { notifyN8n } from './notify.js';
import { createSearchJob } from './search-runner.js';
import { getSettings } from './settings.js';

export interface ChecklistItem {
  item: string;
  status: 'confirmed' | 'not_confirmed' | 'not_found';
  evidence?: string | null;
}

const fs = (s: string): ChecklistItem['status'] => (s === 'confirmed' ? 'confirmed' : s === 'not_found' ? 'not_found' : 'not_confirmed');

/** Checklist factual calculado a partir dos dados verificados (não depende da IA). */
export function buildChecklist(ev: Event, org: Organizer | null, list: Contact[], today = new Date()): ChecklistItem[] {
  const commercial = list.filter((c) => c.isCommercial && ['whatsapp', 'phone', 'email'].includes(c.type));
  const future = ev.startDate ? new Date(ev.startDate) >= new Date(today.toISOString().slice(0, 10)) : null;
  return [
    { item: 'Existe concurso/premiação', status: fs(ev.hasContest) },
    { item: 'Possui participantes/candidatos', status: fs(ev.hasParticipants) },
    { item: 'Possui votação popular', status: fs(ev.hasPopularVoting), evidence: ev.votingEvidence },
    { item: 'Organizador identificado', status: org ? 'confirmed' : 'not_found', evidence: org?.name ?? null },
    { item: 'Contato comercial encontrado', status: commercial.length ? 'confirmed' : 'not_found', evidence: commercial.map((c) => c.type).join(', ') || null },
    { item: 'WhatsApp encontrado', status: list.some((c) => c.type === 'whatsapp') ? 'confirmed' : 'not_found' },
    { item: 'Instagram oficial', status: ev.instagramHandle || org?.instagramHandle || list.some((c) => c.type === 'instagram') ? 'confirmed' : 'not_found' },
    { item: 'Evento futuro', status: future === null ? 'not_found' : future ? 'confirmed' : 'not_confirmed', evidence: ev.startDate },
  ];
}

/** Qualidade dos dados (0-100): completude e confiabilidade das informações encontradas. */
export function computeDataQuality(ev: Event, org: Organizer | null, list: Contact[], sourcesCount: number): number {
  let q = 0;
  if (ev.name) q += 10;
  if (ev.city) q += 8;
  if (ev.state) q += 7;
  if (ev.startDate) q += 10;
  else if (ev.year) q += 5;
  if (org) q += 12;
  if (org?.personName || org?.companyName) q += 5;
  if (list.some((c) => c.type === 'whatsapp')) q += 18;
  else if (list.some((c) => c.type === 'phone')) q += 10;
  if (list.some((c) => c.type === 'email')) q += 8;
  if (ev.instagramHandle || org?.instagramHandle || list.some((c) => c.type === 'instagram')) q += 10;
  if (ev.website) q += 4;
  q += Math.min(8, sourcesCount * 3);
  return Math.min(100, q);
}

async function loadLeadBundle(leadId: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw notFound('Lead');
  const [ev] = await db.select().from(events).where(eq(events.id, lead.eventId));
  const [org] = ev?.organizerId ? await db.select().from(organizers).where(eq(organizers.id, ev.organizerId)) : [];
  const [cat] = ev?.categoryId ? await db.select().from(categories).where(eq(categories.id, ev.categoryId)) : [];
  const list = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.isValid, true), or(eq(contacts.eventId, lead.eventId), ev?.organizerId ? eq(contacts.organizerId, ev.organizerId) : sql`false`)));
  const sources = await db.select().from(leadSources).where(eq(leadSources.eventId, lead.eventId)).orderBy(desc(leadSources.createdAt)).limit(15);
  const [lastExtraction] = await db
    .select()
    .from(aiAnalyses)
    .where(and(eq(aiAnalyses.eventId, lead.eventId), eq(aiAnalyses.type, 'extraction')))
    .orderBy(desc(aiAnalyses.createdAt))
    .limit(1);
  return { lead, ev: ev!, org: org ?? null, cat: cat ?? null, list, sources, lastExtraction };
}

export function buildDossier(b: Awaited<ReturnType<typeof loadLeadBundle>>, checklist: ChecklistItem[], today = new Date()): string {
  const { ev, org, cat, list, sources } = b;
  const lines = [
    `Data de hoje: ${today.toISOString().slice(0, 10)}`,
    `EVENTO: ${ev.name}${ev.edition ? ` (${ev.edition})` : ''}`,
    `Categoria: ${cat?.name ?? 'não definida'}`,
    `Ano: ${ev.year ?? 'não encontrado'} | Data: ${ev.startDate ?? 'não encontrada'}${ev.endDate ? ` a ${ev.endDate}` : ''} | Situação: ${ev.status}`,
    `Local: ${[ev.city, ev.state].filter(Boolean).join(' / ') || 'não encontrado'}`,
    `Inscrições abertas: ${ev.registrationOpen}`,
    `Votação popular: ${ev.hasPopularVoting}${ev.votingEvidence ? ` — evidência: "${ev.votingEvidence}"` : ''}`,
    ev.currentVotingMethod ? `Forma atual de votação: ${ev.currentVotingMethod}` : '',
    ev.description ? `Descrição: ${ev.description}` : '',
    `ORGANIZADOR: ${org ? `${org.name} (tipo: ${org.type}${org.isRecurring ? ', recorrente' : ''}; eventos conhecidos: ${org.eventsCount})` : 'não identificado'}`,
    `CONTATOS: ${list.length ? list.map((c) => `${c.type}${c.isCommercial ? '' : ' (não comercial)'}`).join(', ') : 'nenhum'}`,
    `CHECKLIST:\n${checklist.map((c) => `- ${c.item}: ${c.status}`).join('\n')}`,
    `FONTES (${sources.length}):\n${sources.map((s) => `- [${s.type}] ${s.title ?? ''} — ${s.excerpt?.slice(0, 300) ?? ''}`).join('\n')}`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Classifica o lead com IA, atualiza qualificação/estágio e dispara enriquecimento e mensagem. */
export async function analyzeLead(leadId: string, jobId?: string | null) {
  const b = await loadLeadBundle(leadId);
  const settings = await getSettings();
  const checklist = buildChecklist(b.ev, b.org, b.list);
  const dataQuality = computeDataQuality(b.ev, b.org, b.list, b.sources.length);
  const res =
    (await aiMode()) === 'rules'
      ? {
          data: rulesClassify({
            eventName: b.ev.name,
            checklist,
            hasPopularVoting: b.ev.hasPopularVoting,
            hasContest: b.ev.hasContest,
            hasParticipants: b.ev.hasParticipants,
            registrationOpen: b.ev.registrationOpen,
            isFuture: b.ev.startDate ? b.ev.startDate >= new Date().toISOString().slice(0, 10) : b.ev.year ? b.ev.year >= new Date().getFullYear() : null,
            isPast: b.ev.status === 'past',
            organizerKnown: !!b.org,
            organizerRecurring: !!b.org?.isRecurring,
            hasWhatsapp: b.list.some((c) => c.type === 'whatsapp'),
            hasAnyContact: b.list.some((c) => c.isCommercial && ['whatsapp', 'phone', 'email'].includes(c.type)),
            hasInstagram: b.list.some((c) => c.type === 'instagram') || !!b.ev.instagramHandle,
          }),
          model: RULES_MODEL,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        }
      : await runClassification(buildDossier(b, checklist), jobId);
  const c = res.data;
  const qualified = c.score >= settings.minQualifiedScore;

  await db.insert(aiAnalyses).values({
    leadId,
    eventId: b.ev.id,
    type: 'classification',
    model: res.model,
    score: c.score,
    potential: c.potential,
    votingProbability: c.voting_probability,
    dataQuality,
    justification: c.justification,
    checklist,
    facts: c.facts,
    hypotheses: c.hypotheses,
    output: c,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    costUsd: res.costUsd.toFixed(6),
  });

  const wasQualified = b.lead.qualification === 'qualified';
  await db
    .update(leads)
    .set({
      score: c.score,
      potential: c.potential,
      votingProbability: c.voting_probability,
      dataQuality,
      justification: c.justification,
      qualification: qualified ? 'qualified' : 'disqualified',
      ...(qualified && b.lead.stage === 'novo' ? { stage: 'qualificado' as const, stageChangedAt: new Date() } : {}),
    })
    .where(eq(leads.id, leadId));
  await db.insert(contactHistory).values({
    leadId,
    type: 'analysis',
    content: `Pontuação ${c.score} (${c.potential}) — ${qualified ? 'qualificado' : 'não qualificado'}`,
    ...(qualified && b.lead.stage === 'novo' ? { fromStage: 'novo' as const, toStage: 'qualificado' as const } : {}),
  });

  if (qualified && !b.lead.enrichedAt && c.score >= settings.enrichmentMinScore && settings.maxFollowupDepth > 0 && c.enrichment_queries.length) {
    await db.update(leads).set({ enrichedAt: new Date() }).where(eq(leads.id, leadId));
    await createSearchJob({
      type: 'followup',
      contextEventId: b.ev.id,
      params: { reason: 'enriquecimento de lead qualificado', leadId },
      queries: c.enrichment_queries.map((query) => ({ query, categoryId: b.ev.categoryId, state: b.ev.state, origin: 'ai_followup' as const, depth: 1 })),
    });
  }

  if (qualified && settings.autoGenerateMessages) {
    const [existing] = await db.select({ id: generatedMessages.id }).from(generatedMessages).where(eq(generatedMessages.leadId, leadId)).limit(1);
    if (!existing) await enqueue('message', { leadId, kind: 'initial' }, { jobId: `m-${leadId}-initial` });
  }
  if (qualified && !wasQualified) {
    await notifyN8n('lead.qualified', { leadId, event: b.ev.name, city: b.ev.city, state: b.ev.state, score: c.score });
  }
  return { score: c.score, qualified, dataQuality };
}

function confirmedFacts(b: Awaited<ReturnType<typeof loadLeadBundle>>, hooks: string[]): string[] {
  const f: string[] = [];
  if (b.ev.edition) f.push(`Edição: ${b.ev.edition}`);
  if (b.ev.year) f.push(`Ano do evento: ${b.ev.year}`);
  if (b.ev.startDate) f.push(`Data: ${b.ev.startDate}`);
  if (b.ev.registrationOpen === 'confirmed') f.push('Inscrições abertas');
  if (b.ev.hasParticipants === 'confirmed') f.push('Evento possui candidatas/candidatos');
  if (b.ev.hasPopularVoting === 'confirmed' && b.ev.votingEvidence) f.push(`Votação popular: ${b.ev.votingEvidence}`);
  if (b.ev.currentVotingMethod && b.ev.hasPopularVoting === 'confirmed') f.push(`Votação atual feita via: ${b.ev.currentVotingMethod}`);
  if (b.org?.isRecurring) f.push('Organizador realiza o evento há mais de uma edição');
  return [...f, ...hooks].slice(0, 8);
}

/** Gera mensagem personalizada (nunca envia). */
export async function generateMessage(leadId: string, kind: 'initial' | 'followup', followUpId?: string | null) {
  const b = await loadLeadBundle(leadId);
  const [lastClass] = await db
    .select()
    .from(aiAnalyses)
    .where(and(eq(aiAnalyses.leadId, leadId), eq(aiAnalyses.type, 'classification')))
    .orderBy(desc(aiAnalyses.createdAt))
    .limit(1);
  const hooks = ((lastClass?.output as { approach_hooks?: string[] } | null)?.approach_hooks ?? []).slice(0, 4);
  const [prev] = await db
    .select()
    .from(generatedMessages)
    .where(and(eq(generatedMessages.leadId, leadId), sql`${generatedMessages.status} in ('opened','sent')`))
    .orderBy(desc(generatedMessages.createdAt))
    .limit(1);
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(generatedMessages).where(eq(generatedMessages.leadId, leadId));
  const approach = APPROACHES[(n + leadId.charCodeAt(0)) % APPROACHES.length]!;
  const res = await runMessageGeneration(
    {
    eventName: b.ev.name,
    city: b.ev.city,
    state: b.ev.state,
    categoryName: b.cat?.name ?? null,
    organizerName: b.org && !b.org.name.startsWith('@') ? (b.org.personName ?? b.org.name) : null,
    confirmedFacts: confirmedFacts(b, hooks),
    votingConfirmed: b.ev.hasPopularVoting === 'confirmed',
    kind,
    approach,
    previousMessage: kind === 'followup' ? (prev?.editedContent ?? prev?.content ?? null) : null,
    daysSinceContact: b.lead.lastContactAt ? Math.round((Date.now() - b.lead.lastContactAt.getTime()) / 86400_000) : null,
    },
    n + leadId.charCodeAt(0),
  );
  const [msg] = await db
    .insert(generatedMessages)
    .values({ leadId, channel: 'whatsapp', kind, approach: res.data.approach || approach, content: res.data.message, model: res.model })
    .returning();
  await db.insert(contactHistory).values({ leadId, type: 'message_generated', content: kind === 'initial' ? 'Mensagem inicial gerada' : 'Sugestão de follow-up gerada', metadata: { messageId: msg!.id } });
  if (followUpId) {
    await db.update(followUps).set({ suggestedMessage: res.data.message }).where(eq(followUps.id, followUpId));
  }
  await syslog('info', 'messages', 'Mensagem gerada', { leadId, kind });
  return msg!;
}
