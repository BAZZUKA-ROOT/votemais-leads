import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  aiAnalyses,
  campaigns,
  categories,
  contactHistory,
  contacts,
  events,
  followUps,
  generatedMessages,
  leadSources,
  leads,
  leadStage,
  organizers,
  replyOutcome,
  type LeadStage,
} from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import { eventBaseName, eventFingerprint, normalizeBrPhone, normalizeEmail, normalizeInstagram, normalizeOrganizerName } from '../lib/normalize.js';
import { regionOf, toUf, UFS } from '../lib/regions.js';
import { buildMailtoLink, buildWhatsAppLink } from '../lib/whatsapp.js';
import { refreshLeadDenormalized } from './discovery.js';
import { recomputeNextFollowUp } from './maintenance.js';
import { getSettings } from './settings.js';

const boolish = z.enum(['true', 'false']).transform((v) => v === 'true');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const csv = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  .or(z.array(z.string()));

export const leadFiltersSchema = z.object({
  q: z.string().max(200).optional(),
  state: csv.optional(),
  city: z.string().max(100).optional(),
  region: z.string().max(30).optional(),
  categoryId: csv.optional(),
  stage: csv.optional(),
  qualification: csv.optional(),
  potential: csv.optional(),
  scoreMin: z.coerce.number().int().min(0).max(100).optional(),
  scoreMax: z.coerce.number().int().min(0).max(100).optional(),
  discoveredFrom: dateStr.optional(),
  discoveredTo: dateStr.optional(),
  eventFrom: dateStr.optional(),
  eventTo: dateStr.optional(),
  year: z.coerce.number().int().optional(),
  organizerType: csv.optional(),
  hasWhatsapp: boolish.optional(),
  hasInstagram: boolish.optional(),
  hasEmail: boolish.optional(),
  includeSuppressed: boolish.optional(),
  campaignId: z.coerce.number().int().optional(),
  sort: z.enum(['discoveredAt', 'score', 'eventDate', 'eventName', 'state', 'stageChangedAt']).default('discoveredAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export function buildLeadWhere(f: LeadFilters): SQL | undefined {
  const w: SQL[] = [];
  if (!f.includeSuppressed) w.push(eq(leads.isSuppressed, false));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, '\\$&')}%`;
    w.push(or(ilike(events.name, like), ilike(organizers.name, like), ilike(leads.city, like), ilike(leads.notes, like))!);
  }
  if (f.state?.length) w.push(inArray(leads.state, f.state.map((s) => s.toUpperCase())));
  if (f.city) w.push(ilike(leads.city, `%${f.city.replace(/[%_]/g, '\\$&')}%`));
  if (f.region) w.push(eq(leads.region, f.region));
  if (f.categoryId?.length) w.push(inArray(leads.categoryId, f.categoryId.map(Number).filter(Number.isFinite)));
  if (f.stage?.length) w.push(inArray(leads.stage, f.stage.filter((s): s is LeadStage => (leadStage.enumValues as string[]).includes(s))));
  if (f.qualification?.length) w.push(inArray(leads.qualification, f.qualification as never));
  if (f.potential?.length) w.push(inArray(leads.potential, f.potential as never));
  if (f.scoreMin !== undefined) w.push(gte(leads.score, f.scoreMin));
  if (f.scoreMax !== undefined) w.push(lte(leads.score, f.scoreMax));
  if (f.discoveredFrom) w.push(gte(leads.discoveredAt, new Date(`${f.discoveredFrom}T00:00:00-03:00`)));
  if (f.discoveredTo) w.push(lte(leads.discoveredAt, new Date(`${f.discoveredTo}T23:59:59-03:00`)));
  if (f.eventFrom) w.push(gte(leads.eventDate, f.eventFrom));
  if (f.eventTo) w.push(lte(leads.eventDate, f.eventTo));
  if (f.year) w.push(eq(events.year, f.year));
  if (f.organizerType?.length) w.push(inArray(organizers.type, f.organizerType as never));
  if (f.hasWhatsapp !== undefined) w.push(f.hasWhatsapp ? isNotNull(leads.primaryWhatsapp) : isNull(leads.primaryWhatsapp));
  if (f.hasInstagram !== undefined) w.push(f.hasInstagram ? isNotNull(leads.primaryInstagram) : isNull(leads.primaryInstagram));
  if (f.hasEmail !== undefined) w.push(f.hasEmail ? isNotNull(leads.primaryEmail) : isNull(leads.primaryEmail));
  if (f.campaignId) w.push(eq(leads.campaignId, f.campaignId));
  return w.length ? and(...w) : undefined;
}

const SORT = {
  discoveredAt: leads.discoveredAt,
  score: leads.score,
  eventDate: leads.eventDate,
  eventName: events.name,
  state: leads.state,
  stageChangedAt: leads.stageChangedAt,
} as const;

const listSelect = {
  id: leads.id,
  eventId: leads.eventId,
  eventName: events.name,
  eventYear: events.year,
  organizerId: leads.organizerId,
  organizerName: organizers.name,
  categoryId: leads.categoryId,
  categoryName: categories.name,
  city: leads.city,
  state: leads.state,
  region: leads.region,
  eventDate: leads.eventDate,
  score: leads.score,
  potential: leads.potential,
  qualification: leads.qualification,
  stage: leads.stage,
  primaryWhatsapp: leads.primaryWhatsapp,
  primaryPhone: leads.primaryPhone,
  primaryEmail: leads.primaryEmail,
  primaryInstagram: leads.primaryInstagram,
  primaryWebsite: leads.primaryWebsite,
  isSuppressed: leads.isSuppressed,
  discoveredAt: leads.discoveredAt,
  lastContactAt: leads.lastContactAt,
  nextFollowUpAt: leads.nextFollowUpAt,
  hasPopularVoting: events.hasPopularVoting,
};

function baseQuery() {
  return db
    .select(listSelect)
    .from(leads)
    .innerJoin(events, eq(events.id, leads.eventId))
    .leftJoin(organizers, eq(organizers.id, leads.organizerId))
    .leftJoin(categories, eq(categories.id, leads.categoryId));
}

export async function listLeads(f: LeadFilters) {
  const where = buildLeadWhere(f);
  const col = SORT[f.sort];
  const order = f.dir === 'asc' ? sql`${col} asc nulls last` : sql`${col} desc nulls last`;
  const rows = await baseQuery()
    .where(where)
    .orderBy(order, desc(leads.id))
    .limit(f.pageSize)
    .offset((f.page - 1) * f.pageSize);
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(events, eq(events.id, leads.eventId))
    .leftJoin(organizers, eq(organizers.id, leads.organizerId))
    .where(where);
  return { items: rows, total, page: f.page, pageSize: f.pageSize };
}

export async function exportLeads(f: LeadFilters) {
  return baseQuery()
    .where(buildLeadWhere(f))
    .orderBy(desc(leads.discoveredAt))
    .limit(10_000);
}

const CSV_COLUMNS: Array<[string, (r: Awaited<ReturnType<typeof exportLeads>>[number]) => unknown]> = [
  ['evento', (r) => r.eventName],
  ['organizador', (r) => r.organizerName],
  ['categoria', (r) => r.categoryName],
  ['cidade', (r) => r.city],
  ['uf', (r) => r.state],
  ['regiao', (r) => r.region],
  ['data_evento', (r) => r.eventDate],
  ['pontuacao', (r) => r.score],
  ['potencial', (r) => r.potential],
  ['estagio', (r) => r.stage],
  ['whatsapp', (r) => r.primaryWhatsapp],
  ['telefone', (r) => r.primaryPhone],
  ['email', (r) => r.primaryEmail],
  ['instagram', (r) => (r.primaryInstagram ? `@${r.primaryInstagram}` : '')],
  ['site', (r) => r.primaryWebsite],
  ['descoberto_em', (r) => r.discoveredAt?.toISOString()],
];

/** CSV com proteção contra injeção de fórmulas em planilhas. */
export function toCsv(rows: Awaited<ReturnType<typeof exportLeads>>): string {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = CSV_COLUMNS.map(([h]) => h).join(';');
  return `﻿${header}\n${rows.map((r) => CSV_COLUMNS.map(([, fn]) => esc(fn(r))).join(';')).join('\n')}\n`;
}

export async function getLeadDetail(id: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) throw notFound('Lead');
  const [event] = await db.select().from(events).where(eq(events.id, lead.eventId));
  const [organizer] = lead.organizerId ? await db.select().from(organizers).where(eq(organizers.id, lead.organizerId)) : [];
  const [category] = lead.categoryId ? await db.select().from(categories).where(eq(categories.id, lead.categoryId)) : [];
  const [campaign] = lead.campaignId ? await db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)) : [];
  const contactList = await db
    .select()
    .from(contacts)
    .where(or(eq(contacts.eventId, lead.eventId), lead.organizerId ? eq(contacts.organizerId, lead.organizerId) : sql`false`))
    .orderBy(desc(contacts.isCommercial), desc(contacts.confidence));
  const sources = await db.select().from(leadSources).where(eq(leadSources.eventId, lead.eventId)).orderBy(desc(leadSources.createdAt));
  const analyses = await db.select().from(aiAnalyses).where(eq(aiAnalyses.eventId, lead.eventId)).orderBy(desc(aiAnalyses.createdAt)).limit(20);
  const messages = await db.select().from(generatedMessages).where(eq(generatedMessages.leadId, id)).orderBy(desc(generatedMessages.createdAt));
  const history = await db.select().from(contactHistory).where(eq(contactHistory.leadId, id)).orderBy(desc(contactHistory.createdAt)).limit(200);
  const fups = await db.select().from(followUps).where(eq(followUps.leadId, id)).orderBy(asc(followUps.dueAt));
  const otherEvents = lead.organizerId
    ? await db
        .select({ id: events.id, name: events.name, year: events.year, leadId: leads.id })
        .from(events)
        .leftJoin(leads, eq(leads.eventId, events.id))
        .where(and(eq(events.organizerId, lead.organizerId), sql`${events.id} <> ${lead.eventId}`))
    : [];
  return { lead, event: event!, organizer: organizer ?? null, category: category ?? null, campaign: campaign ?? null, contacts: contactList, sources, analyses, messages, history, followUps: fups, otherEvents };
}

export const leadUpdateSchema = z
  .object({
    notes: z.string().max(10_000).nullable(),
    campaignId: z.number().int().nullable(),
    event: z
      .object({
        name: z.string().min(2).max(300),
        edition: z.string().max(100).nullable(),
        city: z.string().max(120).nullable(),
        state: z.string().max(30).nullable(),
        startDate: dateStr.nullable(),
        endDate: dateStr.nullable(),
        categoryId: z.number().int().nullable(),
        website: z.string().url().max(500).regex(/^https?:\/\//i, 'Use http(s)').nullable(),
        instagramHandle: z.string().max(60).nullable(),
        status: z.enum(['scheduled', 'ongoing', 'past', 'cancelled', 'unknown']),
        hasPopularVoting: z.enum(['confirmed', 'unconfirmed', 'not_found', 'denied']),
        description: z.string().max(2000).nullable(),
      })
      .partial(),
    organizer: z
      .object({
        name: z.string().min(2).max(200),
        companyName: z.string().max(200).nullable(),
        personName: z.string().max(200).nullable(),
        type: z.enum(['empresa', 'prefeitura', 'associacao', 'produtora', 'sindicato_rural', 'midia', 'pessoa', 'desconhecido']),
        notes: z.string().max(5000).nullable(),
      })
      .partial(),
  })
  .partial()
  .strict();

export async function updateLead(id: string, input: z.infer<typeof leadUpdateSchema>, userId: string | null) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) throw notFound('Lead');
  await db.transaction(async (tx) => {
    if (input.notes !== undefined || input.campaignId !== undefined) {
      await tx
        .update(leads)
        .set({ ...(input.notes !== undefined ? { notes: input.notes } : {}), ...(input.campaignId !== undefined ? { campaignId: input.campaignId } : {}) })
        .where(eq(leads.id, id));
    }
    if (input.event && Object.keys(input.event).length) {
      const [ev] = await tx.select().from(events).where(eq(events.id, lead.eventId));
      const e = { ...input.event };
      const patch: Partial<typeof events.$inferInsert> = { ...e } as never;
      if (e.state !== undefined) {
        const uf = e.state ? toUf(e.state) : null;
        if (e.state && !uf) throw badRequest('UF inválida');
        patch.state = uf;
        patch.region = regionOf(uf);
      }
      if (e.instagramHandle !== undefined) patch.instagramHandle = e.instagramHandle ? normalizeInstagram(e.instagramHandle) : null;
      if (e.startDate !== undefined && e.startDate) patch.year = Number(e.startDate.slice(0, 4));
      const name = e.name ?? ev!.name;
      patch.normalizedName = eventBaseName(name);
      patch.fingerprint = eventFingerprint({ name, state: patch.state ?? ev!.state, city: e.city !== undefined ? e.city : ev!.city, year: patch.year ?? ev!.year });
      const sources = { ...ev!.fieldSources };
      for (const k of Object.keys(e)) sources[k] = 'edição manual';
      patch.fieldSources = sources;
      try {
        await tx.update(events).set(patch).where(eq(events.id, lead.eventId));
      } catch (err) {
        if (String((err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code) === '23505') throw badRequest('Já existe outro evento com esses dados (possível duplicado)');
        throw err;
      }
    }
    if (input.organizer && Object.keys(input.organizer).length) {
      let orgId = lead.organizerId;
      if (!orgId) {
        if (!input.organizer.name) throw badRequest('Informe o nome do organizador');
        const [org] = await tx
          .insert(organizers)
          .values({ name: input.organizer.name, normalizedName: normalizeOrganizerName(input.organizer.name), fieldSources: { name: 'edição manual' } })
          .returning({ id: organizers.id });
        orgId = org!.id;
        await tx.update(events).set({ organizerId: orgId }).where(eq(events.id, lead.eventId));
      } else {
        await tx
          .update(organizers)
          .set({ ...input.organizer, ...(input.organizer.name ? { normalizedName: normalizeOrganizerName(input.organizer.name) } : {}) })
          .where(eq(organizers.id, orgId));
      }
    }
    await tx.insert(contactHistory).values({ leadId: id, userId, type: 'edited', content: 'Informações editadas manualmente', metadata: { fields: Object.keys(input) } });
    await refreshLeadDenormalized(tx, id);
  });
  return getLeadDetail(id);
}

export const contactInputSchema = z.object({
  type: z.enum(['whatsapp', 'phone', 'email', 'instagram', 'website', 'facebook']),
  value: z.string().min(3).max(300),
  label: z.string().max(100).nullable().optional(),
  sourceUrl: z.string().url().max(500).regex(/^https?:\/\//i, 'Use http(s)').optional(),
  isCommercial: z.boolean().default(true),
});

export async function addContact(leadId: string, input: z.infer<typeof contactInputSchema>, userId: string | null) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw notFound('Lead');
  let normalized: string | null = null;
  let display = input.value.trim();
  if (input.type === 'whatsapp' || input.type === 'phone') {
    const p = normalizeBrPhone(input.value);
    normalized = p?.e164 ?? null;
    display = p?.display ?? display;
  } else if (input.type === 'email') normalized = normalizeEmail(input.value);
  else if (input.type === 'instagram') {
    normalized = normalizeInstagram(input.value);
    display = normalized ? `@${normalized}` : display;
  } else {
    try {
      const u = new URL(input.value);
      normalized = input.type === 'website' ? u.hostname.replace(/^www\./, '') : u.toString().toLowerCase();
    } catch {
      normalized = null;
    }
  }
  if (!normalized) throw badRequest('Contato inválido');
  await db
    .insert(contacts)
    .values({
      eventId: lead.eventId,
      organizerId: lead.organizerId,
      type: input.type,
      value: display,
      normalizedValue: normalized,
      label: input.label ?? 'adicionado manualmente',
      isCommercial: input.isCommercial,
      sourceUrl: input.sourceUrl || 'manual',
      confidence: 100,
    })
    .onConflictDoNothing();
  await db.insert(contactHistory).values({ leadId, userId, type: 'edited', content: `Contato ${input.type} adicionado manualmente` });
  await refreshLeadDenormalized(db, leadId);
}

export async function removeContact(leadId: string, contactId: string, userId: string | null) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw notFound('Lead');
  const deleted = await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), or(eq(contacts.eventId, lead.eventId), lead.organizerId ? eq(contacts.organizerId, lead.organizerId) : sql`false`)))
    .returning({ type: contacts.type });
  if (!deleted.length) throw notFound('Contato');
  await db.insert(contactHistory).values({ leadId, userId, type: 'edited', content: `Contato ${deleted[0]!.type} removido` });
  await refreshLeadDenormalized(db, leadId);
}

/** Mudança de estágio com histórico; contatado agenda follow-up automático. */
export async function changeStage(id: string, to: LeadStage, userId: string | null, opts?: { position?: number; note?: string | null; channel?: 'whatsapp' | 'email' | 'instagram' }) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) throw notFound('Lead');
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    let position = opts?.position;
    if (position === undefined) {
      const [{ max } = { max: 0 }] = await tx.select({ max: sql<number>`coalesce(max(${leads.stagePosition}), 0)::int` }).from(leads).where(eq(leads.stage, to));
      position = max + 1;
    } else {
      await tx
        .update(leads)
        .set({ stagePosition: sql`${leads.stagePosition} + 1` })
        .where(and(eq(leads.stage, to), gte(leads.stagePosition, position), sql`${leads.id} <> ${id}`));
    }
    const changed = lead.stage !== to;
    await tx
      .update(leads)
      .set({
        stage: to,
        stagePosition: position,
        ...(changed ? { stageChangedAt: new Date() } : {}),
        ...(changed && to === 'contatado' ? { lastContactAt: new Date() } : {}),
      })
      .where(eq(leads.id, id));
    if (changed) {
      await tx.insert(contactHistory).values({ leadId: id, userId, type: 'stage_change', fromStage: lead.stage, toStage: to, content: opts?.note ?? null });
      if (to === 'contatado') {
        await tx.insert(contactHistory).values({ leadId: id, userId, type: 'contact_made', channel: opts?.channel ?? 'whatsapp', content: opts?.note ?? 'Contato registrado' });
        const [pending] = await tx.select({ id: followUps.id }).from(followUps).where(and(eq(followUps.leadId, id), eq(followUps.status, 'pending'))).limit(1);
        if (!pending) {
          await tx.insert(followUps).values({
            leadId: id,
            userId,
            dueAt: new Date(Date.now() + settings.followUpDefaultDays * 86400_000),
            title: 'Retomar contato (sem resposta)',
            notes: 'Criado automaticamente ao marcar como contatado.',
          });
          await tx.insert(contactHistory).values({ leadId: id, userId, type: 'followup_created', content: `Follow-up em ${settings.followUpDefaultDays} dias` });
        }
      }
      if (['cliente', 'sem_interesse'].includes(to)) {
        await tx.update(followUps).set({ status: 'cancelled' }).where(and(eq(followUps.leadId, id), eq(followUps.status, 'pending')));
      }
      const implied = STAGE_REPLY[to];
      if (implied) await markReply(tx, id, implied, new Date());
    }
  });
  await recomputeNextFollowUp(id);
}

export type ReplyOutcome = (typeof replyOutcome.enumValues)[number];
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Mover o lead para estas etapas implica que o contato respondeu. */
const STAGE_REPLY: Partial<Record<LeadStage, ReplyOutcome>> = { interessado: 'positive', negociacao: 'positive', cliente: 'positive', sem_interesse: 'negative' };

/** Atribui a resposta à última mensagem enviada, se ela ainda não tiver resposta. Retorna o id da mensagem. */
async function markReply(tx: Tx, leadId: string, outcome: ReplyOutcome, at: Date): Promise<string | null> {
  const [msg] = await tx
    .select({ id: generatedMessages.id, replied: generatedMessages.replyOutcome })
    .from(generatedMessages)
    .where(and(eq(generatedMessages.leadId, leadId), eq(generatedMessages.status, 'sent')))
    .orderBy(desc(generatedMessages.sentAt))
    .limit(1);
  if (!msg || msg.replied) return null;
  await tx.update(generatedMessages).set({ replyOutcome: outcome, repliedAt: at }).where(eq(generatedMessages.id, msg.id));
  return msg.id;
}

const REPLY_LABEL: Record<ReplyOutcome, string> = { positive: 'Respondeu com interesse', neutral: 'Respondeu (neutro)', negative: 'Respondeu sem interesse' };
const REPLY_STAGE: Record<ReplyOutcome, LeadStage | null> = { positive: 'interessado', neutral: null, negative: 'sem_interesse' };

/** Registra a resposta do contato, mede a abordagem usada e avança a etapa quando faz sentido. */
export async function registerReply(leadId: string, input: { outcome: ReplyOutcome; note?: string | null }, userId: string | null) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw notFound('Lead');
  const at = new Date();
  const messageId = await db.transaction(async (tx) => {
    const id = await markReply(tx, leadId, input.outcome, at);
    await tx.insert(contactHistory).values({ leadId, userId, type: 'reply_received', content: input.note ? `${REPLY_LABEL[input.outcome]}: ${input.note}` : REPLY_LABEL[input.outcome], metadata: { outcome: input.outcome, messageId: id } });
    // a resposta torna desnecessário o lembrete automático de "sem resposta"
    await tx
      .update(followUps)
      .set({ status: 'cancelled' })
      .where(and(eq(followUps.leadId, leadId), eq(followUps.status, 'pending'), eq(followUps.title, 'Retomar contato (sem resposta)')));
    return id;
  });
  const next = REPLY_STAGE[input.outcome];
  const order = leadStage.enumValues;
  if (next && (next === 'sem_interesse' || order.indexOf(lead.stage) < order.indexOf(next))) await changeStage(leadId, next, userId, { note: input.note ?? null });
  else await recomputeNextFollowUp(leadId);
  return { messageId };
}

export const ACTION_TYPES = ['whatsapp_opened', 'instagram_opened', 'email_opened', 'website_opened'] as const;

/** Monta link de contato (wa.me/mailto/instagram) e registra a abertura. Nunca envia mensagens. */
export async function openChannel(
  leadId: string,
  input: { channel: 'whatsapp' | 'instagram' | 'email' | 'website'; messageId?: string | null; text?: string | null; phone?: string | null },
  userId: string | null,
) {
  const detail = await getLeadDetail(leadId);
  const { lead } = detail;
  if (lead.isSuppressed) throw badRequest('Contato está na lista de supressão — abordagem bloqueada');
  let url: string | null = null;
  let warning: string | null = null;
  let message = input.text ?? null;
  if (input.messageId) {
    const m = detail.messages.find((x) => x.id === input.messageId);
    if (!m) throw notFound('Mensagem');
    message = message ?? m.editedContent ?? m.content;
  }
  if (input.channel === 'whatsapp') {
    let phone = input.phone ? normalizeBrPhone(input.phone)?.e164 : (lead.primaryWhatsapp ?? null);
    if (input.phone && !phone) throw badRequest('Telefone inválido');
    if (!phone && lead.primaryPhone && normalizeBrPhone(lead.primaryPhone)?.isMobile) {
      phone = lead.primaryPhone;
      warning = 'Número celular encontrado, mas não confirmado como WhatsApp na fonte.';
    }
    if (!phone) throw badRequest('Nenhum WhatsApp ou celular comercial encontrado para este lead');
    url = buildWhatsAppLink(phone, message);
  } else if (input.channel === 'instagram') {
    if (!lead.primaryInstagram) throw badRequest('Instagram não encontrado');
    // com mensagem, abre direto o Direct (o texto vai pela área de transferência: o Instagram não aceita texto na URL)
    url = message ? `https://ig.me/m/${lead.primaryInstagram}` : `https://www.instagram.com/${lead.primaryInstagram}/`;
  } else if (input.channel === 'email') {
    if (!lead.primaryEmail) throw badRequest('E-mail comercial não encontrado');
    url = buildMailtoLink(lead.primaryEmail, `VoteMais — ${detail.event.name}`, message);
  } else {
    if (!lead.primaryWebsite) throw badRequest('Site não encontrado');
    url = lead.primaryWebsite;
  }
  const type = `${input.channel}_opened` as (typeof ACTION_TYPES)[number];
  await db.insert(contactHistory).values({
    leadId,
    userId,
    type,
    channel: input.channel === 'website' ? null : input.channel,
    content: message ? message.slice(0, 2000) : null,
    metadata: { messageId: input.messageId ?? null },
  });
  if (input.messageId) {
    await db
      .update(generatedMessages)
      .set({ status: 'opened', openedAt: new Date(), ...(input.text ? { editedContent: input.text } : {}) })
      .where(eq(generatedMessages.id, input.messageId));
  }
  if ((input.channel === 'whatsapp' || (input.channel === 'instagram' && message)) && ['novo', 'qualificado'].includes(lead.stage)) {
    await changeStage(leadId, 'aguardando_contato', userId, { note: `${input.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram Direct'} aberto com mensagem para envio manual` });
  }
  return { url: url!, warning };
}

