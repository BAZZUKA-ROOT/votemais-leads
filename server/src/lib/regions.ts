export const STATES = [
  { uf: 'AC', name: 'Acre', region: 'Norte' },
  { uf: 'AL', name: 'Alagoas', region: 'Nordeste' },
  { uf: 'AP', name: 'Amapá', region: 'Norte' },
  { uf: 'AM', name: 'Amazonas', region: 'Norte' },
  { uf: 'BA', name: 'Bahia', region: 'Nordeste' },
  { uf: 'CE', name: 'Ceará', region: 'Nordeste' },
  { uf: 'DF', name: 'Distrito Federal', region: 'Centro-Oeste' },
  { uf: 'ES', name: 'Espírito Santo', region: 'Sudeste' },
  { uf: 'GO', name: 'Goiás', region: 'Centro-Oeste' },
  { uf: 'MA', name: 'Maranhão', region: 'Nordeste' },
  { uf: 'MT', name: 'Mato Grosso', region: 'Centro-Oeste' },
  { uf: 'MS', name: 'Mato Grosso do Sul', region: 'Centro-Oeste' },
  { uf: 'MG', name: 'Minas Gerais', region: 'Sudeste' },
  { uf: 'PA', name: 'Pará', region: 'Norte' },
  { uf: 'PB', name: 'Paraíba', region: 'Nordeste' },
  { uf: 'PR', name: 'Paraná', region: 'Sul' },
  { uf: 'PE', name: 'Pernambuco', region: 'Nordeste' },
  { uf: 'PI', name: 'Piauí', region: 'Nordeste' },
  { uf: 'RJ', name: 'Rio de Janeiro', region: 'Sudeste' },
  { uf: 'RN', name: 'Rio Grande do Norte', region: 'Nordeste' },
  { uf: 'RS', name: 'Rio Grande do Sul', region: 'Sul' },
  { uf: 'RO', name: 'Rondônia', region: 'Norte' },
  { uf: 'RR', name: 'Roraima', region: 'Norte' },
  { uf: 'SC', name: 'Santa Catarina', region: 'Sul' },
  { uf: 'SP', name: 'São Paulo', region: 'Sudeste' },
  { uf: 'SE', name: 'Sergipe', region: 'Nordeste' },
  { uf: 'TO', name: 'Tocantins', region: 'Norte' },
] as const;

export type UF = (typeof STATES)[number]['uf'];
export const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] as const;
export const UFS = STATES.map((s) => s.uf) as UF[];

const byUf = new Map<string, (typeof STATES)[number]>(STATES.map((s) => [s.uf, s]));

export function stateInfo(uf: string | null | undefined) {
  return uf ? byUf.get(uf.toUpperCase()) : undefined;
}

export function regionOf(uf: string | null | undefined): string | null {
  return stateInfo(uf)?.region ?? null;
}

export function statesOfRegion(region: string): string[] {
  return STATES.filter((s) => s.region === region).map((s) => s.uf);
}

/** Aceita UF ou nome do estado ("Goiás", "goias") e devolve a UF. */
export function toUf(value: string | null | undefined): UF | null {
  if (!value) return null;
  const v = value.trim();
  if (byUf.has(v.toUpperCase())) return v.toUpperCase() as UF;
  const n = v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const found = STATES.find((s) => s.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() === n);
  return found?.uf ?? null;
}
