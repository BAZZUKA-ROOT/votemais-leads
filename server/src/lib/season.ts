/** Mês (1–12) no fuso informado. */
export function monthIn(tz: string, date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(date));
}

/**
 * Em temporada quando algum mês do evento cai entre o mês atual e os próximos `leadMonths`
 * (organizadores fecham fornecedores antes do evento). Lista vazia = ano todo, nunca prioritária.
 */
export function inSeason(months: readonly number[], month: number, leadMonths = 2): boolean {
  if (!months.length) return false;
  for (let i = 0; i <= leadMonths; i++) if (months.includes(((month - 1 + i) % 12) + 1)) return true;
  return false;
}
