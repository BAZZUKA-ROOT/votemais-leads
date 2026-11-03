import { httpJson, type SearchConnector } from './types.js';

interface BraveResponse {
  web?: { results?: Array<{ url: string; title?: string; description?: string; page_age?: string; extra_snippets?: string[] }> };
}

const strip = (s: string) => s.replace(/<[^>]+>/g, '');

export const braveConnector: SearchConnector = {
  id: 'brave',
  async search(query, { count, integration }) {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(count, 20)),
      country: 'BR',
      search_lang: 'pt-br',
      extra_snippets: 'true',
    });
    const data = await httpJson<BraveResponse>('brave', `https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { accept: 'application/json', 'X-Subscription-Token': integration.credentials.apiKey! },
    });
    return (data.web?.results ?? []).map((r, i) => ({
      url: r.url,
      title: strip(r.title ?? ''),
      snippet: strip([r.description ?? '', ...(r.extra_snippets ?? [])].join(' … ')),
      position: i + 1,
      publishedAt: r.page_age ?? null,
    }));
  },
};
