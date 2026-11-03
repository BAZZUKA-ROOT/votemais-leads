import { z } from 'zod';
import type { ContactCandidate, ExtractedPage } from '../extraction/extract.js';
import { appearsIn, domainOf, eventBaseName, normalizeInstagram, normalizeText } from '../lib/normalize.js';
import { toUf } from '../lib/regions.js';
import { aiCall, aiMode } from './client.js';
import { rulesExtract, RULES_MODEL } from './rules.js';

const fact = z.enum(['confirmed', 'unconfirmed', 'not_found']);

export const extractionSchema = z.object({
  is_event_opportunity: z.boolean(),
  discard_reason: z.string().nullable(),
  event: z.object({
    name: z.string(),
    edition: z.string().nullable(),
    year: z.number().int().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    category_slug: z.string().nullable(),
    status: z.enum(['scheduled', 'ongoing', 'past', 'cancelled', 'unknown']),
    description: z.string().nullable(),
    has_contest: fact,
    has_participants: fact,
    registration_open: fact,
    has_popular_voting: z.enum(['confirmed', 'unconfirmed', 'not_found', 'denied']),
    voting_evidence: z.string().nullable(),
    current_voting_method: z.string().nullable(),
  }),
  organizer: z.object({
    name: z.string().nullable(),
    company_name: z.string().nullable(),
    person_name: z.string().nullable(),
    type: z.enum(['empresa', 'prefeitura', 'associacao', 'produtora', 'sindicato_rural', 'midia', 'pessoa', 'desconhecido']),
    evidence: z.string().nullable(),
  }),
  contacts: z.array(z.object({ index: z.number().int(), is_commercial: z.boolean(), label: z.string().nullable() })),
  official_website: z.string().nullable(),
  official_instagram: z.string().nullable(),
  cnpj: z.string().nullable(),
  facts: z.array(z.string()),
  hypotheses: z.array(z.string()),
  followup_queries: z.array(z.string()),
});

export type ExtractionOutput = z.infer<typeof extractionSchema>;

const SYSTEM = `Você é um analista de prospecção comercial da VoteMais (plataforma de votação online para concursos e premiações: votação online, ranking em tempo real, pagamentos via PIX e cartão, painel administrativo).
Sua tarefa: ler o conteúdo PÚBLICO de uma página/resultado de busca e extrair dados de um evento brasileiro (concurso de beleza, rainha de rodeio/expo/festa, premiação "melhores do ano", concursos com votação popular etc.) e de quem o organiza.

Regras invioláveis:
- Use SOMENTE informações presentes no conteúdo fornecido. Nunca complete com conhecimento externo nem suponha.
- Campo não encontrado => null (ou "not_found"). Não invente nomes, cidades, datas, contatos.
- "confirmed" exige evidência explícita no texto. Indícios => "unconfirmed".
- has_popular_voting: "confirmed" somente se o texto disser que há votação do público (online, por curtidas, por voto pago etc.). Copie o trecho literal em voting_evidence.
- organizer.evidence: trecho literal do conteúdo que mostra quem organiza/realiza o evento.
- contacts: selecione pelos índices da lista de CONTATOS CANDIDATOS somente os que pertencem ao evento/organizador. Marque is_commercial=false para contatos claramente pessoais ou de terceiros (ex.: imprensa, patrocinador, desenvolvedor do site).
- official_instagram: handle presente entre os candidatos ou no conteúdo; senão null.
- state: sigla UF.
- start_date/end_date: AAAA-MM-DD apenas se a data estiver explícita.
- is_event_opportunity=false quando não for um evento/concurso/premiação no Brasil com escolha de vencedores (ex.: loja, notícia genérica, resultado sem relação, evento de outro país).
- facts: fatos confirmados, curtos. hypotheses: inferências, marcadas como hipóteses.
- followup_queries: até 5 consultas de busca em português para localizar nome oficial, edição atual, organizador, Instagram oficial, site oficial, contato comercial e informações sobre votação deste evento. Inclua cidade/UF e ano quando conhecidos.`;