/** Número sem WhatsApp (informado pelo usuário): deixa de ser usado para abordagem neste lead e no organizador. */
export async function markNoWhatsapp(leadId: string, rawPhone: string | null, userId: string | null) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw notFound('Lead');
  const phone = normalizeBrPhone(rawPhone ?? lead.primaryWhatsapp ?? lead.primaryPhone ?? '');
  if (!phone) throw badRequest('Telefone inválido');
  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({ isValid: false, label: 'sem WhatsApp' })
      .where(
        and(
          inArray(contacts.type, ['whatsapp', 'phone']),
          eq(contacts.normalizedValue, phone.e164),
          or(eq(contacts.eventId, lead.eventId), lead.organizerId ? eq(contacts.organizerId, lead.organizerId) : sql`false`),
        ),
      );
    await tx.insert(contactHistory).values({ leadId, userId, type: 'edited', content: `Número ${phone.display} sem WhatsApp — não será mais sugerido` });
    await refreshLeadDenormalized(tx, leadId);
  });
  const [after] = await db.select({ primaryWhatsapp: leads.primaryWhatsapp, primaryPhone: leads.primaryPhone, primaryInstagram: leads.primaryInstagram, primaryEmail: leads.primaryEmail }).from(leads).where(eq(leads.id, leadId));
  return after!;
}

