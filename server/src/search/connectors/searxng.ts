import { httpJson, type SearchConnector } from './types.js';

interface SearxResponse {
  results?: Array<{ url: string; title?: string; content?: string; publishedDate?: string | null }>;
}

export const searxngConnector: SearchConnector = {
  id: 'searxng',
  async search(query, { count, integration }) {
    const base = String(integration.config.baseUrl ?? '').replace(/\/+$/, '');
    const params = new URLSearchParams({ q: query, format: 'json', language: 'pt-BR', safesearch: '0' });
    const engines = String(integration.config.engines ?? '').trim();
    if (engines) params.set('engines', engines);
    const data = await httpJson<SearxResponse>('searxng', `${base}/search?${params}`, { headers: { accept: 'application/json' } });
    return (data.results ?? []).slice(0, count).map((r, i) => ({
      url: r.url,
      title: r.title ?? '',
      snippet: r.content ?? '',
      position: i + 1,
      publishedAt: r.publishedDate ?? null,
    }));
  },
};
