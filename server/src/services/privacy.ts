import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, events, leads, organizers, suppressionList } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { domainOf, normalizeBrPhone, normalizeEmail, normalizeInstagram } from '../lib/normalize.js';

export type SuppressionType = 'phone' | 'email' | 'instagram' | 'domain';

export function normalizeSuppression(type: SuppressionType, raw: string): string | null {
  switch (type) {
    case 'phone':
      return normalizeBrPhone(raw)?.e164 ?? null;
    case 'email':
      return normalizeEmail(raw);
    case 'instagram':
      return normalizeInstagram(raw);
    case 'domain':
      return domainOf(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
  }
}

export async function addSuppression(type: SuppressionType, raw: string, reason: string | null, userId: string | null) {
  const value = normalizeSuppression(type, raw);
  if (!value) return null;
  const [row] = await db
    .insert(suppressionList)
    .values({ type, value, reason, createdBy: userId })
    .onConflictDoUpdate({ target: [suppressionList.type, suppressionList.value], set: { reason } })
    .returning();
  await applySuppression(type, value);
  return row!;
}

/** Marca leads existentes que usam o contato suprimido. */
async function applySuppression(type: SuppressionType, value: string) {
  const ctype = type === 'phone' ? ['whatsapp', 'phone'] : type === 'email' ? ['email'] : type === 'instagram' ? ['instagram'] : ['website'];
  const matches = await db
    .select({ eventId: contacts.eventId, organizerId: contacts.organizerId })
    .from(contacts)
    .where(and(inArray(contacts.type, ctype as never), eq(contacts.normalizedValue, value)));
  const eventIds = matches.map((m) => m.eventId).filter(Boolean) as string[];
  const orgIds = matches.map((m) => m.organizerId).filter(Boolean) as string[];
  if (type === 'instagram') {
    const evs = await db.select({ id: events.id }).from(events).where(eq(events.instagramHandle, value));
    eventIds.push(...evs.map((e) => e.id));
    const orgs = await db.select({ id: organizers.id }).from(organizers).where(eq(organizers.instagramHandle, value));
    orgIds.push(...orgs.map((o) => o.id));
  }
  if (type === 'domain') {
    const orgs = await db.select({ id: organizers.id }).from(organizers).where(eq(organizers.websiteDomain, value));
    orgIds.push(...orgs.map((o) => o.id));
  }
  if (!eventIds.length && !orgIds.length) return;
  await db
    .update(leads)
    .set({ isSuppressed: true })
    .where(or(eventIds.length ? inArray(leads.eventId, eventIds) : sql`false`, orgIds.length ? inArray(leads.organizerId, orgIds) : sql`false`));
}

/** Exclusão definitiva dos dados de um lead (direito de eliminação — LGPD art. 18, VI). */
export async function eraseLead(leadId: string, opts: { suppress: boolean; userId: string | null }) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw notFound('Lead');
  const evContacts = await db.select().from(contacts).where(eq(contacts.eventId, lead.eventId));
  if (opts.suppress) {
    for (const c of evContacts) {
      const t: SuppressionType | null = c.type === 'whatsapp' || c.type === 'phone' ? 'phone' : c.type === 'email' ? 'email' : c.type === 'instagram' ? 'instagram' : null;
      if (t) await addSuppression(t, c.normalizedValue, 'Solicitação de exclusão', opts.userId);
    }
  }
  const [ev] = await db.select().from(events).where(eq(events.id, lead.eventId));
  await db.delete(events).where(eq(events.id, lead.eventId)); // cascata: lead, contatos, fontes, análises, mensagens, histórico
  if (ev?.organizerId) {
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(events).where(eq(events.organizerId, ev.organizerId));
    if (n === 0) await db.delete(organizers).where(eq(organizers.id, ev.organizerId));
  }
  return { deletedContacts: evContacts.length };
}

/** Remove um contato específico de toda a base (pedido do titular) e o adiciona à supressão. */
export async function erasePersonalData(type: SuppressionType, raw: string, userId: string | null) {
  const value = normalizeSuppression(type, raw);
  if (!value) return { removed: 0 };
  const ctype = type === 'phone' ? ['whatsapp', 'phone'] : type === 'email' ? ['email'] : type === 'instagram' ? ['instagram'] : ['website'];
  const removed = await db
    .delete(contacts)
    .where(and(inArray(contacts.type, ctype as never), eq(contacts.normalizedValue, value)))
    .returning({ eventId: contacts.eventId });
  if (type === 'instagram') {
    await db.update(events).set({ instagramHandle: null }).where(eq(events.instagramHandle, value));
    await db.update(organizers).set({ instagramHandle: null }).where(eq(organizers.instagramHandle, value));
  }
  await addSuppression(type, value, 'Exclusão de dados pessoais', userId);
  if (type === 'phone') {
    await db.update(leads).set({ primaryWhatsapp: null }).where(eq(leads.primaryWhatsapp, value));
    await db.update(leads).set({ primaryPhone: null }).where(eq(leads.primaryPhone, value));
  } else if (type === 'email') {
    await db.update(leads).set({ primaryEmail: null }).where(eq(leads.primaryEmail, value));
  } else if (type === 'instagram') {
    await db.update(leads).set({ primaryInstagram: null }).where(eq(leads.primaryInstagram, value));
  }
  return { removed: removed.length };
}
