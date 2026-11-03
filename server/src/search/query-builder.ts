import type { Category } from '../db/schema.js';
import { stateInfo } from '../lib/regions.js';

export interface PlannedQuery {
  query: string;
  categoryId: number;
  state: string;
}

const MUNICIPAL_GROUPS = new Set(['municipal', 'rodeio']);

/**
 * Gera consultas a partir das palavras-chave da categoria × estado.
 * Prioriza edições atuais/futuras e inscrições abertas; inclui busca pública por perfis no Instagram.
 */
export function buildQueries(category: Category, uf: string, now = new Date(), limit = 8): PlannedQuery[] {
  const st = stateInfo(uf);
  if (!st) return [];
  const year = now.getFullYear();
  const next = year + 1;
  const kws = category.keywords.length ? category.keywords : [category.name];
  const perKw = kws.map((kw) => {
    const q = [
      `"${kw}" ${year} ${st.name}`,
      `"${kw}" ${next} inscrições ${st.name}`,
      `"${kw}" ${st.name} votação candidatas`,
      `site:instagram.com "${kw}" ${st.name}`,
    ];
    if (MUNICIPAL_GROUPS.has(category.group)) q.push(`"${kw}" prefeitura ${st.name} ${year}`);
    return q;
  });
  // round-robin entre palavras-chave para variar quando há limite
  const interleaved: string[] = [];
  const max = Math.max(...perKw.map((a) => a.length));
  for (let i = 0; i < max; i++) for (const arr of perKw) if (arr[i]) interleaved.push(arr[i]!);
  return [...new Set(interleaved)].slice(0, limit).map((query) => ({ query, categoryId: category.id, state: uf }));
}
