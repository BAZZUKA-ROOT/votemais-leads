import { describe, expect, it } from 'vitest';
import { buildMailtoLink, buildWhatsAppLink } from '../src/lib/whatsapp.js';

describe('links do WhatsApp', () => {
  it('usa formato oficial wa.me com número internacional', () => {
    expect(buildWhatsAppLink('(62) 99876-5432')).toBe('https://wa.me/5562998765432');
  });
  it('codifica a mensagem corretamente', () => {
    const msg = 'Olá! Tudo bem?\nConheça: https://votemais.online & PIX 100%';
    const url = buildWhatsAppLink('62998765432', msg)!;
    expect(url.startsWith('https://wa.me/5562998765432?text=')).toBe(true);
    const text = new URL(url).searchParams.get('text');
    expect(text).toBe(msg);
    expect(url).not.toContain(' ');
    expect(url).toContain('%0A');
  });
  it('rejeita números inválidos', () => {
    expect(buildWhatsAppLink('123')).toBeNull();
  });
  it('mailto com assunto e corpo', () => {
    const u = buildMailtoLink('a@b.com', 'Assunto teste', 'Linha 1\nLinha 2');
    expect(u).toBe('mailto:a@b.com?subject=Assunto%20teste&body=Linha%201%0ALinha%202');
  });
});
