import { lookup } from 'node:dns/promises';
import net from 'node:net';
import robotsParserModule from 'robots-parser';
import { env } from '../config/env.js';
import { redis } from '../queue/connection.js';

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
}

export class FetchBlockedError extends Error {}

const MAX_BYTES = 2_500_000;
const TIMEOUT_MS = 15_000;
const DOMAIN_INTERVAL_MS = 2_500;

// pacote CJS com tipagem ESM: normaliza o export
type RobotsFactory = (url: string, robotstxt: string) => { isAllowed(url: string, ua?: string): boolean | undefined };
const robotsParser: RobotsFactory =
  ((robotsParserModule as unknown as { default?: RobotsFactory }).default ?? robotsParserModule) as RobotsFactory;

export type FetchImpl = typeof fetch;
let fetchImpl: FetchImpl = (...args) => fetch(...args);
let skipNetworkGuards = false;

/** Permite injetar fetch em testes. */
export function setFetchImpl(impl: FetchImpl | null, opts?: { skipGuards?: boolean }) {
  fetchImpl = impl ?? ((...args) => fetch(...args));
  skipNetworkGuards = Boolean(opts?.skipGuards);
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.');
}

/** Proteção SSRF: bloqueia hosts que resolvem para redes internas. */
async function assertPublicHost(url: URL) {
  if (skipNetworkGuards) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchBlockedError('Protocolo não permitido');
  const addrs = await lookup(url.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new FetchBlockedError(`Host ${url.hostname} resolve para endereço não público`);
  }
}

/** Intervalo mínimo entre requisições ao mesmo domínio (cortesia com os sites). */
async function throttleDomain(host: string) {
  if (skipNetworkGuards) return;
  const key = `vml:throttle:${host}`;
  for (let i = 0; i < 40; i++) {
    const ok = await redis().set(key, '1', 'PX', DOMAIN_INTERVAL_MS, 'NX');
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function rawGet(url: string, accept: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      redirect: 'manual',
      signal: ctrl.signal,
      headers: { 'user-agent': env.CRAWLER_USER_AGENT, accept, 'accept-language': 'pt-BR,pt;q=0.9' },
    });
  } finally {
    clearTimeout(t);
  }
}

const robotsCache = new Map<string, { at: number; allowed: (u: string) => boolean }>();

async function robotsAllows(url: URL): Promise<boolean> {
  if (skipNetworkGuards) return true;
  const origin = url.origin;
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.allowed(url.toString());
  let allowed: (u: string) => boolean = () => true;
  try {
    const res = await rawGet(`${origin}/robots.txt`, 'text/plain');
    if (res.ok) {
      const txt = (await res.text()).slice(0, 200_000);
      const parser = robotsParser(`${origin}/robots.txt`, txt);
      allowed = (u) => parser.isAllowed(u, env.CRAWLER_USER_AGENT) !== false;
    }
  } catch {
    // robots.txt inacessível => permitido (RFC 9309 §2.3.1.3 para erros de rede é "unreachable": tratamos como permitido)
  }
  robotsCache.set(origin, { at: Date.now(), allowed });
  return allowed(url.toString());
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Baixa página pública respeitando robots.txt, limites de tamanho/tempo e proteção SSRF. */
export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let current = new URL(rawUrl);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicHost(current);
    if (!(await robotsAllows(current))) throw new FetchBlockedError(`robots.txt não permite ${current.toString()}`);
    await throttleDomain(current.hostname);
    const res = await rawGet(current.toString(), 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5');
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, current);
      continue;
    }
    const contentType = res.headers.get('content-type') ?? '';
    const html = /html|xml|text\/plain/i.test(contentType) || !contentType ? await readLimited(res) : '';
    return { url: rawUrl, finalUrl: current.toString(), status: res.status, contentType, html };
  }
  throw new Error('Redirecionamentos em excesso');
}

/** Verificação leve de disponibilidade (usada na atualização automática). */
export async function checkAvailability(url: string): Promise<{ ok: boolean; status: number | null; page?: FetchedPage; error?: string }> {
  try {
    const page = await fetchPage(url);
    return { ok: page.status >= 200 && page.status < 400, status: page.status, page };
  } catch (err) {
    return { ok: false, status: null, error: err instanceof Error ? err.message : String(err) };
  }
}
