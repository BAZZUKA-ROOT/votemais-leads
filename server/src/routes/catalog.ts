import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idParam, intIdParam, parse } from '../api/plugins.js';
import { db } from '../db/client.js';
import { campaigns, categories, contacts, events, leads, organizers } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import { normalizeInstagram, normalizeOrganizerName, slugify } from '../lib/normalize.js';
import { UFS } from '../lib/regions.js';

const like = (v: string) => `%${v.replace(/[%_]/g, '\\$&')}%`;
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(30) };

const categorySchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/).optional(),
  group: z.enum(['beleza', 'rodeio', 'municipal', 'premiacao', 'outros']),
  description: z.string().max(500).nullable().optional(),
  keywords: z.array(z.string().min(2).max(120)).max(30),
  negativeKeywords: z.array(z.string().min(2).max(120)).max(30).default([]),
  priority: z.number().int().min(1).max(10).default(5),
  isActive: z.boolean().default(true),
});

const campaignSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).nullable().optional(),
  categoryIds: z.array(z.number().int()).max(50).default([]),
  states: z.array(z.enum(UFS as [string, ...string[]])).max(27).default([]),
  isActive: z.boolean().default(true),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function catalogRoutes(app: FastifyInstance) {
  // ---------- eventos ----------
  app.get('/api/events', async (req) => {
    const q = parse(
      z.object({
        q: z.string().max(200).optional(),
        state: z.string().max(2).optional(),
        categoryId: z.coerce.number().int().optional(),
        status: z.enum(['scheduled', 'ongoing', 'past', 'cancelled', 'unknown']).optional(),
        voting: z.enum(['confirmed', 'unconfirmed', 'not_found', 'denied']).optional(),
        year: z.coerce.number().int().optional(),
        ...page,
      }),
      req.query,
    );
    const where = and(
      q.q ? or(ilike(events.name, like(q.q)), ilike(events.city, like(q.q))) : undefined,
      q.state ? eq(events.state, q.state.toUpperCase()) : undefined,
      q.categoryId ? eq(events.categoryId, q.categoryId) : undefined,
      q.status ? eq(events.status, q.status) : undefined,
      q.voting ? eq(events.hasPopularVoting, q.voting) : undefined,
      q.year ? eq(events.year, q.year) : undefined,
    );
    const items = await db
      .select({
        id: events.id,
        name: events.name,
        edition: events.edition,
        year: events.year,
        city: events.city,
        state: events.state,
        startDate: events.startDate,
        status: events.status,
        hasContest: events.hasContest,
        hasPopularVoting: events.hasPopularVoting,
        registrationOpen: events.registrationOpen,
        website: events.website,
        instagramHandle: events.instagramHandle,
        siteAvailable: events.siteAvailable,
        lastVerifiedAt: events.lastVerifiedAt,
        createdAt: events.createdAt,
        organizerId: events.organizerId,
        organizerName: organizers.name,
        categoryName: categories.name,
        leadId: leads.id,
        sources: sql<number>`(select count(*) from lead_sources ls where ls.event_id = ${events.id})::int`,
      })
      .from(events)
      .leftJoin(organizers, eq(organizers.id, events.organizerId))
      .leftJoin(categories, eq(categories.id, events.categoryId))
      .leftJoin(leads, eq(leads.eventId, events.id))
      .where(where)
      .orderBy(desc(events.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(events).where(where);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  // ---------- organizadores ----------
  app.get('/api/organizers', async (req) => {
    const q = parse(
      z.object({
        q: z.string().max(200).optional(),
        state: z.string().max(2).optional(),
        type: z.string().max(30).optional(),
        recurring: z.enum(['true', 'false']).optional(),
        ...page,
      }),
      req.query,
    );
    const where = and(
      q.q ? or(ilike(organizers.name, like(q.q)), ilike(organizers.instagramHandle, like(q.q)), ilike(organizers.companyName, like(q.q))) : undefined,
      q.state ? eq(organizers.state, q.state.toUpperCase()) : undefined,
      q.type ? eq(organizers.type, q.type as never) : undefined,
      q.recurring ? eq(organizers.isRecurring, q.recurring === 'true') : undefined,
    );
    const items = await db
      .select({
        id: organizers.id,
        name: organizers.name,
        companyName: organizers.companyName,
        personName: organizers.personName,
        type: organizers.type,
        city: organizers.city,
        state: organizers.state,
        website: organizers.website,
        instagramHandle: organizers.instagramHandle,
        isRecurring: organizers.isRecurring,
        eventsCount: organizers.eventsCount,
        createdAt: organizers.createdAt,
        contactsCount: sql<number>`(select count(*) from contacts c where c.organizer_id = ${organizers.id})::int`,
      })
      .from(organizers)
      .where(where)
      .orderBy(desc(organizers.eventsCount), desc(organizers.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(organizers).where(where);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get('/api/organizers/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const [org] = await db.select().from(organizers).where(eq(organizers.id, id));
    if (!org) throw notFound('Organizador');
    const evs = await db
      .select({ id: events.id, name: events.name, year: events.year, city: events.city, state: events.state, status: events.status, leadId: leads.id, stage: leads.stage, score: leads.score })
      .from(events)
      .leftJoin(leads, eq(leads.eventId, events.id))
      .where(eq(events.organizerId, id))
      .orderBy(desc(events.year));
    const cts = await db.select().from(contacts).where(eq(contacts.organizerId, id)).orderBy(desc(contacts.confidence));
    return { organizer: org, events: evs, contacts: cts };
  });

  app.patch('/api/organizers/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z
        .object({
          name: z.string().min(2).max(200),
          companyName: z.string().max(200).nullable(),
          personName: z.string().max(200).nullable(),
          type: z.enum(['empresa', 'prefeitura', 'associacao', 'produtora', 'sindicato_rural', 'midia', 'pessoa', 'desconhecido']),
          instagramHandle: z.string().max(60).nullable(),
          notes: z.string().max(5000).nullable(),
        })
        .partial()
        .strict(),
      req.body,
    );
    const patch: Record<string, unknown> = { ...body };
    if (body.name) patch.normalizedName = normalizeOrganizerName(body.name);
    if (body.instagramHandle !== undefined) patch.instagramHandle = body.instagramHandle ? normalizeInstagram(body.instagramHandle) : null;
    const [row] = await db.update(organizers).set(patch).where(eq(organizers.id, id)).returning();
    if (!row) throw notFound('Organizador');
    return row;
  });

  // ---------- categorias ----------
  app.get('/api/categories', async () =>
    db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        group: categories.group,
        description: categories.description,
        keywords: categories.keywords,
        negativeKeywords: categories.negativeKeywords,
        priority: categories.priority,
        isActive: categories.isActive,
        leads: sql<number>`(select count(*) from leads l where l.category_id = ${categories.id})::int`,
      })
      .from(categories)
      .orderBy(asc(categories.group), desc(categories.priority), asc(categories.name)),
  );

  app.post('/api/categories', async (req) => {
    const body = parse(categorySchema, req.body);
    const slug = body.slug ?? slugify(body.name);
    const [row] = await db.insert(categories).values({ ...body, slug }).onConflictDoNothing().returning();
    if (!row) throw badRequest('Já existe uma categoria com esse identificador');
    return row;
  });

  app.put('/api/categories/:id', async (req) => {
    const { id } = parse(intIdParam, req.params);
    const body = parse(categorySchema.partial(), req.body);
    const [row] = await db.update(categories).set(body).where(eq(categories.id, id)).returning();
    if (!row) throw notFound('Categoria');
    return row;
  });

  app.delete('/api/categories/:id', async (req) => {
    const { id } = parse(intIdParam, req.params);
    const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(events).where(eq(events.categoryId, id));
    if ((used?.n ?? 0) > 0) {
      await db.update(categories).set({ isActive: false }).where(eq(categories.id, id));
      return { deleted: false, deactivated: true };
    }
    await db.delete(categories).where(eq(categories.id, id));
    return { deleted: true };
  });

  // ---------- campanhas ----------
  app.get('/api/campaigns', async () =>
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        description: campaigns.description,
        categoryIds: campaigns.categoryIds,
        states: campaigns.states,
        isActive: campaigns.isActive,
        startsAt: campaigns.startsAt,
        endsAt: campaigns.endsAt,
        leads: sql<number>`(select count(*) from leads l where l.campaign_id = ${campaigns.id})::int`,
        converted: sql<number>`(select count(*) from leads l where l.campaign_id = ${campaigns.id} and l.stage = 'cliente')::int`,
      })
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt)),
  );
  app.post('/api/campaigns', async (req) => {
    const [row] = await db.insert(campaigns).values(parse(campaignSchema, req.body)).returning();
    return row;
  });
  app.put('/api/campaigns/:id', async (req) => {
    const { id } = parse(intIdParam, req.params);
    const [row] = await db.update(campaigns).set(parse(campaignSchema.partial(), req.body)).where(eq(campaigns.id, id)).returning();
    if (!row) throw notFound('Campanha');
    return row;
  });
  app.delete('/api/campaigns/:id', async (req) => {
    const { id } = parse(intIdParam, req.params);
    await db.delete(campaigns).where(eq(campaigns.id, id));
    return { ok: true };
  });
  app.post('/api/campaigns/:id/leads', async (req) => {
    const { id } = parse(intIdParam, req.params);
    const body = parse(z.object({ leadIds: z.array(z.string().uuid()).min(1).max(500) }), req.body);
    const res = await db.update(leads).set({ campaignId: id }).where(inArray(leads.id, body.leadIds)).returning({ id: leads.id });
    return { affected: res.length };
  });
}
