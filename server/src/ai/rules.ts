/**
 * Modo gratuito (sem IA): extração, classificação e mensagens por regras determinísticas.
 * Usa somente texto literal das fontes — o resultado passa pela mesma validação factual da IA.
 */
import type { ClassificationOutput } from './classification.js';
import type { ExtractionInput, ExtractionOutput } from './extraction.js';
import type { MessageInput } from './messages.js';
import { domainOf, isGenericDomain, normalizeText } from '../lib/normalize.js';
import { STATES, toUf } from '../lib/regions.js';

export const RULES_MODEL = 'regras';

const CONTEST_RE = /\b(concurso|rainha|princesa|musa|miss|mister|garota|melhores do ano|premia[çc][aã]o|pr[eê]mio|destaques?|trof[eé]u|elei[çc][aã]o|escolha d[aoe]|vota[çc][aã]o popular|festival|competi[çc][aã]o)\b/i;
const PARTICIPANTS_RE = /\b(candidatas?|candidatos?|participantes|concorrentes|finalistas|inscritas?)\b/i;
const REGISTRATION_RE = /\b(inscri[çc][õo]es (est[aã]o )?abertas|inscreva-se|fa[çc]a sua inscri[çc][aã]o|abertas as inscri[çc][õo]es)\b/i;
const VOTING_RE = /[^.\n]{0,80}\b(vota[çc][aã]o (popular|online|aberta)|voto popular|vote (na|no|em|j[aá])|votar na|votem|link (de|para) vota[çc][aã]o|mais curtidas|mais votad[ao])\b[^.\n]{0,80}/i;
const ORGANIZER_RE = /\b(realiza[çc][aã]o|organiza[çc][aã]o|realizado por|organizado por|promo[çc][aã]o|uma realiza[çc][aã]o d[aoe]|produ[çc][aã]o)\s*[:\-–]?\s*([A-ZÀ-Ú0-9][^\n.|•;]{2,70})/;
const ORGANIZER_VERB_RE = /((?:[A-ZÀ-Ú][\wÀ-ú.]*)(?:\s(?:d[aeo]s?|e)?\s?[A-ZÀ-Ú0-9][\wÀ-ú.]*){1,6})\s(?:realiza|organiza|promove|apresenta|realizará|promoverá)\s(?:o|a|os|as)\s(?:\d+[ªº]?\s)?(?:concurso|evento|escolha|festa|premia[çc][aã]o|edi[çc][aã]o)/;
const NON_COMMERCIAL_RE = /(desenvolvid[oa] por|cria[çc][aã]o de sites|ag[eê]ncia|webmaster|imprensa|assessoria de imprensa|patroc[ií]nio)/i;
const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/;
const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const DATE_TEXT_RE = /\b(\d{1,2}) de (janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de)? (20\d{2})\b/i;