export async function addNote(leadId: string, content: string, userId: string | null) {
  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId));
  if (!lead) throw notFound('Lead');
  const [row] = await db.insert(contactHistory).values({ leadId, userId, type: 'note', content }).returning();
  return row!;
}

/** Registro manual de contato realizado (data informada pelo usuário). */
export async function registerContact(leadId: string, input: { channel: 'whatsapp' | 'email' | 'instagram'; at?: string | null; note?: string | null; messageId?: string | null }, userId: string | null) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw notFound('Lead');
  const at = input.at ? new Date(input.at) : new Date();
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 60_000) throw badRequest('Data de contato inválida');
  // sem messageId (botão "Registrar contato"), a última mensagem aberta no WhatsApp é a que foi enviada
  const [opened] = input.messageId
    ? [{ id: input.messageId }]
    : await db
        .select({ id: generatedMessages.id })
        .from(generatedMessages)
        .where(and(eq(generatedMessages.leadId, leadId), eq(generatedMessages.status, 'opened')))
        .orderBy(desc(generatedMessages.openedAt))
        .limit(1);
  if (opened) await db.update(generatedMessages).set({ status: 'sent', sentAt: at }).where(and(eq(generatedMessages.id, opened.id), eq(generatedMessages.leadId, leadId)));
  if (['novo', 'qualificado', 'aguardando_contato'].includes(lead.stage)) await changeStage(leadId, 'contatado', userId, { note: input.note ?? null, channel: input.channel });
  else await db.insert(contactHistory).values({ leadId, userId, type: 'contact_made', channel: input.channel, content: input.note ?? null });
  await db.update(leads).set({ lastContactAt: at }).where(eq(leads.id, leadId));
}

