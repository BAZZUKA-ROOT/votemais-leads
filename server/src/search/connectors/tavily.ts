import { httpJson, type SearchConnector } from './types.js';

interface TavilyResponse {
  results?: Array<{ url: string; title?: string; content?: string; published_date?: string }>;
}

export const tavilyConnector: SearchConnector = {
  id: 'tavily',
  async search(query, { count, integration }) {
    const data = await httpJson<TavilyResponse>('tavily', 'https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${integration.credentials.apiKey}` },
      body: JSON.stringify({ query, max_results: Math.min(count, 20), search_depth: 'basic', country: 'brazil' }),
    });
    return (data.results ?? []).map((r, i) => ({
      url: r.url,
      title: r.title ?? '',
      snippet: r.content ?? '',
      position: i + 1,
      publishedAt: r.published_date ?? null,
    }));
  },
};
