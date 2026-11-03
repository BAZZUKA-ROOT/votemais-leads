import { describe, expect, it } from 'vitest';
import { extractFromHtml, extractFromSearchSnippet } from '../src/extraction/extract.js';
import { EVENT_PAGE, EVENT_URL } from './helpers.js';

describe('extração de contatos', () => {
  it('encontra WhatsApp, e-mail, Instagram e site literalmente na página', () => {
    const p = extractFromHtml(EVENT_PAGE, EVENT_URL);
    const by = (t: string) => p.contacts.filter((c) => c.type === t).map((c) => c.normalized);
    expect(by('whatsapp')).toContain('5562998765432');
    expect(by('email')).toContain('contato@expogoiania.com.br');
    expect(by('instagram')).toContain('expogoiania');
    expect(by('website')).toContain('expogoiania.com.br');
    expect(by('phone')).toContain('551133334444');
    expect(p.title).toContain('Rainha da Expo');
    expect(p.text).toContain('Inscrições abertas');
  });
  it('não inventa contatos inexistentes', () => {
    const p = extractFromHtml('<html><body><p>Evento sem contatos. CEP 74000-000. CNPJ 12.345.678/0001-90</p></body></html>', 'https://x.com.br');
    expect(p.contacts.filter((c) => ['whatsapp', 'phone', 'email'].includes(c.type))).toHaveLength(0);
  });
  it('lê JSON-LD de eventos', () => {
    const html = `<script type="application/ld+json">{"@type":"Event","name":"Miss Teen MG 2027","startDate":"2027-03-10","location":{"name":"Teatro","address":{"addressLocality":"BH","addressRegion":"MG"}},"organizer":{"name":"Org MG"}}</script>`;
    const p = extractFromHtml(`<html><head>${html}</head><body></body></html>`, 'https://missteen.com.br');
    expect(p.jsonLdEvents[0]).toMatchObject({ name: 'Miss Teen MG 2027', startDate: '2027-03-10', organizer: 'Org MG' });
  });
  it('extrai do resultado de busca do Instagram sem acessar a página', () => {
    const c = extractFromSearchSnippet('https://www.instagram.com/rainhadorodeio_sp/', 'Rainha do Rodeio SP (@rainhadorodeio_sp)', 'Inscrições pelo whats 11 98888-7777');
    expect(c.find((x) => x.type === 'instagram')?.normalized).toBe('rainhadorodeio_sp');
    expect(c.find((x) => x.type === 'whatsapp')?.normalized).toBe('5511988887777');
  });
});