export async function pipelineBoard(f: Partial<LeadFilters>, perStage = 100) {
  const filters = leadFiltersSchema.parse({ ...f, page: 1, pageSize: 1 });
  const where = buildLeadWhere({ ...filters, stage: undefined });
  const cols = await Promise.all(
    leadStage.enumValues.map(async (stage) => {
      const items = await baseQuery()
        .where(and(where ?? sql`true`, eq(leads.stage, stage), stage === 'novo' ? sql`${leads.qualification} <> 'disqualified'` : sql`true`))
        .orderBy(asc(leads.stagePosition), desc(leads.score))
        .limit(perStage);
      const [{ n } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(leads)
        .innerJoin(events, eq(events.id, leads.eventId))
        .leftJoin(organizers, eq(organizers.id, leads.organizerId))
        .where(and(where ?? sql`true`, eq(leads.stage, stage), stage === 'novo' ? sql`${leads.qualification} <> 'disqualified'` : sql`true`));
      return { stage, total: n, items };
    }),
  );
  return cols;
}

export async function deleteLeads(ids: string[]) {
  if (!ids.length) return 0;
  const rows = await db.select({ eventId: leads.eventId }).from(leads).where(inArray(leads.id, ids));
  if (!rows.length) return 0;
  await db.delete(events).where(inArray(events.id, rows.map((r) => r.eventId)));
  return rows.length;
}

export const VALID_UFS = UFS;
