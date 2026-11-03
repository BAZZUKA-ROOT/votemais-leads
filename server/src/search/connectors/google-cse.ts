import { httpJson, type SearchConnector } from './types.js';

interface CseResponse {
  items?: Array<{ link: string; title?: string; snippet?: string }>;
}

export const googleCseConnector: SearchConnector = {
  id: 'google_cse',
  async search(query, { count, integration }) {
    const params = new URLSearchParams({
      key: integration.credentials.apiKey!,
      cx: String(integration.config.cx),
      q: query,
      num: String(Math.min(count, 10)),
      gl: 'br',
      lr: 'lang_pt',
    });
    const data = await httpJson<CseResponse>('google_cse', `https://www.googleapis.com/customsearch/v1?${params}`, {});
    return (data.items ?? []).map((r, i) => ({ url: r.link, title: r.title ?? '', snippet: r.snippet ?? '', position: i + 1 }));
  },
};
