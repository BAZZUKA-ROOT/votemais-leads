import { braveConnector } from './brave.js';
import { googleCseConnector } from './google-cse.js';
import { searxngConnector } from './searxng.js';
import { serperConnector } from './serper.js';
import { tavilyConnector } from './tavily.js';
import type { SearchConnector } from './types.js';

const registry = new Map<string, SearchConnector>(
  [searxngConnector, braveConnector, serperConnector, googleCseConnector, tavilyConnector].map((c) => [c.id, c]),
);

export function getConnector(id: string): SearchConnector | undefined {
  return registry.get(id);
}

/** Registra/substitui um conector (extensão ou testes). */
export function registerConnector(c: SearchConnector) {
  registry.set(c.id, c);
}

export const connectorIds = () => [...registry.keys()];
