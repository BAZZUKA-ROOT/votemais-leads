import { beforeEach, describe, expect, it } from 'vitest';
import type { GroundedExtraction } from '../src/ai/extraction.js';
import { persistDiscovery } from '../src/services/discovery.js';
import { login, type Client } from './api-client.js';
import { createAdmin, resetDb } from './helpers.js';

function g(name: string, ig: string): GroundedExtraction {
  return {
    accepted: true,
    dropped: [],
    website: null,
    instagram: ig,
    contacts: [{ type: 'instagram', value: `@${ig}`, normalized: ig, excerpt: '', sourceUrl: 'https://x.com.br', confidence: 80, isCommercial: true, label: null }],
    data: {
      is_event_opportunity: true, discard_reason: null,
      event: { name, edition: null, year: 2027, city: 'Uberaba', state: 'MG', start_date: null, end_date: null, category_slug: 'rainha-da-expo', status: 'scheduled', description: null, has_contest: 'confirmed', has_participants: 'not_found', registration_open: 'not_found', has_popular_voting: 'confirmed', voting_evidence: null, current_voting_method: null },
      organizer: { name: 'Expo Uberaba Org', company_name: null, person_name: null, type: 'associacao', evidence: null },
      contacts: [], official_website: null, official_instagram: ig, cnpj: null, facts: [], hypotheses: [], followup_queries: [],
    },
  };
}

describe('catálogo: eventos, organizadores, categorias, campanhas', () => {
  let c: Client;
  beforeEach(async () => {
    await resetDb();
    await createAdmin();
    c = await login();
    await persistDiscovery(g('Rainha da Expo Uberaba 2027', 'expouberaba'), { url: 'https://a.com.br', title: '', snippet: '', searchResultId: null, fallbackCategoryId: null, contextEventId: null, sourceType: 'event_site' });
    await persistDiscovery(g('Garota Expo Uberaba 2027', 'expouberaba'), { url: 'https://b.com.br', title: '', snippet: '', searchResultId: null, fallbackCategoryId: null, contextEventId: null, sourceType: 'news' });
  });

  it('lista eventos com contagem de fontes e filtros', async () => {
    const r = await c.get('/api/events?state=MG');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    expect(r.body.items[0].sources).toBe(1);
    expect((await c.get('/api/events?voting=confirmed')).body.total).toBe(2);
  });

  it('organizador com vários eventos; detalhe e edição', async () => {
    const r = await c.get('/api/organizers');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.items[0]).toMatchObject({ eventsCount: 2, instagramHandle: 'expouberaba' });
    const d = await c.get(`/api/organizers/${r.body.items[0].id}`);
    expect(d.body.events).toHaveLength(2);
    expect((await c.send('PATCH', `/api/organizers/${r.body.items[0].id}`, { personName: 'Responsável' })).body.personName).toBe('Responsável');
  });

  it('CRUD de categorias com palavras-chave', async () => {
    const list = await c.get('/api/categories');
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(32);
    expect(list.body.find((x: any) => x.slug === 'rainha-da-expo').leads).toBe(2);
    const created = await c.send('POST', '/api/categories', { name: 'Rainha do Carnaval', group: 'municipal', keywords: ['Rainha do Carnaval'], priority: 7 });
    expect(created.status).toBe(200);
    expect(created.body.slug).toBe('rainha-do-carnaval');
    expect((await c.send('POST', '/api/categories', { name: 'Rainha do Carnaval', group: 'municipal', keywords: ['x'] })).status).toBe(400);
    expect((await c.send('PUT', `/api/categories/${created.body.id}`, { keywords: ['Rainha do Carnaval', 'Rei Momo'] })).body.keywords).toHaveLength(2);
    expect((await c.send('DELETE', `/api/categories/${created.body.id}`)).body.deleted).toBe(true);
    const used = list.body.find((x: any) => x.slug === 'rainha-da-expo');
    expect((await c.send('DELETE', `/api/categories/${used.id}`)).body).toMatchObject({ deleted: false, deactivated: true });
  });

  it('campanhas: criar, vincular leads e contar', async () => {
    const camp = await c.send('POST', '/api/campaigns', { name: 'Expo MG', states: ['MG'] });
    expect(camp.status).toBe(200);
    const leads = await c.get('/api/leads');
    const ids = leads.body.items.map((l: any) => l.id);
    expect((await c.send('POST', `/api/campaigns/${camp.body.id}/leads`, { leadIds: ids })).body.affected).toBe(2);
    const list = await c.get('/api/campaigns');
    expect(list.body[0].leads).toBe(2);
    expect((await c.get(`/api/leads?campaignId=${camp.body.id}`)).body.total).toBe(2);
  });

  it('relatórios, consumo, logs e integrações respondem', async () => {
    for (const url of ['/api/reports', '/api/usage?days=30', '/api/logs', '/api/integrations', '/api/control', '/api/history', '/api/messages', '/api/automation/schedules', '/api/suppression', '/api/users']) {
      const r = await c.get(url);
      expect(r.status, url).toBe(200);
    }
    const integ = await c.get('/api/integrations');
    expect(integ.body.system.database.ok).toBe(true);
    expect(integ.body.integrations).toHaveLength(10);
  });
});
