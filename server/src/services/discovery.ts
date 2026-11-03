import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import type { GroundedExtraction } from '../ai/extraction.js';
import { db, type Tx } from '../db/client.js';
import {
  categories,
  contactHistory,
  contacts,
  events,
  leadSources,
  leads,
  organizers,
  suppressionList,
  type FactStatus,
} from '../db/schema.js';
import type { ContactCandidate } from '../extraction/extract.js';
import {
  domainOf,
  eventBaseName,
  eventFingerprint,
  isGenericDomain,
  isGovernmentDomain,
  normalizeOrganizerName,
} from '../lib/normalize.js';
import { regionOf } from '../lib/regions.js';

export interface DiscoveryContext {
  url: string;
  title: string;
  snippet: string;
  searchResultId: string | null;
  fallbackCategoryId: number | null;
  contextEventId: string | null;
  campaignId?: number | null;
  sourceType: 'search_result' | 'event_site' | 'government' | 'news' | 'instagram_search' | 'directory' | 'ticketing' | 'other';
  httpStatus?: number | null;
  contentHash?: string | null;
  enrichedCompanyName?: string | null;
}

export interface DiscoveryOutcome {
  status: 'created' | 'merged' | 'suppressed';
  eventId: string | null;
  leadId: string | null;
}

const FACT_RANK: Record<FactStatus, number> = { not_found: 0, unconfirmed: 1, denied: 2, confirmed: 3 };
const mergeFact = (a: FactStatus, b: FactStatus): FactStatus => (FACT_RANK[b] > FACT_RANK[a] ? b : a);

export function classifySource(url: string): DiscoveryContext['sourceType'] {
  const d = domainOf(url) ?? '';
  if (d.endsWith('instagram.com')) return 'instagram_search';
  if (isGovernmentDomain(d)) return 'government';
  if (/sympla|eventbrite|ingresse|blueticket|even3|doity|bilheteria/.test(d)) return 'ticketing';
  if (/g1\.|globo|uol|noticia|news|jornal|gazeta|folha|tribuna|portal|diario|radio|tv/.test(d)) return 'news';
  if (/guia|listas|telelistas|apontador|encontra/.test(d)) return 'directory';
  return 'event_site';
}

async function isSuppressed(tx: Tx, cands: ContactCandidate[], instagram: string | null, website: string | null): Promise<boolean> {
  const checks: Array<{ type: 'phone' | 'email' | 'instagram' | 'domain'; value: string }> = [];
  for (const c of cands) {
    if (c.type === 'whatsapp' || c.type === 'phone') checks.push({ type: 'phone', value: c.normalized });
    if (c.type === 'email') checks.push({ type: 'email', value: c.normalized });
    if (c.type === 'instagram') checks.push({ type: 'instagram', value: c.normalized });
    if (c.type === 'website') checks.push({ type: 'domain', value: c.normalized });
  }
  if (instagram) checks.push({ type: 'instagram', value: instagram });
  const d = website ? domainOf(website) : null;
  if (d) checks.push({ type: 'domain', value: d });
  if (!checks.length) return false;
  const rows = await tx
    .select({ id: suppressionList.id })
    .from(suppressionList)
    .where(or(...checks.map((c) => and(eq(suppressionList.type, c.type), eq(suppressionList.value, c.value)))))
    .limit(1);
  return rows.length > 0;
}

