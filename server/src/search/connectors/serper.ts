import { httpJson, type SearchConnector } from './types.js';

interface SerperResponse {
  organic?: Array<{ link: string; title?: string; snippet?: string; position?: number; date?: string }>;
}

export const serperConnector: SearchConnector = {
  id: 'serper',
  async search(query, { count, integration }) {
    const data = await httpJson<SerperResponse>('serper', 'https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-KEY': integration.credentials.apiKey! },
      body: JSON.stringify({ q: query, gl: 'br', hl: 'pt-br', num: Math.min(count, 100) }),
    });
    return (data.organic ?? []).map((r, i) => ({
      url: r.link,
      title: r.title ?? '',
      snippet: r.snippet ?? '',
      position: r.position ?? i + 1,
      publishedAt: r.date ?? null,
    }));
  },
};