export interface ExtractionInput {
  url: string;
  title: string;
  snippet: string;
  page: ExtractedPage | null;
  candidates: ContactCandidate[];
  categories: Array<{ slug: string; name: string }>;
  contextEvent?: { name: string; city: string | null; state: string | null; year: number | null } | null;
  currentDate: string;
}

const MAX_PAGE_CHARS = 18_000;

export function buildExtractionPrompt(input: ExtractionInput): string {
  const parts: string[] = [];
  parts.push(`Data de hoje: ${input.currentDate}`);
  if (input.contextEvent) {
    parts.push(
      `CONTEXTO: esta página foi encontrada em pesquisa complementar sobre o evento "${input.contextEvent.name}" (${[input.contextEvent.city, input.contextEvent.state, input.contextEvent.year].filter(Boolean).join(' / ')}). Se a página tratar de outro evento, responda is_event_opportunity=false com discard_reason.`,
    );
  }
  parts.push(`CATEGORIAS (use o slug): ${input.categories.map((c) => `${c.slug} = ${c.name}`).join('; ')}`);
  parts.push(`URL: ${input.url}\nTÍTULO DO RESULTADO: ${input.title}\nTRECHO DO RESULTADO: ${input.snippet}`);
  if (input.page) {
    if (input.page.jsonLdEvents.length) parts.push(`DADOS ESTRUTURADOS (JSON-LD): ${JSON.stringify(input.page.jsonLdEvents).slice(0, 3000)}`);
    parts.push(`TÍTULO DA PÁGINA: ${input.page.title}\nDESCRIÇÃO: ${input.page.description}`);
    parts.push(`CONTEÚDO DA PÁGINA:\n${input.page.text.slice(0, MAX_PAGE_CHARS)}`);
  } else {
    parts.push('CONTEÚDO DA PÁGINA: (não acessado — use apenas título e trecho do resultado)');
  }
  parts.push(
    `CONTATOS CANDIDATOS (encontrados literalmente na fonte):\n${
      input.candidates.length
        ? input.candidates.map((c, i) => `[${i}] ${c.type}: ${c.value} — contexto: "${c.excerpt.slice(0, 160)}"`).join('\n')
        : '(nenhum)'
    }`,
  );
  return parts.join('\n\n');
}

export interface GroundedExtraction {
  accepted: boolean;
  reason?: string;
  data: ExtractionOutput;
  contacts: Array<ContactCandidate & { isCommercial: boolean; label: string | null }>;
  website: string | null;
  instagram: string | null;
  dropped: string[];
}

const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;

/**
 * Validação determinística pós-IA: tudo que não puder ser verificado na fonte é descartado.
 * Garante que contatos, nomes e evidências não sejam inventados.
 */
