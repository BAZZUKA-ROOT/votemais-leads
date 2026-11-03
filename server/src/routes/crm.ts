import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idParam, parse, userId } from '../api/plugins.js';
import { isAiReady } from '../ai/client.js';
import { db } from '../db/client.js';
import { contactHistory, events, followUps, generatedMessages, leads } from '../db/schema.js';
import { IntegrationUnavailableError, notFound } from '../lib/errors.js';
import { generateMessage } from '../services/analysis.js';
import { recomputeNextFollowUp } from '../services/maintenance.js';

export async function crmRoutes(app: FastifyInstance) {
  // ---------- mensagens ----------
  app.get('/api/messages', async (req) => {
    const q = parse(
      z.object({
        status: z.enum(['draft', 'opened', 'sent', 'discarded']).optional(),
        kind: z.enum(['initial', 'followup']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(30),
      }),
      req.query,
    );
    const where = and(q.status ? eq(generatedMessages.status, q.status) : undefined, q.kind ? eq(generatedMessages.kind, q.kind) : undefined);
    const items = await db
      .select({
        id: generatedMessages.id,
        leadId: generatedMessages.leadId,
        kind: generatedMessages.kind,
        channel: generatedMessages.channel,
        approach: generatedMessages.approach,
        content: generatedMessages.content,
        editedContent: generatedMessages.editedContent,
        status: generatedMessages.status,
        model: generatedMessages.model,
        openedAt: generatedMessages.openedAt,
        sentAt: generatedMessages.sentAt,
        createdAt: generatedMessages.createdAt,
        eventName: events.name,
        city: leads.city,
        state: leads.state,
        primaryWhatsapp: leads.primaryWhatsapp,
        primaryPhone: leads.primaryPhone,
        stage: leads.stage,
      })
      .from(generatedMessages)
      .innerJoin(leads, eq(leads.id, generatedMessages.leadId))
      .innerJoin(events, eq(events.id, leads.eventId))
      .where(where)
      .orderBy(desc(generatedMessages.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(generatedMessages).where(where);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.patch('/api/messages/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ editedContent: z.string().min(1).max(4000).nullable().optional(), status: z.enum(['draft', 'discarded']).optional() }), req.body);
    const [row] = await db.update(generatedMessages).set(body).where(eq(generatedMessages.id, id)).returning();
    if (!row) throw notFound('Mensagem');
    return row;
  });

  app.post('/api/messages/:id/regenerate', async (req) => {
    const { id } = parse(idParam, req.params);
    const [m] = await db.select().from(generatedMessages).where(eq(generatedMessages.id, id));
    if (!m) throw notFound('Mensagem');
    if (!(await isAiReady())) throw new IntegrationUnavailableError('anthropic', 'Configure a integração de IA para regenerar mensagens.');
    if (m.status === 'draft') await db.update(generatedMessages).set({ status: 'discarded' }).where(eq(generatedMessages.id, id));
    return generateMessage(m.leadId, m.kind);
  });

  // ---------- follow-ups ----------
  app.get('/api/followups', async (req) => {
    const q = parse(
      z.object({
        status: z.enum(['pending', 'done', 'cancelled']).optional(),
        range: z.enum(['overdue', 'today', 'week', 'all']).default('all'),
      }),
      req.query,
    );
    const now = new Date();
    const endToday = new Date(now);
    endToday.setHours(23, 59, 59, 999);
    const conds = [q.status ? eq(followUps.status, q.status) : undefined];
    if (q.range === 'overdue') conds.push(lte(followUps.dueAt, now), eq(followUps.status, 'pending'));
    if (q.range === 'today') conds.push(lte(followUps.dueAt, endToday), gte(followUps.dueAt, new Date(now.toDateString())));
    if (q.range === 'week') conds.push(lte(followUps.dueAt, new Date(now.getTime() + 7 * 86400_000)));
    return db
      .select({
        id: followUps.id,
        leadId: followUps.leadId,
        dueAt: followUps.dueAt,
        title: followUps.title,
        notes: followUps.notes,
        suggestedMessage: followUps.suggestedMessage,
        status: followUps.status,
        completedAt: followUps.completedAt,
        eventName: events.name,
        city: leads.city,
        state: leads.state,
        stage: leads.stage,
        primaryWhatsapp: leads.primaryWhatsapp,
      })
      .from(followUps)
      .innerJoin(leads, eq(leads.id, followUps.leadId))
      .innerJoin(events, eq(events.id, leads.eventId))
      .where(and(...conds))
      .orderBy(asc(followUps.dueAt))
      .limit(500);
  });

  app.post('/api/followups', async (req) => {
    const body = parse(
      z.object({ leadId: z.string().uuid(), dueAt: z.string().datetime({ offset: true }), title: z.string().min(2).max(200), notes: z.string().max(2000).nullable().optional() }),
      req.body,
    );
    const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, body.leadId));
    if (!lead) throw notFound('Lead');
    const [row] = await db.insert(followUps).values({ ...body, dueAt: new Date(body.dueAt), userId: userId(req) }).returning();
    await db.insert(contactHistory).values({ leadId: body.leadId, userId: userId(req), type: 'followup_created', content: body.title });
    await recomputeNextFollowUp(body.leadId);
    return row;
  });

  app.patch('/api/followups/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        status: z.enum(['pending', 'done', 'cancelled']).optional(),
        dueAt: z.string().datetime({ offset: true }).optional(),
        title: z.string().min(2).max(200).optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
      req.body,
    );
    const [row] = await db
      .update(followUps)
      .set({
        status: body.status,
        title: body.title,
        notes: body.notes,
        ...(body.dueAt ? { dueAt: new Date(body.dueAt) } : {}),
        ...(body.status === 'done' ? { completedAt: new Date() } : body.status ? { completedAt: null } : {}),
      })
      .where(eq(followUps.id, id))
      .returning();
    if (!row) throw notFound('Follow-up');
    if (body.status === 'done') await db.insert(contactHistory).values({ leadId: row.leadId, userId: userId(req), type: 'followup_done', content: row.title });
    await recomputeNextFollowUp(row.leadId);
    return row;
  });

  app.post('/api/followups/:id/suggest', async (req) => {
    const { id } = parse(idParam, req.params);
    const [f] = await db.select().from(followUps).where(eq(followUps.id, id));
    if (!f) throw notFound('Follow-up');
    if (!(await isAiReady())) throw new IntegrationUnavailableError('anthropic', 'Configure a integração de IA para sugerir follow-ups.');
    const msg = await generateMessage(f.leadId, 'followup', f.id);
    return { message: msg };
  });

  app.get('/api/history', async (req) => {
    const q = parse(z.object({ types: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    const types = q.types?.split(',').filter(Boolean);
    return db
      .select({ id: contactHistory.id, leadId: contactHistory.leadId, type: contactHistory.type, content: contactHistory.content, createdAt: contactHistory.createdAt, eventName: events.name, toStage: contactHistory.toStage })
      .from(contactHistory)
      .innerJoin(leads, eq(leads.id, contactHistory.leadId))
      .innerJoin(events, eq(events.id, leads.eventId))
      .where(types?.length ? inArray(contactHistory.type, types as never) : undefined)
      .orderBy(desc(contactHistory.createdAt))
      .limit(q.limit);
  });
}