async function resolveOrganizer(tx: Tx, g: GroundedExtraction, ctx: DiscoveryContext, state: string | null, city: string | null) {
  const o = g.data.organizer;
  const websiteDomain = g.website ? domainOf(g.website) : null;
  const orgDomain = websiteDomain && !isGenericDomain(websiteDomain) && !isGovernmentDomain(websiteDomain) ? websiteDomain : null;
  const prefeituraDomain = websiteDomain && isGovernmentDomain(websiteDomain) && o.type === 'prefeitura' ? websiteDomain : null;
  const domainKey = orgDomain ?? prefeituraDomain;
  const handle = g.instagram;
  const phones = g.contacts.filter((c) => (c.type === 'whatsapp' || c.type === 'phone') && c.isCommercial).map((c) => c.normalized);
  const name = o.name ?? o.company_name ?? ctx.enrichedCompanyName ?? null;

  const conds = [];
  if (handle) conds.push(eq(organizers.instagramHandle, handle));
  if (domainKey) conds.push(eq(organizers.websiteDomain, domainKey));
  if (name && state) conds.push(and(eq(organizers.normalizedName, normalizeOrganizerName(name)), eq(organizers.state, state)));
  let existing = conds.length ? (await tx.select().from(organizers).where(or(...conds)).limit(1))[0] : undefined;
  if (!existing && phones.length) {
    const [byPhone] = await tx
      .select({ organizerId: contacts.organizerId })
      .from(contacts)
      .where(and(inArray(contacts.type, ['whatsapp', 'phone']), inArray(contacts.normalizedValue, phones), isNotNull(contacts.organizerId)))
      .limit(1);
    if (byPhone?.organizerId) existing = (await tx.select().from(organizers).where(eq(organizers.id, byPhone.organizerId)))[0];
  }

  const label = name ?? (handle ? `@${handle}` : domainKey);
  if (!existing && !label) return null;

  const sources: Record<string, string> = {};
  if (o.name) sources.name = ctx.url;
  if (o.company_name) sources.companyName = ctx.url;
  if (o.person_name) sources.personName = ctx.url;
  if (handle) sources.instagramHandle = ctx.url;
  if (domainKey) sources.website = ctx.url;
  if (ctx.enrichedCompanyName) sources.companyName = 'BrasilAPI/Receita Federal (CNPJ publicado na fonte)';

  if (existing) {
    const patch: Partial<typeof organizers.$inferInsert> = {};
    if (!existing.companyName && (o.company_name || ctx.enrichedCompanyName)) patch.companyName = o.company_name ?? ctx.enrichedCompanyName;
    if (!existing.personName && o.person_name) patch.personName = o.person_name;
    if (!existing.instagramHandle && handle) patch.instagramHandle = handle;
    if (!existing.websiteDomain && domainKey) {
      patch.websiteDomain = domainKey;
      patch.website = g.website;
    }
    if (existing.type === 'desconhecido' && o.type !== 'desconhecido') patch.type = o.type;
    if (!existing.state && state) patch.state = state;
    if (!existing.city && city) patch.city = city;
    if (existing.name.startsWith('@') && name) {
      patch.name = name;
      patch.normalizedName = normalizeOrganizerName(name);
    }
    if (Object.keys(patch).length) {
      patch.fieldSources = { ...sources, ...existing.fieldSources };
      await tx.update(organizers).set(patch).where(eq(organizers.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await tx
    .insert(organizers)
    .values({
      name: label!,
      normalizedName: normalizeOrganizerName(label!),
      companyName: o.company_name ?? ctx.enrichedCompanyName ?? null,
      personName: o.person_name,
      type: o.type,
      city,
      state,
      website: domainKey ? g.website : null,
      websiteDomain: domainKey,
      instagramHandle: handle,
      fieldSources: sources,
    })
    .onConflictDoNothing()
    .returning({ id: organizers.id });
  if (created) return created.id;
  // corrida com outro worker: recupera pelo índice único
  const [again] = await tx
    .select({ id: organizers.id })
    .from(organizers)
    .where(or(handle ? eq(organizers.instagramHandle, handle) : sql`false`, domainKey ? eq(organizers.websiteDomain, domainKey) : sql`false`))
    .limit(1);
  return again?.id ?? null;
}

async function findExistingEvent(tx: Tx, g: GroundedExtraction, ctx: DiscoveryContext, fingerprint: string, baseName: string) {
  if (ctx.contextEventId) {
    const [e] = await tx.select().from(events).where(eq(events.id, ctx.contextEventId));
    if (e) return e;
  }
  const ev = g.data.event;
  const conds = [eq(events.fingerprint, fingerprint)];
  if (ev.state) {
    conds.push(
      and(
        eq(events.normalizedName, baseName),
        eq(events.state, ev.state),
        ev.year ? eq(events.year, ev.year) : sql`${events.year} is null`,
      )!,
    );
  }
  const wd = g.website ? domainOf(g.website) : null;
  if (wd && !isGenericDomain(wd) && ev.year) conds.push(and(eq(events.website, g.website!), eq(events.year, ev.year))!);
  if (g.instagram && ev.year) conds.push(and(eq(events.instagramHandle, g.instagram), eq(events.year, ev.year), eq(events.normalizedName, baseName))!);
  const [found] = await tx.select().from(events).where(or(...conds)).limit(1);
  return found;
}

async function upsertContacts(tx: Tx, eventId: string, organizerId: string | null, list: GroundedExtraction['contacts']) {
  for (const c of list) {
    await tx
      .insert(contacts)
      .values({
        eventId,
        organizerId,
        type: c.type,
        value: c.value,
        normalizedValue: c.normalized,
        label: c.label,
        isCommercial: c.isCommercial,
        sourceUrl: c.sourceUrl,
        sourceExcerpt: c.excerpt.slice(0, 500),
        confidence: c.confidence,
        lastVerifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [contacts.eventId, contacts.type, contacts.normalizedValue],
        targetWhere: sql`${contacts.eventId} is not null`,
        set: { lastVerifiedAt: new Date(), isValid: true, organizerId: sql`coalesce(${contacts.organizerId}, excluded.organizer_id)` },
      });
  }
}

const isMobileE164 = (v: string) => v.length === 13 && v[4] === '9';

/** Recalcula contatos principais e campos denormalizados do lead. */
export async function refreshLeadDenormalized(tx: Tx | typeof db, leadId: string) {
  const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return;
  const [ev] = await tx.select().from(events).where(eq(events.id, lead.eventId));
  if (!ev) return;
  const list = await tx
    .select()
    .from(contacts)
    .where(and(eq(contacts.isValid, true), or(eq(contacts.eventId, ev.id), ev.organizerId ? eq(contacts.organizerId, ev.organizerId) : sql`false`)));
  const best = (type: string, pred: (c: (typeof list)[number]) => boolean = () => true) =>
    list
      .filter((c) => c.type === type && pred(c))
      .sort((a, b) => Number(b.isCommercial) - Number(a.isCommercial) || b.confidence - a.confidence)[0];
  const [org] = ev.organizerId ? await tx.select().from(organizers).where(eq(organizers.id, ev.organizerId)) : [];
  const wa = best('whatsapp');
  const phone = best('phone', (c) => c.isCommercial);
  const email = best('email', (c) => c.isCommercial);
  const ig = ev.instagramHandle ?? org?.instagramHandle ?? best('instagram')?.normalizedValue ?? null;
  const site = ev.website ?? org?.website ?? (best('website') ? `https://${best('website')!.normalizedValue}` : null);
  await tx
    .update(leads)
    .set({
      organizerId: ev.organizerId,
      categoryId: ev.categoryId,
      primaryWhatsapp: wa?.normalizedValue ?? null,
      primaryPhone: phone?.normalizedValue ?? (list.find((c) => c.type === 'phone' && isMobileE164(c.normalizedValue))?.normalizedValue ?? null),
      primaryEmail: email?.normalizedValue ?? null,
      primaryInstagram: ig,
      primaryWebsite: site,
      city: ev.city,
      state: ev.state,
      region: ev.region,
      eventDate: ev.startDate,
    })
    .where(eq(leads.id, leadId));
}

async function updateOrganizerStats(tx: Tx, organizerId: string) {
  const [r] = await tx
    .select({
      n: sql<number>`count(*)::int`,
      editions: sql<number>`count(distinct ${events.normalizedName} || coalesce(${events.year}::text,''))::int`,
      names: sql<number>`count(distinct ${events.normalizedName})::int`,
    })
    .from(events)
    .where(eq(events.organizerId, organizerId));
  const recurring = (r?.n ?? 0) >= 2 && (r?.editions ?? 0) > (r?.names ?? 0);
  await tx
    .update(organizers)
    .set({ eventsCount: r?.n ?? 0, ...(recurring ? { isRecurring: true } : {}) })
    .where(eq(organizers.id, organizerId));
}

/** Persiste uma extração validada: deduplica evento/organizador, agrega fontes/contatos e cria o lead. */
export async function persistDiscovery(g: GroundedExtraction, ctx: DiscoveryContext): Promise<DiscoveryOutcome> {
  return db.transaction(async (tx) => {
    if (await isSuppressed(tx, g.contacts, g.instagram, g.website)) return { status: 'suppressed', eventId: null, leadId: null };

    const ev = g.data.event;
    let categoryId = ctx.fallbackCategoryId;
    if (ev.category_slug) {
      const [c] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, ev.category_slug));
      if (c) categoryId = c.id;
    }
    const baseName = eventBaseName(ev.name);
    const fingerprint = eventFingerprint({ name: ev.name, state: ev.state, city: ev.city, year: ev.year });
    const existing = await findExistingEvent(tx, g, ctx, fingerprint, baseName);
    const organizerId = await resolveOrganizer(tx, g, ctx, ev.state ?? existing?.state ?? null, ev.city ?? existing?.city ?? null);

    const fieldSources: Record<string, string> = {};
    for (const k of ['name', 'city', 'state', 'start_date', 'edition', 'voting_evidence'] as const) {
      const v = k === 'name' ? ev.name : (ev as Record<string, unknown>)[k];
      if (v) fieldSources[k] = ctx.url;
    }

    let eventId: string;
    let created = false;
    if (existing) {
      eventId = existing.id;
      const patch: Partial<typeof events.$inferInsert> = {
        hasContest: mergeFact(existing.hasContest, ev.has_contest),
        hasParticipants: mergeFact(existing.hasParticipants, ev.has_participants),
        registrationOpen: mergeFact(existing.registrationOpen, ev.registration_open),
        hasPopularVoting: mergeFact(existing.hasPopularVoting, ev.has_popular_voting),
        fieldSources: { ...fieldSources, ...existing.fieldSources },
      };
      if (!existing.organizerId && organizerId) patch.organizerId = organizerId;
      if (!existing.city && ev.city) patch.city = ev.city;
      if (!existing.state && ev.state) {
        patch.state = ev.state;
        patch.region = regionOf(ev.state);
      }
      if (!existing.startDate && ev.start_date) patch.startDate = ev.start_date;
      if (!existing.endDate && ev.end_date) patch.endDate = ev.end_date;
      if (!existing.year && ev.year) patch.year = ev.year;
      if (!existing.edition && ev.edition) patch.edition = ev.edition;
      if (!existing.website && g.website) patch.website = g.website;
      if (!existing.instagramHandle && g.instagram) patch.instagramHandle = g.instagram;
      if (!existing.votingEvidence && ev.voting_evidence) patch.votingEvidence = ev.voting_evidence;
      if (!existing.currentVotingMethod && ev.current_voting_method) patch.currentVotingMethod = ev.current_voting_method;
      if (!existing.description && ev.description) patch.description = ev.description.slice(0, 1000);
      if (existing.status === 'unknown' && ev.status !== 'unknown') patch.status = ev.status;
      if (!existing.categoryId && categoryId) patch.categoryId = categoryId;
      await tx.update(events).set(patch).where(eq(events.id, eventId));
    } else {
      const [prev] = ev.state
        ? await tx
            .select({ id: events.id })
            .from(events)
            .where(and(eq(events.normalizedName, baseName), eq(events.state, ev.state), ev.year ? ne(events.year, ev.year) : sql`false`))
            .orderBy(sql`${events.year} desc nulls last`)
            .limit(1)
        : [];
      const [row] = await tx
        .insert(events)
        .values({
          organizerId,
          categoryId,
          name: ev.name.slice(0, 300),
          normalizedName: baseName,
          edition: ev.edition,
          year: ev.year,
          city: ev.city,
          state: ev.state,
          region: regionOf(ev.state),
          startDate: ev.start_date,
          endDate: ev.end_date,
          status: ev.status,
          registrationOpen: ev.registration_open,
          hasContest: ev.has_contest,
          hasParticipants: ev.has_participants,
          hasPopularVoting: ev.has_popular_voting,
          votingEvidence: ev.voting_evidence,
          currentVotingMethod: ev.current_voting_method,
          description: ev.description?.slice(0, 1000) ?? null,
          website: g.website,
          instagramHandle: g.instagram,
          fingerprint,
          fieldSources,
          previousEditionId: prev?.id ?? null,
          lastVerifiedAt: new Date(),
          siteAvailable: ctx.httpStatus ? ctx.httpStatus < 400 : null,
        })
        .onConflictDoNothing()
        .returning({ id: events.id });
      if (!row) {
        const [again] = await tx.select({ id: events.id }).from(events).where(eq(events.fingerprint, fingerprint));
        eventId = again!.id;
      } else {
        eventId = row.id;
        created = true;
      }
    }

    await tx
      .insert(leadSources)
      .values({
        eventId,
        searchResultId: ctx.searchResultId,
        url: ctx.url,
        domain: domainOf(ctx.url) ?? '',
        title: ctx.title.slice(0, 500),
        type: ctx.sourceType,
        excerpt: ctx.snippet.slice(0, 1000),
        httpStatus: ctx.httpStatus ?? null,
        contentHash: ctx.contentHash ?? null,
        fetchedAt: new Date(),
      })
      .onConflictDoNothing();

    const [evRow] = await tx.select({ organizerId: events.organizerId }).from(events).where(eq(events.id, eventId));
    await upsertContacts(tx, eventId, evRow?.organizerId ?? organizerId, g.contacts);
    if (evRow?.organizerId) await updateOrganizerStats(tx, evRow.organizerId);

    let [lead] = await tx.select({ id: leads.id }).from(leads).where(eq(leads.eventId, eventId));
    let leadCreated = false;
    if (!lead) {
      [lead] = await tx
        .insert(leads)
        .values({ eventId, campaignId: ctx.campaignId ?? null })
        .onConflictDoNothing()
        .returning({ id: leads.id });
      if (lead) {
        leadCreated = true;
        await tx.insert(contactHistory).values({ leadId: lead.id, type: 'created', content: `Descoberto via ${ctx.url}` });
      } else {
        [lead] = await tx.select({ id: leads.id }).from(leads).where(eq(leads.eventId, eventId));
      }
    }
    await refreshLeadDenormalized(tx, lead!.id);
    return { status: created || leadCreated ? 'created' : 'merged', eventId, leadId: lead!.id };
  });
}
