import { describe, expect, it } from 'vitest';
import { estimateCost } from '../src/ai/client.js';
import { extractionSchema, groundExtraction, type ExtractionInput } from '../src/ai/extraction.js';
import { validateMessage, type MessageInput } from '../src/ai/messages.js';
import { extractFromHtml } from '../src/extraction/extract.js';
import { EVENT_PAGE, EVENT_URL, extractionFor, MESSAGE_TEXT } from './helpers.js';
import { buildExtractionPrompt } from '../src/ai/extraction.js';

function input(): ExtractionInput {
  const page = extractFromHtml(EVENT_PAGE, EVENT_URL);
  return { url: EVENT_URL, title: page.title, snippet: '', page, candidates: page.contacts, categories: [{ slug: 'rainha-da-expo', name: 'Rainha da Expo' }], currentDate: '2026-11-03' };
}

function aiOut(overrides: Record<string, unknown> = {}) {
  const inp = input();
  const raw = extractionFor(overrides)({ purpose: 'extraction', system: '', user: buildExtractionPrompt(inp), schema: extractionSchema });
  return { inp, out: extractionSchema.parse(raw) };
}

describe('validação factual da extração (anti-alucinação)', () => {
  it('aceita dados presentes na fonte', () => {
    const { inp, out } = aiOut();
    const g = groundExtraction(out, inp);
    expect(g.accepted).toBe(true);
    expect(g.data.organizer.name).toBe('Associação Expo Goiânia');
    expect(g.contacts.map((c) => c.normalized)).toEqual(expect.arrayContaining(['5562998765432', 'contato@expogoiania.com.br']));
    expect(g.instagram).toBe('expogoiania');
    expect(g.data.event.state).toBe('GO');
  });

  it('descarta contatos, nomes e evidências inventados', () => {
    const { inp, out } = aiOut({
      organizer: { name: 'Fulano de Tal Produções', company_name: null, person_name: 'Maria Inventada', type: 'empresa', evidence: null },
      contacts: [{ index: 999, is_commercial: true, label: null }],
      official_instagram: 'perfil_inexistente',
      official_website: 'https://outrosite.com.br',
      cnpj: '11.222.333/0001-81',
    });
    out.event.has_popular_voting = 'confirmed';
    out.event.voting_evidence = 'votação pelo aplicativo XYZ';
    const g = groundExtraction(out, inp);
    expect(g.accepted).toBe(true);
    expect(g.data.organizer.name).toBeNull();
    expect(g.data.organizer.person_name).toBeNull();
    expect(g.contacts).toHaveLength(0);
    expect(g.instagram).toBeNull();
    expect(g.website).toBeNull();
    expect(g.data.cnpj).toBeNull();
    expect(g.data.event.has_popular_voting).toBe('unconfirmed');
    expect(g.dropped).toEqual(expect.arrayContaining(['organizer.name', 'organizer.person_name', 'official_instagram', 'official_website', 'event.voting_evidence', 'cnpj']));
  });

  it('rejeita evento cujo nome não aparece na fonte', () => {
    const { inp, out } = aiOut();
    out.event.name = 'Festival Internacional de Cinema de Gramado';
    expect(groundExtraction(out, inp).accepted).toBe(false);
  });

  it('remove datas/anos não presentes na fonte', () => {
    const { inp, out } = aiOut();
    out.event.start_date = '2031-01-01';
    out.event.year = 2031;
    const g = groundExtraction(out, inp);
    expect(g.data.event.start_date).toBeNull();
    expect(g.data.event.year).toBeNull();
  });

  it('respeita descarte pela IA', () => {
    const { inp, out } = aiOut({ is_event_opportunity: false, discard_reason: 'loja de roupas' });
    expect(groundExtraction(out, inp)).toMatchObject({ accepted: false, reason: 'loja de roupas' });
  });
});

describe('regras de mensagem', () => {
  const base: MessageInput = { eventName: 'Rainha da Expo', city: 'Goiânia', state: 'GO', categoryName: null, organizerName: null, confirmedFacts: [], votingConfirmed: false, kind: 'initial', approach: 'direta' };
  it('aceita mensagem válida', () => expect(validateMessage(MESSAGE_TEXT, base)).toBeNull());
  it('exige link, sem placeholders e sem afirmar votação não confirmada', () => {
    expect(validateMessage(MESSAGE_TEXT.replace('https://votemais.online', 'nosso site'), base)).toBe('sem link');
    expect(validateMessage(MESSAGE_TEXT.replace('Olá!', 'Olá [nome]!'), base)).toBe('placeholder');
    const claim = MESSAGE_TEXT.replace('Vi que vocês estão organizando', 'Vi que vocês estão fazendo uma votação no concurso');
    expect(validateMessage(claim, base)).toBe('afirma votação não confirmada');
    expect(validateMessage(claim, { ...base, votingConfirmed: true })).toBeNull();
    expect(validateMessage('curta https://votemais.online', base)).toMatch(/tamanho/);
  });
});

describe('custos', () => {
  it('calcula custo por tokens', () => {
    expect(estimateCost('claude-haiku-5-5', 1_000_000, 1_000_000)).toBeCloseTo(0.6);
    expect(estimateCost('claude-opus-5-5', 10_000, 2_000)).toBeCloseTo(0.08);
  });
});
