import { z } from 'zod';
import { aiCall, aiMode } from './client.js';
import { rulesMessage, RULES_MODEL } from './rules.js';

export const messageSchema = z.object({
  message: z.string(),
  approach: z.string(),
  used_facts: z.array(z.string()),
});

export const APPROACHES = [
  'direta e cordial, apresentando a solução logo após citar o evento',
  'curiosa, começando com uma pergunta leve sobre como funciona a escolha das vencedoras/vencedores',
  'consultiva, destacando um benefício prático (ranking em tempo real ou arrecadação via PIX) ligado ao evento',
  'parabenizando pela edição do evento e oferecendo ajuda na organização da votação',
] as const;

const SYSTEM = `Você escreve mensagens curtas de primeiro contato comercial pelo WhatsApp em português do Brasil, em nome da VoteMais (https://votemais.online).
VoteMais: plataforma personalizada para concursos e premiações, com votação online, ranking em tempo real, pagamentos via PIX e cartão e painel administrativo.

Regras:
- Use somente os FATOS CONFIRMADOS fornecidos. Nunca invente dados do evento.
- Se a votação popular NÃO estiver confirmada, não afirme que existe votação — fale em "caso pensem em votação online" ou similar.
- Cite o nome do evento e, se houver, a cidade. Use o nome do organizador apenas se fornecido.
- Linguagem natural, próxima, sem exageros comerciais, sem emojis em excesso (no máximo 1), sem letras maiúsculas gritadas.
- 350 a 650 caracteres. Inclua o link https://votemais.online uma única vez. Termine com uma pergunta curta convidando para conversar.
- Não use placeholders como [nome] ou {evento}.`;

export interface MessageInput {
  eventName: string;
  city: string | null;
  state: string | null;
  categoryName: string | null;
  organizerName: string | null;
  confirmedFacts: string[];
  votingConfirmed: boolean;
  kind: 'initial' | 'followup';
  approach: string;
  previousMessage?: string | null;
  daysSinceContact?: number | null;
}

export function buildMessagePrompt(i: MessageInput): string {
  return [
    `TIPO: ${i.kind === 'initial' ? 'primeiro contato' : `follow-up (${i.daysSinceContact ?? '?'} dias após o primeiro contato, sem resposta)`}`,
    `ESTILO DESEJADO: ${i.approach}`,
    `EVENTO: ${i.eventName}`,
    `CATEGORIA: ${i.categoryName ?? 'não informada'}`,
    `CIDADE/UF: ${[i.city, i.state].filter(Boolean).join(' / ') || 'não informada'}`,
    `ORGANIZADOR: ${i.organizerName ?? 'não identificado'}`,
    `VOTAÇÃO POPULAR CONFIRMADA: ${i.votingConfirmed ? 'sim' : 'não'}`,
    `FATOS CONFIRMADOS:\n${i.confirmedFacts.length ? i.confirmedFacts.map((f) => `- ${f}`).join('\n') : '- (nenhum além do nome do evento)'}`,
    i.previousMessage ? `MENSAGEM ANTERIOR ENVIADA:\n${i.previousMessage}` : '',
    i.kind === 'followup' ? 'Escreva um follow-up mais curto (200 a 400 caracteres), educado, sem pressão, retomando a conversa.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const PLACEHOLDER_RE = /\[[^\]]{2,30}\]|\{[^}]{2,30}\}/;
const VOTING_CLAIM_RE = /\b(vi|vimos|notei|soube|percebi)\s+que\s+(?:\S+\s+){0,4}?vota[cç][aã]o|\b(sua|a)\s+vota[cç][aã]o\s+(popular\s+)?(atual|de\s+voc[eê]s|que\s+voc[eê]s)/i;

export function validateMessage(text: string, i: MessageInput): string | null {
  if (!text.includes('votemais.online')) return 'sem link';
  if (PLACEHOLDER_RE.test(text)) return 'placeholder';
  if (!i.votingConfirmed && VOTING_CLAIM_RE.test(text)) return 'afirma votação não confirmada';
  const max = i.kind === 'initial' ? 900 : 600;
  if (text.length > max || text.length < 120) return `tamanho ${text.length}`;
  return null;
}

export async function runMessageGeneration(input: MessageInput, variant = 0) {
  if ((await aiMode()) === 'rules') {
    const data = rulesMessage(input, variant);
    const problem = validateMessage(data.message, input);
    if (problem) throw new Error(`Modelo de mensagem inválido: ${problem}`);
    return { data, model: RULES_MODEL, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
  let lastProblem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = buildMessagePrompt(input) + (lastProblem ? `\n\nA versão anterior foi rejeitada (${lastProblem}). Corrija.` : '');
    const res = await aiCall({ purpose: 'message', system: SYSTEM, user, schema: messageSchema, maxTokens: 2000 });
    const text = res.data.message.trim();
    const problem = validateMessage(text, input);
    if (!problem) return { ...res, data: { ...res.data, message: text } };
    lastProblem = problem;
  }
  throw new Error(`Mensagem gerada não passou na validação: ${lastProblem}`);
}
