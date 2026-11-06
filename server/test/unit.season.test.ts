import { describe, expect, it } from 'vitest';
import { inSeason, monthIn } from '../src/lib/season.js';
import { pickCategories } from '../src/services/planner.js';

describe('temporada', () => {
  it('considera o mês atual e os 2 seguintes, com virada de ano', () => {
    expect(inSeason([11, 12, 1], 11)).toBe(true);
    expect(inSeason([1, 2], 11)).toBe(true);
    expect(inSeason([1, 2], 10)).toBe(false);
    expect(inSeason([5, 6, 7], 3)).toBe(true);
    expect(inSeason([], 6)).toBe(false);
  });

  it('usa o mês do fuso configurado', () => {
    // 01/12 02:00 UTC ainda é 30/11 em São Paulo
    expect(monthIn('America/Sao_Paulo', new Date('2026-12-01T02:00:00Z'))).toBe(11);
  });

  it('reserva até metade da rodada para categorias em temporada e cobre as demais em rodízio', () => {
    const cat = (id: number, seasonMonths: number[] = []) => ({ id, seasonMonths });
    const all = [cat(1, [12]), cat(2, [1]), cat(3, [6]), cat(4), cat(5), cat(6), cat(7)];
    const r0 = pickCategories(all, 0, 4, 11).map((c) => c.id);
    expect(r0.slice(0, 2)).toEqual([1, 2]);
    expect(r0).toHaveLength(4);
    const seen = new Set<number>();
    for (let round = 0; round < 3; round++) for (const c of pickCategories(all, round, 4, 11)) seen.add(c.id);
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // em julho nenhuma está em temporada: rodízio normal
    expect(pickCategories(all, 0, 4, 7).map((c) => c.id)).toEqual([1, 2, 3, 4]);
  });
});
