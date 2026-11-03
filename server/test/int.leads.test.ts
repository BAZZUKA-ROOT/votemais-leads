import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ExtractionOutput, GroundedExtraction } from '../src/ai/extraction.js';
import { db } from '../src/db/client.js';
import { contactHistory, contacts, events, followUps, generatedMessages, leads, suppressionList } from '../src/db/schema.js';
import { persistDiscovery } from '../src/services/discovery.js';
import { saveIntegration } from '../src/services/integrations.js';
import { login, type Client } from './api-client.js';
import { createAdmin, resetDb } from './helpers.js';

function grounded(name: string, state: string, opts: { phone?: string; ig?: string; email?: string; org?: string } = {}): GroundedExtraction {
  const data = {
    is_event_opportunity: true,
    discard_reason: null,
    event: {
      name, edition: null, year: 2027, city: 'Cidade ' + state, state, start_date: '2027-06-01', end_date: null, category_slug: 'rainha-do-rodeio',
      status: 'scheduled', description: null, has_contest: 'confirmed', has_participants: 'unconfirmed', registration_open: 'not_found',
      has_popular_voting: 'unconfirmed', voting_evidence: null, current_voting_method: null,
    },
    organizer: { name: opts.org ?? null, company_name: null, person_name: null, type: 'produtora', evidence: null },
    contacts: [], official_website: null, official_instagram: opts.ig ?? null, cnpj: null, facts: [], hypotheses: [], followup_queries: [],
  } as ExtractionOutput;
  const list: GroundedExtraction['contacts'] = [];
  if (opts.phone) list.push({ type: 'whatsapp', value: opts.phone, normalized: opts.phone, excerpt: 'whats', sourceUrl: 'https://fonte.com.br', confidence: 90, isCommercial: true, label: null });
  if (opts.email) list.push({ type: 'email', value: opts.email, normalized: opts.email, excerpt: 'email', sourceUrl: 'https://fonte.com.br', confidence: 90, isCommercial: true, label: null });
  if (opts.ig) list.push({ type: 'instagram', value: `@${opts.ig}`, normalized: opts.ig, excerpt: 'ig', sourceUrl: 'https://fonte.com.br', confidence: 90, isCommercial: true, label: null });
  return { accepted: true, data, contacts: list, website: null, instagram: opts.ig ?? null, dropped: [] };
}

const ctx = (url: string) => ({ url, title: 't', snippet: 's', searchResultId: null, fallbackCategoryId: null, contextEventId: null, sourceType: 'event_site' as const });

