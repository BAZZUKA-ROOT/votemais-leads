import { z } from 'zod';
import { aiCall } from './client.js';

export const classificationSchema = z.object({
  score: z.number().int(),
  potential: z.enum(['alta', 'media', 'baixa']),
  voting_probability: z.number().int(),
  justification: z.string(),
  facts: z.array(z.string()),
  hypotheses: z.array(z.string()),
  approach_hooks: z.array(z.string()),
  enrichment_queries: z.array(z.string()),
});
export type ClassificationOutput = z.infer<typeof classificationSchema>;

const SYSTEM = `Você avalia oportunidades comerciais para a VoteMais (https://votemais.online), plataforma de votação online personalizada para concursos e premiações: votação online, ranking em tempo real, pagamentos via PIX e cartão, painel administrativo.
Receberá um dossiê com dados JÁ VERIFICADOS de um evento e seu organizador, com a situação de cada fato (confirmed / unconfirmed / not_found / denied).

Pontue de 0 a 100 o potencial do organizador contratar a VoteMais:
- Alto (70-100): concurso/premiação com escolha por público ou com potencial claro de votação popular, evento futuro ou recorrente, organizador e contato comercial identificados.
- Médio (40-69): evento compatível, mas faltam dados (contato, data) ou votação é apenas hipótese.
- Baixo (0-39): evento passado sem recorrência, sem escolha de vencedores, sem contato, ou incompatível.
voting_probability: probabilidade (0-100) de o evento precisar de votação online.
Regras: diferencie fatos (confirmados no dossiê) de hipóteses. Nunca trate "unconfirmed" como fato. Não invente dados.
justification: 2-4 frases objetivas em português.
approach_hooks: até 4 fatos CONFIRMADOS úteis para personalizar a abordagem (ex.: "edição 2027 com inscrições abertas").
enrichment_queries: até 4 consultas de busca para preencher lacunas importantes (contato comercial, Instagram oficial, existência de votação popular, data da próxima edição). Lista vazia se não houver lacunas relevantes.`;

export async function runClassification(dossier: string, jobId?: string | null) {
  const res = await aiCall({ purpose: 'classification', system: SYSTEM, user: dossier, schema: classificationSchema, maxTokens: 4000, jobId });
  const d = res.data;
  d.score = Math.max(0, Math.min(100, Math.round(d.score)));
  d.voting_probability = Math.max(0, Math.min(100, Math.round(d.voting_probability)));
  d.approach_hooks = d.approach_hooks.slice(0, 4);
  d.enrichment_queries = d.enrichment_queries.map((q) => q.trim()).filter((q) => q.length > 5 && q.length < 200).slice(0, 4);
  return res;
}