function cleanTitle(t: string): string {
  return t
    .split(/\s[|–—]\s|\s-\s(?=[^-]*$)/)[0]!
    .replace(/\s+/g, ' ')
    .trim();
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function findDate(text: string, jsonLd?: string): string | null {
  if (jsonLd && /^\d{4}-\d{2}-\d{2}/.test(jsonLd)) return jsonLd.slice(0, 10);
  const isoMatch = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  const a = text.match(DATE_RE);
  if (a) return iso(Number(a[3]), Number(a[2]), Number(a[1]));
  const b = text.match(DATE_TEXT_RE);
  if (b) return iso(Number(b[3]), MONTHS[normalizeText(b[2]!)] ?? 0, Number(b[1]));
  return null;
}

function findLocation(text: string): { city: string | null; state: string | null } {
  const m = text.match(/([A-ZÀ-Ú][a-zà-ú]+(?:\s(?:d[aeo]s?\s)?[A-ZÀ-Ú][a-zà-ú]+){0,3})\s?[-/–]\s?([A-Z]{2})\b/);
  if (m && toUf(m[2]!)) return { city: m[1]!, state: m[2]! };
  for (const s of STATES) {
    const re = new RegExp(`\\b${s.name}\\b`, 'i');
    if (re.test(text)) return { city: null, state: s.uf };
  }
  return { city: null, state: null };
}

function organizerType(name: string): ExtractionOutput['organizer']['type'] {
  const n = normalizeText(name);
  if (/prefeitura|secretaria|municipio|camara municipal/.test(n)) return 'prefeitura';
  if (/sindicato rural/.test(n)) return 'sindicato_rural';
  if (/associacao|clube|instituto|federacao|liga/.test(n)) return 'associacao';
  if (/producoes|produtora|eventos|promocoes/.test(n)) return 'produtora';
  if (/radio|tv|jornal|portal|revista/.test(n)) return 'midia';
  if (/ltda|eireli|\bme\b|s a\b/.test(n)) return 'empresa';
  return 'desconhecido';
}

export function rulesExtract(input: ExtractionInput): ExtractionOutput {
  const page = input.page;
  const ld = page?.jsonLdEvents[0];
  const text = [input.title, input.snippet, page?.title, page?.description, page?.text].filter(Boolean).join('\n');
  const head = [ld?.name, page?.title, input.title].filter(Boolean).join(' ');
  const name = cleanTitle(ld?.name || page?.title || input.title || '');
  const isOpportunity = CONTEST_RE.test(head) && name.length >= 4;

  const normText = normalizeText(text);
  const category =
    input.categories.find((c) => normText.includes(normalizeText(c.name))) ??
    null;

  const startDate = findDate(text, ld?.startDate);
  const yearMatch = name.match(/\b(20\d{2})\b/) ?? head.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : startDate ? Number(startDate.slice(0, 4)) : null;
  const loc = findLocation([ld?.location, text].filter(Boolean).join('\n'));

  const voting = text.match(VOTING_RE);
  const org = ld?.organizer ?? text.match(ORGANIZER_RE)?.[2]?.trim() ?? text.match(ORGANIZER_VERB_RE)?.[1]?.replace(/^(A|O|As|Os)\s/, '').trim() ?? null;
  const orgName = org ? org.replace(/\s+/g, ' ').slice(0, 80) : null;

  const today = input.currentDate;
  const currentYear = Number(today.slice(0, 4));
  const status = startDate ? (startDate < today ? 'past' : 'scheduled') : year ? (year > currentYear ? 'scheduled' : year < currentYear ? 'past' : 'unknown') : 'unknown';

  const contacts = input.candidates
    .map((c, index) => ({ index, is_commercial: !NON_COMMERCIAL_RE.test(c.excerpt), label: null }))
    .filter((c) => input.candidates[c.index]!.type !== 'website' || c.is_commercial);
  const ig = input.candidates.find((c, i) => c.type === 'instagram' && contacts.find((x) => x.index === i)?.is_commercial);
  const pageDomain = domainOf(input.url);

  return {
    is_event_opportunity: isOpportunity,
    discard_reason: isOpportunity ? null : 'Sem indícios de concurso/premiação no título (modo regras)',
    event: {
      name,
      edition: name.match(/\b(\d{1,3}[ªº]?\s?edi[çc][aã]o)\b/i)?.[1] ?? null,
      year,
      city: loc.city,
      state: loc.state,
      start_date: startDate,
      end_date: null,
      category_slug: category?.slug ?? null,
      status,
      description: page?.description ? page.description.slice(0, 400) : null,
      has_contest: CONTEST_RE.test(head) ? 'confirmed' : 'unconfirmed',
      has_participants: PARTICIPANTS_RE.test(text) ? 'confirmed' : 'not_found',
      registration_open: REGISTRATION_RE.test(text) ? 'confirmed' : 'not_found',
      has_popular_voting: voting ? 'confirmed' : 'not_found',
      voting_evidence: voting ? voting[0].trim() : null,
      current_voting_method: null,
    },
    organizer: { name: orgName, company_name: null, person_name: null, type: orgName ? organizerType(orgName) : 'desconhecido', evidence: orgName },
    contacts,
    official_website: pageDomain && !isGenericDomain(pageDomain) ? input.url : null,
    official_instagram: ig?.normalized ?? null,
    cnpj: text.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/)?.[0] ?? null,
    facts: [
      CONTEST_RE.test(head) ? 'Concurso/premiação mencionado no título' : null,
      REGISTRATION_RE.test(text) ? 'Inscrições abertas' : null,
      voting ? 'Votação popular mencionada' : null,
    ].filter((x): x is string => !!x),
    hypotheses: voting ? [] : ['Pode haver votação popular (não mencionada na fonte)'],
    followup_queries: isOpportunity
      ? [`"${name}" instagram oficial`, `"${name}" contato whatsapp`].filter((q) => q.length < 200)
      : [],
  };
}

export interface RulesClassificationInput {
  eventName: string;
  checklist: Array<{ item: string; status: string }>;
  hasPopularVoting: string;
  hasContest: string;
  hasParticipants: string;
  registrationOpen: string;
  isFuture: boolean | null;
  isPast: boolean;
  organizerKnown: boolean;
  organizerRecurring: boolean;
  hasWhatsapp: boolean;
  hasAnyContact: boolean;
  hasInstagram: boolean;
}