describe('gestão de leads, filtros, pipeline e WhatsApp', () => {
  let c: Client;
  let leadA: string;
  let leadB: string;

  beforeEach(async () => {
    await resetDb();
    await createAdmin();
    c = await login();
    leadA = (await persistDiscovery(grounded('Rainha do Rodeio de Barretos 2027', 'SP', { phone: '5517998887777', ig: 'rodeiobarretos', org: 'Barretos Produções' }), ctx('https://a.com.br'))).leadId!;
    leadB = (await persistDiscovery(grounded('Rainha do Rodeio de Jaguariúna 2027', 'SP', { email: 'contato@rodeiojag.com.br' }), ctx('https://b.com.br'))).leadId!;
    await persistDiscovery(grounded('Rainha da Festa do Peão de Caruaru 2027', 'PE', {}), ctx('https://c.com.br'));
    await db.update(leads).set({ score: 85 }).where(eq(leads.id, leadA));
    await db.update(leads).set({ score: 40 }).where(eq(leads.id, leadB));
  });

  it('lista com filtros combinados', async () => {
    expect((await c.get('/api/leads')).body.total).toBe(3);
    expect((await c.get('/api/leads?state=SP')).body.total).toBe(2);
    expect((await c.get('/api/leads?region=Nordeste')).body.total).toBe(1);
    expect((await c.get('/api/leads?hasWhatsapp=true')).body.items.map((i: any) => i.id)).toEqual([leadA]);
    expect((await c.get('/api/leads?hasEmail=true')).body.items.map((i: any) => i.id)).toEqual([leadB]);
    expect((await c.get('/api/leads?hasInstagram=false')).body.total).toBe(2);
    expect((await c.get('/api/leads?scoreMin=50')).body.total).toBe(1);
    expect((await c.get('/api/leads?q=jaguari')).body.total).toBe(1);
    expect((await c.get('/api/leads?eventFrom=2027-01-01&eventTo=2027-12-31')).body.total).toBe(3);
    expect((await c.get('/api/leads?categoryId=9')).body.total).toBe(3);
    expect((await c.get('/api/leads?year=2027')).body.total).toBe(3);
    expect((await c.get('/api/leads?year=2026')).body.total).toBe(0);
    expect((await c.get('/api/leads?organizerType=produtora')).body.total).toBe(1);
    const sorted = await c.get('/api/leads?sort=score&dir=desc');
    expect(sorted.body.items[0].id).toBe(leadA);
    const paged = await c.get('/api/leads?pageSize=2&page=2');
    expect(paged.body.items).toHaveLength(1);
  });

  it('detalhe traz evento, organizador, contatos com fonte e histórico', async () => {
    const r = await c.get(`/api/leads/${leadA}`);
    expect(r.status).toBe(200);
    expect(r.body.event.name).toBe('Rainha do Rodeio de Barretos 2027');
    expect(r.body.organizer.name).toBe('Barretos Produções');
    expect(r.body.contacts.every((x: any) => x.sourceUrl)).toBe(true);
    expect(r.body.history[0].type).toBe('created');
    expect((await c.get('/api/leads/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  it('edita informações e adiciona/remove contatos', async () => {
    const r = await c.send('PATCH', `/api/leads/${leadB}`, { notes: 'ligar à tarde', event: { city: 'Jaguariúna' }, organizer: { name: 'Rodeio Jaguariúna Org' } });
    expect(r.status).toBe(200);
    expect(r.body.lead.notes).toBe('ligar à tarde');
    expect(r.body.event.city).toBe('Jaguariúna');
    expect(r.body.organizer.name).toBe('Rodeio Jaguariúna Org');
    expect(r.body.event.fieldSources.city).toBe('edição manual');
    expect((await c.send('POST', `/api/leads/${leadB}/contacts`, { type: 'whatsapp', value: '19 99777-6655' })).status).toBe(200);
    const d = await c.get(`/api/leads/${leadB}`);
    expect(d.body.lead.primaryWhatsapp).toBe('5519997776655');
    const contact = d.body.contacts.find((x: any) => x.type === 'whatsapp');
    expect((await c.send('POST', `/api/leads/${leadB}/contacts`, { type: 'phone', value: '123' })).status).toBe(400);
    expect((await c.send('DELETE', `/api/leads/${leadB}/contacts/${contact.id}`)).status).toBe(200);
    expect((await c.get(`/api/leads/${leadB}`)).body.lead.primaryWhatsapp).toBeNull();
  });

  it('abre WhatsApp com mensagem codificada, registra e nunca envia', async () => {
    const [m] = await db.insert(generatedMessages).values({ leadId: leadA, content: 'Olá! Conheça https://votemais.online?' }).returning();
    const r = await c.send('POST', `/api/leads/${leadA}/open`, { channel: 'whatsapp', messageId: m!.id, text: 'Olá! Texto editado & revisado\nhttps://votemais.online' });
    expect(r.status).toBe(200);
    expect(r.body.url.startsWith('https://wa.me/5517998887777?text=')).toBe(true);
    expect(new URL(r.body.url).searchParams.get('text')).toBe('Olá! Texto editado & revisado\nhttps://votemais.online');
    const [msg] = await db.select().from(generatedMessages).where(eq(generatedMessages.id, m!.id));
    expect(msg).toMatchObject({ status: 'opened', editedContent: 'Olá! Texto editado & revisado\nhttps://votemais.online' });
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadA));
    expect(lead!.stage).toBe('aguardando_contato');
    const hist = await db.select().from(contactHistory).where(eq(contactHistory.leadId, leadA));
    expect(hist.some((h) => h.type === 'whatsapp_opened')).toBe(true);
    // sem WhatsApp => erro claro
    expect((await c.send('POST', `/api/leads/${leadB}/open`, { channel: 'whatsapp' })).status).toBe(400);
    expect((await c.send('POST', `/api/leads/${leadA}/open`, { channel: 'instagram' })).body.url).toBe('https://www.instagram.com/rodeiobarretos/');
    expect((await c.send('POST', `/api/leads/${leadB}/open`, { channel: 'email' })).body.url).toMatch(/^mailto:contato@rodeiojag\.com\.br\?subject=/);
  });

  it('pipeline: mover estágios registra histórico e agenda follow-up ao contatar', async () => {
    expect((await c.send('POST', `/api/leads/${leadA}/stage`, { stage: 'contatado' })).status).toBe(200);
    let [lead] = await db.select().from(leads).where(eq(leads.id, leadA));
    expect(lead!.stage).toBe('contatado');
    expect(lead!.lastContactAt).not.toBeNull();
    expect(lead!.nextFollowUpAt).not.toBeNull();
    const fups = await db.select().from(followUps).where(eq(followUps.leadId, leadA));
    expect(fups).toHaveLength(1);
    await c.send('POST', `/api/leads/${leadA}/stage`, { stage: 'interessado', note: 'pediu proposta' });
    await c.send('POST', `/api/leads/${leadA}/stage`, { stage: 'cliente' });
    [lead] = await db.select().from(leads).where(eq(leads.id, leadA));
    expect(lead!.stage).toBe('cliente');
    const [fu] = await db.select().from(followUps).where(eq(followUps.leadId, leadA));
    expect(fu!.status).toBe('cancelled');
    const changes = (await db.select().from(contactHistory).where(eq(contactHistory.leadId, leadA))).filter((h) => h.type === 'stage_change');
    expect(changes.map((h) => h.toStage)).toEqual(expect.arrayContaining(['contatado', 'interessado', 'cliente']));
    expect((await c.send('POST', `/api/leads/${leadA}/stage`, { stage: 'inexistente' })).status).toBe(400);
    const board = await c.get('/api/pipeline');
    expect(board.body).toHaveLength(9);
    expect(board.body.find((col: any) => col.stage === 'cliente').items[0].id).toBe(leadA);
    const dash = await c.get('/api/dashboard');
    expect(dash.body.kpis).toMatchObject({ totalLeads: 3, converted: 1, contacted: 1, conversionRate: 100, withWhatsapp: 1 });
  });

  it('registro manual de contato com data informada', async () => {
    const at = new Date(Date.now() - 3600_000).toISOString();
    expect((await c.send('POST', `/api/leads/${leadB}/contact-made`, { channel: 'email', at, note: 'enviado por e-mail' })).status).toBe(200);
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadB));
    expect(lead!.stage).toBe('contatado');
    expect(lead!.lastContactAt!.toISOString()).toBe(at);
    const future = new Date(Date.now() + 86400_000).toISOString();
    expect((await c.send('POST', `/api/leads/${leadB}/contact-made`, { at: future })).status).toBe(400);
  });

  it('follow-ups: criar, concluir e listar vencidos', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const r = await c.send('POST', '/api/followups', { leadId: leadB, dueAt: past, title: 'Ligar' });
    expect(r.status).toBe(200);
    expect((await c.get('/api/followups?range=overdue')).body).toHaveLength(1);
    expect((await c.send('PATCH', `/api/followups/${r.body.id}`, { status: 'done' })).body.status).toBe('done');
    expect((await c.get('/api/followups?range=overdue')).body).toHaveLength(0);
  });

  it('exporta CSV com proteção contra fórmulas', async () => {
    await db.update(leads).set({ notes: 'x' }).where(eq(leads.id, leadA));
    await db.update(events).set({ name: '=HYPERLINK("http://mal")' }).where(eq(events.name, 'Rainha da Festa do Peão de Caruaru 2027'));
    const r = await c.get('/api/leads/export.csv?state=SP,PE');
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toContain('text/csv');
    const lines = r.text.trim().split('\n');
    expect(lines[0]).toContain('evento;organizador;categoria');
    expect(lines).toHaveLength(4);
    expect(r.text).toContain(`"'=HYPERLINK(""http://mal"")"`);
  });

  it('exclusão LGPD remove dados e opcionalmente suprime contatos', async () => {
    const r = await c.send('DELETE', `/api/leads/${leadA}?suppress=true`);
    expect(r.status).toBe(200);
    expect(await db.$count(leads, eq(leads.id, leadA))).toBe(0);
    expect(await db.$count(contacts, eq(contacts.normalizedValue, '5517998887777'))).toBe(0);
    const sup = await db.select().from(suppressionList);
    expect(sup.map((s) => s.value)).toEqual(expect.arrayContaining(['5517998887777', 'rodeiobarretos']));
    // reaparecimento do mesmo contato é bloqueado
    const again = await persistDiscovery(grounded('Rainha do Rodeio de Barretos 2027', 'SP', { phone: '5517998887777' }), ctx('https://d.com.br'));
    expect(again.status).toBe('suppressed');
    // apagar dado pessoal específico
    const e = await c.send('POST', '/api/privacy/erase', { type: 'email', value: 'contato@rodeiojag.com.br' });
    expect(e.body.removed).toBe(1);
    expect((await c.get(`/api/leads/${leadB}`)).body.lead.primaryEmail).toBeNull();
  });

  it('ações em lote', async () => {
    const r = await c.send('POST', '/api/leads/bulk', { ids: [leadA, leadB], action: 'stage', stage: 'sem_interesse' });
    expect(r.body.affected).toBe(2);
    expect((await c.get('/api/leads?stage=sem_interesse')).body.total).toBe(2);
    await saveIntegration('rules', { enabled: false });
    expect((await c.send('POST', '/api/leads/bulk', { ids: [leadA], action: 'analyze' })).status).toBe(503);
    expect((await c.send('POST', '/api/leads/bulk', { ids: [leadA], action: 'delete' })).body.affected).toBe(1);
  });

  it('gerar mensagem sem IA configurada informa pendência (não simula)', async () => {
    await saveIntegration('rules', { enabled: false });
    const r = await c.send('POST', `/api/leads/${leadA}/messages`, { kind: 'initial' });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('integration_unavailable');
  });
});

describe('validação de URLs (XSS)', () => {
  it('rejeita esquemas não http(s) em campos de URL', async () => {
    await resetDb();
    await createAdmin();
    const c = await login();
    const { leadId } = await persistDiscovery(grounded('Rainha do Rodeio de Teste 2027', 'SP', { phone: '5511987654321' }), ctx('https://t.com.br'));
    expect((await c.send('PATCH', `/api/leads/${leadId}`, { event: { website: 'javascript:alert(1)' } })).status).toBe(400);
    expect((await c.send('POST', `/api/leads/${leadId}/contacts`, { type: 'email', value: 'a@b.com.br', sourceUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await c.send('PATCH', `/api/leads/${leadId}`, { event: { website: 'https://ok.com.br' } })).status).toBe(200);
  });
});
