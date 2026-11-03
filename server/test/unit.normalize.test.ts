import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  eventBaseName,
  eventFingerprint,
  isGenericDomain,
  normalizeBrPhone,
  normalizeEmail,
  normalizeInstagram,
  urlHash,
} from '../src/lib/normalize.js';
import { regionOf, toUf } from '../src/lib/regions.js';
import { decryptJson, encryptJson, maskSecret } from '../src/lib/crypto.js';

describe('telefones BR', () => {
  it('normaliza celulares em formatos variados', () => {
    for (const v of ['(62) 99876-5432', '62998765432', '+55 62 9 9876-5432', '055 62 99876 5432', '5562998765432']) {
      expect(normalizeBrPhone(v)?.e164).toBe('5562998765432');
    }
    expect(normalizeBrPhone('(62) 99876-5432')?.isMobile).toBe(true);
  });
  it('aceita fixo e rejeita inválidos', () => {
    expect(normalizeBrPhone('(11) 3333-4444')).toMatchObject({ e164: '551133334444', isMobile: false });
    expect(normalizeBrPhone('(20) 99999-1234')).toBeNull(); // DDD inexistente
    expect(normalizeBrPhone('(62) 89876-5432')).toBeNull(); // 9 dígitos sem 9
    expect(normalizeBrPhone('12345')).toBeNull();
    expect(normalizeBrPhone('(62) 99999-9999')).toBeNull();
  });
});

describe('e-mail e instagram', () => {
  it('normaliza e-mails e ignora técnicos', () => {
    expect(normalizeEmail('Contato@Expo.com.BR')).toBe('contato@expo.com.br');
    expect(normalizeEmail('mailto:a@b.com?subject=x')).toBe('a@b.com');
    expect(normalizeEmail('noreply@site.com')).toBeNull();
    expect(normalizeEmail('logo@2x.png')).toBeNull();
  });
  it('extrai handle do instagram', () => {
    expect(normalizeInstagram('https://www.instagram.com/ExpoGoiania/')).toBe('expogoiania');
    expect(normalizeInstagram('@rainha.expo_2027')).toBe('rainha.expo_2027');
    expect(normalizeInstagram('https://instagram.com/p/ABC123')).toBeNull();
    expect(normalizeInstagram('https://instagram.com/explore')).toBeNull();
  });
});

describe('URLs', () => {
  it('remove rastreamento e fragmento', () => {
    expect(canonicalUrl('https://Site.com/evento/?utm_source=x&id=2#top')).toBe('https://site.com/evento?id=2');
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
  });
  it('hash ignora protocolo e www', () => {
    expect(urlHash('https://www.site.com/a')).toBe(urlHash('http://site.com/a'));
  });
  it('domínios genéricos', () => {
    expect(isGenericDomain('instagram.com')).toBe(true);
    expect(isGenericDomain('m.facebook.com')).toBe(true);
    expect(isGenericDomain('expogoiania.com.br')).toBe(false);
  });
});

describe('deduplicação de eventos', () => {
  it('nome base ignora ano, edição e stopwords', () => {
    expect(eventBaseName('15ª Edição Concurso Rainha da Expo Goiânia 2027')).toBe('rainha expo goiania');
    expect(eventBaseName('Rainha da Expo Goiânia')).toBe('rainha expo goiania');
  });
  it('fingerprint igual para variações do mesmo evento', () => {
    const a = eventFingerprint({ name: 'Concurso Rainha da Expo Goiânia 2027', state: 'GO', city: 'Goiânia', year: 2027 });
    const b = eventFingerprint({ name: 'Rainha da Expo Goiania', state: 'go', city: 'goiania', year: 2027 });
    const c = eventFingerprint({ name: 'Rainha da Expo Goiânia', state: 'GO', city: 'Goiânia', year: 2028 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('regiões', () => {
  it('converte nome/UF', () => {
    expect(toUf('Goiás')).toBe('GO');
    expect(toUf('sao paulo')).toBe('SP');
    expect(toUf('df')).toBe('DF');
    expect(toUf('Atlântida')).toBeNull();
    expect(regionOf('RS')).toBe('Sul');
  });
});

describe('criptografia de credenciais', () => {
  it('cifra e decifra; detecta adulteração', () => {
    const enc = encryptJson({ apiKey: 'sk-secret-123456' });
    expect(enc).not.toContain('sk-secret');
    expect(decryptJson(enc)).toEqual({ apiKey: 'sk-secret-123456' });
    const parts = enc.split(':');
    parts[3] = Buffer.from('xx').toString('base64url');
    expect(() => decryptJson(parts.join(':'))).toThrow();
    expect(maskSecret('sk-secret-123456')).toBe('••••3456');
  });
});