export function groundExtraction(out: ExtractionOutput, input: ExtractionInput): GroundedExtraction {
  const source = [input.title, input.snippet, input.page?.title, input.page?.description, input.page?.text, JSON.stringify(input.page?.jsonLdEvents ?? [])]
    .filter(Boolean)
    .join('\n');
  const dropped: string[] = [];
  const data: ExtractionOutput = structuredClone(out);

  if (!data.is_event_opportunity) return { accepted: false, reason: data.discard_reason ?? 'Não é oportunidade', data, contacts: [], website: null, instagram: null, dropped };

  // nome do evento: >=60% dos tokens devem existir na fonte
  const tokens = eventBaseName(data.event.name).split(' ').filter((t) => t.length > 2);
  const srcNorm = normalizeText(source);
  const hit = tokens.filter((t) => srcNorm.includes(t)).length;
  if (!tokens.length || hit / tokens.length < 0.6) {
    return { accepted: false, reason: 'Nome do evento não verificável na fonte', data, contacts: [], website: null, instagram: null, dropped: ['event.name'] };
  }

  const keepIfPresent = (v: string | null, label: string) => {
    if (v && !appearsIn(source, v)) {
      dropped.push(label);
      return null;
    }
    return v;
  };
  data.organizer.name = keepIfPresent(data.organizer.name, 'organizer.name');
  data.organizer.company_name = keepIfPresent(data.organizer.company_name, 'organizer.company_name');
  data.organizer.person_name = keepIfPresent(data.organizer.person_name, 'organizer.person_name');
  data.organizer.evidence = keepIfPresent(data.organizer.evidence, 'organizer.evidence');
  data.event.city = keepIfPresent(data.event.city, 'event.city');
  data.event.edition = keepIfPresent(data.event.edition, 'event.edition');

  const uf = toUf(data.event.state);
  if (data.event.state && !uf) dropped.push('event.state');
  data.event.state = uf;

  if (data.event.voting_evidence && !appearsIn(source, data.event.voting_evidence)) {
    dropped.push('event.voting_evidence');
    data.event.voting_evidence = null;
  }
  if (data.event.has_popular_voting === 'confirmed' && !data.event.voting_evidence) data.event.has_popular_voting = 'unconfirmed';

  const validDate = (d: string | null, label: string) => {
    if (!d) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)) || !source.includes(d.slice(0, 4))) {
      dropped.push(label);
      return null;
    }
    return d;
  };
  data.event.start_date = validDate(data.event.start_date, 'event.start_date');
  data.event.end_date = validDate(data.event.end_date, 'event.end_date');
  if (data.event.year && !source.includes(String(data.event.year))) {
    dropped.push('event.year');
    data.event.year = data.event.start_date ? Number(data.event.start_date.slice(0, 4)) : null;
  }
  if (!data.event.year && data.event.start_date) data.event.year = Number(data.event.start_date.slice(0, 4));

  const contacts = data.contacts
    .filter((c) => Number.isInteger(c.index) && c.index >= 0 && c.index < input.candidates.length)
    .map((c) => ({ ...input.candidates[c.index]!, isCommercial: c.is_commercial, label: c.label }));
  const unique = new Map(contacts.map((c) => [`${c.type}:${c.normalized}`, c]));

  let instagram: string | null = null;
  if (data.official_instagram) {
    const h = normalizeInstagram(data.official_instagram);
    const known = input.candidates.some((c) => c.type === 'instagram' && c.normalized === h) || (h && srcNorm.includes(normalizeText(h)));
    if (h && known) instagram = h;
    else dropped.push('official_instagram');
  }

  let website: string | null = null;
  if (data.official_website) {
    const d = domainOf(data.official_website);
    const allowed = new Set([domainOf(input.url), ...(input.page?.links ?? []).map((l) => domainOf(l))].filter(Boolean));
    if (d && allowed.has(d)) website = data.official_website;
    else dropped.push('official_website');
  }

  if (data.cnpj && (!CNPJ_RE.test(data.cnpj) || !source.replace(/\D/g, '').includes(data.cnpj.replace(/\D/g, '')))) {
    dropped.push('cnpj');
    data.cnpj = null;
  }

  data.followup_queries = data.followup_queries.map((q) => q.trim()).filter((q) => q.length > 5 && q.length < 200).slice(0, 5);
  data.facts = data.facts.slice(0, 12);
  data.hypotheses = data.hypotheses.slice(0, 12);

  return { accepted: true, data, contacts: [...unique.values()], website, instagram, dropped };
}

export async function runExtraction(input: ExtractionInput, jobId?: string | null) {
  if ((await aiMode()) === 'rules') {
    const data = extractionSchema.parse(rulesExtract(input));
    return { data, model: RULES_MODEL, inputTokens: 0, outputTokens: 0, costUsd: 0, grounded: groundExtraction(data, input) };
  }
  const res = await aiCall({ purpose: 'extraction', system: SYSTEM, user: buildExtractionPrompt(input), schema: extractionSchema, maxTokens: 6000, jobId });
  return { ...res, grounded: groundExtraction(res.data, input) };
}
