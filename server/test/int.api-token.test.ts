import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { events, leads, searchResults } from '../src/db/schema.js';
import { processResult } from '../src/services/search-runner.js';
import { updateSettings } from '../src/services/settings.js';
import { getApp } from './api-client.js';
import { createAdmin, EVENT_PAGE, EVENT_URL, resetDb, useStubPages } from './helpers.js';

const TOKEN = 'test-token-0123456789-abcdefghijklmnop';
const auth = { authorization: `Bearer ${TOKEN}` };

describe('token de API e envio de URLs (skill /harvey)', () => {
  beforeEach(async () => {
    await resetDb();
    await createAdmin();
    await updateSettings({ maxFollowupDepth: 0 });
  });

  it('autentica por Bearer sem CSRF e rejeita token inválido', async () => {
    const app = await getApp();
    expect((await app.inject({ method: 'GET', url: '/api/leads', headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/leads', headers: { authorization: 'Bearer errado' } })).statusCode).toBe(401);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth });
    expect(me.json().user.name).toContain('(API)');
  });

  it('URLs enviadas passam pelo pipeline normal e viram lead; repetidas são ignoradas', async () => {
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    const app = await getApp();
    const r = await app.inject({
      method: 'POST',
      url: '/api/search/urls',
      headers: auth,
      payload: { source: 'harvey', categoryId: 12, state: 'GO', urls: [{ url: EVENT_URL, title: 'Rainha da Expo Goiânia 2027' }, 'nao-e-url'] },
    });
    expect(r.statusCode).toBe(400); // URL inválida rejeitada pela validação
    const ok = await app.inject({ method: 'POST', url: '/api/search/urls', headers: auth, payload: { source: 'harvey', categoryId: 12, urls: [EVENT_URL] } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().results[0].status).toBe('queued');
    const [res] = await db.select().from(searchResults);
    expect(res!.connector).toBe('harvey');
    expect((await processResult(res!.id)).outcome).toBe('created');
    const [ev] = await db.select().from(events);
    expect(ev!.name).toBe('Rainha da Expo Goiânia 2027');
    const again = await app.inject({ method: 'POST', url: '/api/search/urls', headers: auth, payload: { urls: [EVENT_URL] } });
    expect(again.json().results[0].status).toBe('duplicate');
    // enriquecimento de lead existente: fonte nova agregada ao mesmo evento
    const [lead] = await db.select().from(leads);
    const extra = 'https://portal.example.com.br/rainha-expo';
    useStubPages({ [extra]: EVENT_PAGE });
    const enr = await app.inject({ method: 'POST', url: '/api/search/urls', headers: auth, payload: { leadId: lead!.id, urls: [extra] } });
    const [r2] = await db.select().from(searchResults).where(eq(searchResults.id, enr.json().results[0].resultId));
    expect(r2!.contextEventId).toBe(ev!.id);
    expect((await processResult(r2!.id)).outcome).toBe('merged');
    expect(await db.$count(leads)).toBe(1);
  });

  it('salva mensagem redigida pela skill como rascunho e aplica as regras', async () => {
    useStubPages({ [EVENT_URL]: EVENT_PAGE });
    const app = await getApp();
    const sent = await app.inject({ method: 'POST', url: '/api/search/urls', headers: auth, payload: { categoryId: 12, urls: [EVENT_URL] } });
    await processResult(sent.json().results[0].resultId);
    const [lead] = await db.select().from(leads);
    const good = 'Olá! Vi o concurso Rainha da Expo Goiânia 2027 com inscrições abertas. A VoteMais monta uma página de votação online com ranking em tempo real e pagamentos via PIX e cartão. Conheça: https://votemais.online — faz sentido conversarmos?';
    const r = await app.inject({ method: 'POST', url: `/api/leads/${lead!.id}/messages`, headers: auth, payload: { content: good } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ status: 'draft', model: 'harvey' });
    const bad = await app.inject({ method: 'POST', url: `/api/leads/${lead!.id}/messages`, headers: auth, payload: { content: 'Olá [nome], vi que vocês estão fazendo uma votação no concurso de vocês. https://votemais.online — vamos conversar sobre isso hoje?' } });
    expect(bad.statusCode).toBe(400);
  });
});
