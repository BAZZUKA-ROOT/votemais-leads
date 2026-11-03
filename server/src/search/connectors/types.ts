import type { ResolvedIntegration } from '../../services/integrations.js';

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  position: number;
  publishedAt?: string | null;
}

export interface SearchOptions {
  count: number;
  integration: ResolvedIntegration;
  signal?: AbortSignal;
}

/** Contrato de provedor de pesquisa. Novos provedores implementam esta interface e são registrados em registry.ts. */
export interface SearchConnector {
  id: string;
  search(query: string, opts: SearchOptions): Promise<SearchHit[]>;
}

export class ConnectorHttpError extends Error {
  constructor(
    public connector: string,
    public status: number,
    body: string,
  ) {
    super(`${connector} respondeu HTTP ${status}: ${body.slice(0, 300)}`);
  }
  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}

export async function httpJson<T>(connector: string, url: string, init: RequestInit & { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, { ...init, signal: init.signal ?? ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new ConnectorHttpError(connector, res.status, text);
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(t);
  }
}