export function rulesClassify(i: RulesClassificationInput): ClassificationOutput {
  let score = 0;
  const facts: string[] = [];
  const hypotheses: string[] = [];
  if (i.hasContest === 'confirmed') (score += 25), facts.push('Concurso/premiação identificado');
  if (i.hasPopularVoting === 'confirmed') (score += 25), facts.push('Votação popular mencionada na fonte');
  else (score += 8), hypotheses.push('Votação popular não confirmada');
  if (i.hasParticipants === 'confirmed') (score += 8), facts.push('Possui candidatas/candidatos');
  if (i.registrationOpen === 'confirmed') (score += 7), facts.push('Inscrições abertas');
  if (i.isFuture) (score += 12), facts.push('Evento futuro');
  else if (i.isPast && !i.organizerRecurring) score -= 10;
  if (i.organizerKnown) (score += 8), facts.push('Organizador identificado');
  if (i.organizerRecurring) (score += 5), facts.push('Organizador recorrente');
  if (i.hasWhatsapp) (score += 12), facts.push('WhatsApp encontrado');
  else if (i.hasAnyContact) score += 6;
  if (i.hasInstagram) score += 3;
  score = Math.max(0, Math.min(100, score));
  const voting = i.hasPopularVoting === 'confirmed' ? 85 : i.hasContest === 'confirmed' ? 55 : 25;
  const potential = score >= 70 ? 'alta' : score >= 40 ? 'media' : 'baixa';
  const gaps: string[] = [];
  const enrichment: string[] = [];
  if (!i.hasWhatsapp) gaps.push('sem WhatsApp'), enrichment.push(`"${i.eventName}" whatsapp contato`);
  if (!i.hasInstagram) gaps.push('sem Instagram'), enrichment.push(`site:instagram.com "${i.eventName}"`);
  if (!i.organizerKnown) gaps.push('organizador não identificado'), enrichment.push(`"${i.eventName}" organização realização`);
  return {
    score,
    potential,
    voting_probability: voting,
    justification: `Classificação por regras: ${facts.length ? facts.join(', ').toLowerCase() : 'poucos dados confirmados'}${gaps.length ? `; lacunas: ${gaps.join(', ')}` : ''}.`,
    facts,
    hypotheses,
    approach_hooks: [],
    enrichment_queries: enrichment.slice(0, 3),
  };
}

const TEMPLATES_INITIAL: Array<(i: MessageInput, local: string) => string> = [
  (i, local) =>
    `Olá! Tudo bem? Vi que vocês estão organizando o ${i.eventName}${local}. Trabalho com a VoteMais, uma plataforma personalizada para concursos, com votação online, ranking em tempo real, pagamentos via PIX e cartão e painel administrativo. ${i.votingConfirmed ? 'Pode facilitar bastante a votação do evento.' : 'Caso pensem em votação online, pode ser interessante para vocês.'} Conheça: https://votemais.online — podemos conversar?`,
  (i, local) =>
    `Olá, tudo bem? Acompanhei a divulgação do ${i.eventName}${local} e fiquei curioso: como vocês fazem a escolha das vencedoras e vencedores? A VoteMais cria uma página de votação online personalizada, com ranking em tempo real e arrecadação via PIX e cartão. Dá uma olhada: https://votemais.online. Posso te mostrar como funcionaria no evento de vocês?`,
  (i, local) =>
    `Oi! Parabéns pela organização do ${i.eventName}${local}. Sou da VoteMais: ajudamos concursos e premiações com votação online, ranking ao vivo, pagamentos via PIX e cartão e painel administrativo completo. Se fizer sentido para vocês, tenho prazer em apresentar: https://votemais.online. Podemos conversar?`,
  (i, local) =>
    `Olá! Tudo certo? Vi o ${i.eventName}${local} e acredito que a VoteMais pode ajudar na votação: plataforma personalizada, ranking em tempo real, PIX e cartão e um painel para acompanhar tudo. Saiba mais em https://votemais.online. Topa uma conversa rápida?`,
];

const TEMPLATES_FOLLOWUP: Array<(i: MessageInput) => string> = [
  (i) => `Olá! Passando para retomar nossa conversa sobre a votação online do ${i.eventName}. Se quiser, envio um exemplo de como ficaria a página do concurso. https://votemais.online`,
  (i) => `Oi, tudo bem? Conseguiu ver a proposta da VoteMais para o ${i.eventName}? Fico à disposição para tirar dúvidas. https://votemais.online`,
];

export function rulesMessage(i: MessageInput, variant: number): { message: string; approach: string; used_facts: string[] } {
  const local = i.city ? `, em ${i.city}` : i.state ? ` (${i.state})` : '';
  if (i.kind === 'followup') {
    const t = TEMPLATES_FOLLOWUP[variant % TEMPLATES_FOLLOWUP.length]!;
    return { message: t(i), approach: 'modelo de follow-up', used_facts: [] };
  }
  const t = TEMPLATES_INITIAL[variant % TEMPLATES_INITIAL.length]!;
  return { message: t(i, local), approach: `modelo ${(variant % TEMPLATES_INITIAL.length) + 1}`, used_facts: [] };
}
