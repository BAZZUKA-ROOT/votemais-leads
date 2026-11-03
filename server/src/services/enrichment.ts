import { getIntegration, recordUsage } from './integrations.js';

export interface CnpjInfo {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  municipio: string | null;
  uf: string | null;
}

/** Consulta dados públicos de CNPJ (Receita Federal via BrasilAPI). */
export async function lookupCnpj(cnpj: string): Promise<CnpjInfo | null> {
  const integ = await getIntegration('brasilapi');
  if (!integ.ready) return null;
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;
  const base = String(integ.config.baseUrl ?? 'https://brasilapi.com.br').replace(/\/+$/, '');
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/cnpj/v1/${digits}`, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) {
      await recordUsage({ provider: 'brasilapi', operation: 'cnpj', success: true, durationMs: Date.now() - started });
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { razao_social?: string; nome_fantasia?: string; municipio?: string; uf?: string };
    await recordUsage({ provider: 'brasilapi', operation: 'cnpj', success: true, durationMs: Date.now() - started });
    return { razaoSocial: j.razao_social || null, nomeFantasia: j.nome_fantasia || null, municipio: j.municipio || null, uf: j.uf || null };
  } catch (err) {
    await recordUsage({ provider: 'brasilapi', operation: 'cnpj', success: false, durationMs: Date.now() - started, error: String(err) });
    return null;
  }
}
