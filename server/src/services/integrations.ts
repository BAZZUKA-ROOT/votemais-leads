import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { apiUsage, integrations, type Integration } from '../db/schema.js';
import { decryptJson, encryptJson, maskSecret } from '../lib/crypto.js';
import { badRequest, IntegrationUnavailableError, notFound } from '../lib/errors.js';

export type ProviderId =
  | 'searxng'
  | 'brave'
  | 'serper'
  | 'google_cse'
  | 'tavily'
  | 'anthropic'
  | 'ollama'
  | 'rules'
  | 'brasilapi'
  | 'n8n';

export interface FieldDef {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  help?: string;
  type?: 'text' | 'url' | 'number' | 'select';
  options?: string[];
}

export interface ProviderDef {
  id: ProviderId;
  kind: 'search' | 'ai' | 'enrichment' | 'automation';
  label: string;
  description: string;
  docsUrl: string;
  fields: FieldDef[];
  defaultConfig: Record<string, unknown>;
  pricingNote: string;
}

export const ANTHROPIC_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'searxng',
    kind: 'search',
    label: 'SearXNG (self-hosted)',
    description: 'Metabuscador open-source hospedado na sua VPS. Custo zero por consulta. Requer formato JSON habilitado.',
    docsUrl: 'https://docs.searxng.org/dev/search_api.html',
    fields: [
      { key: 'baseUrl', label: 'URL base', secret: false, required: true, type: 'url', placeholder: 'http://searxng:8080' },
      { key: 'engines', label: 'Engines (opcional, separadas por vírgula)', secret: false, required: false, placeholder: 'brave,duckduckgo,mojeek' },
    ],
    defaultConfig: { pricePer1000: 0 },
    pricingNote: 'Sem custo por consulta (infraestrutura própria).',
  },
  {
    id: 'brave',
    kind: 'search',
    label: 'Brave Search API',
    description: 'API oficial de busca do Brave com índice próprio.',
    docsUrl: 'https://api-dashboard.search.brave.com/app/documentation/web-search/get-started',
    fields: [{ key: 'apiKey', label: 'Subscription Token', secret: true, required: true }],
    defaultConfig: { pricePer1000: 5 },
    pricingNote: 'Preço por 1.000 consultas configurável (padrão US$ 5).',
  },
  {
    id: 'serper',
    kind: 'search',
    label: 'Serper.dev (Google SERP)',
    description: 'Resultados do Google via API comercial.',
    docsUrl: 'https://serper.dev/',
    fields: [{ key: 'apiKey', label: 'API Key', secret: true, required: true }],
    defaultConfig: { pricePer1000: 1 },
    pricingNote: 'Preço por 1.000 consultas configurável (padrão US$ 1).',
  },
  {
    id: 'google_cse',
    kind: 'search',
    label: 'Google Programmable Search (Custom Search JSON API)',
    description: 'API oficial do Google. Atenção: o Google encerrou novos cadastros e anunciou descontinuação — use apenas se já possui acesso.',
    docsUrl: 'https://developers.google.com/custom-search/v1/overview',
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true, required: true },
      { key: 'cx', label: 'Search Engine ID (cx)', secret: false, required: true },
    ],
    defaultConfig: { pricePer1000: 5 },
    pricingNote: '100 consultas/dia grátis; depois US$ 5 por 1.000 (configurável).',
  },
  {
    id: 'tavily',
    kind: 'search',
    label: 'Tavily Search',
    description: 'API de busca voltada a agentes de IA.',
    docsUrl: 'https://docs.tavily.com/documentation/api-reference/endpoint/search',
    fields: [{ key: 'apiKey', label: 'API Key', secret: true, required: true }],
    defaultConfig: { pricePer1000: 8 },
    pricingNote: 'Busca básica = 1 crédito. Preço por 1.000 configurável (padrão US$ 8).',
  },
  {
    id: 'anthropic',
    kind: 'ai',
    label: 'Anthropic Claude',
    description: 'Extração estruturada, classificação de oportunidades e geração de mensagens.',
    docsUrl: 'https://platform.claude.com/docs/en/api/overview',
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true, required: true, placeholder: 'sk-ant-...' },
      { key: 'extractionModel', label: 'Modelo — extração', secret: false, required: false, type: 'select', options: [...ANTHROPIC_MODELS] },
      { key: 'classificationModel', label: 'Modelo — classificação', secret: false, required: false, type: 'select', options: [...ANTHROPIC_MODELS] },
      { key: 'messageModel', label: 'Modelo — mensagens', secret: false, required: false, type: 'select', options: [...ANTHROPIC_MODELS] },
      { key: 'effort', label: 'Esforço de raciocínio', secret: false, required: false, type: 'select', options: ['low', 'medium', 'high'] },
    ],
    defaultConfig: {
      extractionModel: 'claude-opus-5-5',
      classificationModel: 'claude-opus-5-5',
      messageModel: 'claude-opus-5-5',
      effort: 'low',
    },
    pricingNote: 'Custo calculado por tokens (tabela oficial por modelo). Haiku 5.5 reduz o custo em ~40x.',
  },
  {
    id: 'ollama',
    kind: 'ai',
    label: 'Ollama (IA local gratuita)',
    description: 'Modelo open-source rodando na sua máquina/VPS. Sem custo por uso. Recomendado: qwen2.5:7b (≈8 GB de RAM) ou llama3.1:8b.',
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
    fields: [
      { key: 'baseUrl', label: 'URL do Ollama', secret: false, required: true, type: 'url', placeholder: 'http://ollama:11434' },
      { key: 'model', label: 'Modelo', secret: false, required: true, placeholder: 'qwen2.5:7b' },
    ],
    defaultConfig: { baseUrl: 'http://ollama:11434', model: 'qwen2.5:7b' },
    pricingNote: 'Gratuito (usa CPU/RAM do servidor). Mais lento que APIs pagas.',
  },
  {
    id: 'rules',
    kind: 'ai',
    label: 'Modo regras (sem IA, gratuito)',
    description: 'Extração, classificação e mensagens por regras determinísticas a partir do texto das fontes. Usado quando nenhuma IA está configurada.',
    docsUrl: 'https://leads.votemais.online/integrations',
    fields: [],
    defaultConfig: {},
    pricingNote: 'Gratuito. Menos preciso que IA para identificar nomes e organizadores.',
  },
  {
    id: 'brasilapi',
    kind: 'enrichment',
    label: 'BrasilAPI — CNPJ',
    description: 'Enriquecimento com dados públicos da Receita Federal quando um CNPJ é publicado na página do evento (razão social, nome fantasia, município/UF).',
    docsUrl: 'https://brasilapi.com.br/docs#tag/CNPJ',
    fields: [],
    defaultConfig: { baseUrl: 'https://brasilapi.com.br', pricePer1000: 0 },
    pricingNote: 'Gratuita.',
  },
  {
    id: 'n8n',
    kind: 'automation',
    label: 'n8n (webhook)',
    description: 'Envia eventos (lead qualificado, follow-up vencido) para um workflow n8n. Nenhuma mensagem é enviada a leads.',
    docsUrl: 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/',
    fields: [
      { key: 'webhookUrl', label: 'URL do webhook', secret: false, required: true, type: 'url' },
      { key: 'token', label: 'Token (header X-VML-Token)', secret: true, required: false },
    ],
    defaultConfig: {},
    pricingNote: 'Self-hosted.',
  },
];

export const providerDef = (id: string) => PROVIDERS.find((p) => p.id === id);

export async function ensureIntegrationRows() {
  for (const p of PROVIDERS) {
    await db
      .insert(integrations)
      .values({ provider: p.id, kind: p.kind, config: p.defaultConfig, enabled: p.id === 'brasilapi' || p.id === 'rules', status: p.fields.some((f) => f.required) ? 'not_configured' : 'configured' })
      .onConflictDoNothing();
  }
}

export interface IntegrationView {
  provider: ProviderId;
  kind: string;
  label: string;
  description: string;
  docsUrl: string;
  pricingNote: string;
  fields: FieldDef[];
  enabled: boolean;
  status: string;
  config: Record<string, unknown>;
  secrets: Record<string, string>; // apenas máscaras
  lastCheckedAt: Date | null;
  lastError: string | null;
  missing: string[];
}

function missingFields(def: ProviderDef, row: Integration, creds: Record<string, string>): string[] {
  return def.fields
    .filter((f) => f.required)
    .filter((f) => (f.secret ? !creds[f.key] : !row.config[f.key]))
    .map((f) => f.label);
}

function readCreds(row: Integration): Record<string, string> {
  if (!row.encryptedCredentials) return {};
  try {
    return decryptJson<Record<string, string>>(row.encryptedCredentials);
  } catch {
    return {};
  }
}

export async function listIntegrations(): Promise<IntegrationView[]> {
  const rows = await db.select().from(integrations);
  return PROVIDERS.map((def) => {
    const row = rows.find((r) => r.provider === def.id);
    if (!row) throw new Error(`Integração ${def.id} ausente — execute o seed`);
    const creds = readCreds(row);
    const secrets: Record<string, string> = {};
    for (const f of def.fields.filter((x) => x.secret)) if (creds[f.key]) secrets[f.key] = maskSecret(creds[f.key]!);
    return {
      provider: def.id,
      kind: def.kind,
      label: def.label,
      description: def.description,
      docsUrl: def.docsUrl,
      pricingNote: def.pricingNote,
      fields: def.fields,
      enabled: row.enabled,
      status: row.status,
      config: row.config,
      secrets,
      lastCheckedAt: row.lastCheckedAt,
      lastError: row.lastError,
      missing: missingFields(def, row, creds),
    };
  });
}

export const saveIntegrationSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  credentials: z.record(z.string(), z.string().max(4000)).optional(),
});

export async function saveIntegration(provider: string, input: z.infer<typeof saveIntegrationSchema>) {
  const def = providerDef(provider);
  if (!def) throw notFound('Integração');
  const [row] = await db.select().from(integrations).where(eq(integrations.provider, provider));
  if (!row) throw notFound('Integração');

  const creds = readCreds(row);
  for (const [k, v] of Object.entries(input.credentials ?? {})) {
    const f = def.fields.find((x) => x.key === k && x.secret);
    if (!f) throw badRequest(`Campo secreto desconhecido: ${k}`);
    if (v === '') delete creds[k];
    else creds[k] = v.trim();
  }
  const config: Record<string, unknown> = { ...row.config };
  for (const [k, v] of Object.entries(input.config ?? {})) {
    const known = def.fields.some((x) => x.key === k && !x.secret) || k === 'pricePer1000';
    if (!known) throw badRequest(`Campo de configuração desconhecido: ${k}`);
    if (v === null || v === '') delete config[k];
    else config[k] = k === 'pricePer1000' ? Number(v) : v;
  }
  const hasCreds = Object.keys(creds).length > 0;
  const missing = missingFields(def, { ...row, config }, creds);
  const hint = def.fields.find((f) => f.secret && creds[f.key]);
  await db
    .update(integrations)
    .set({
      enabled: input.enabled ?? row.enabled,
      config,
      encryptedCredentials: hasCreds ? encryptJson(creds) : null,
      credentialHint: hint ? maskSecret(creds[hint.key]!) : null,
      status: missing.length ? 'not_configured' : 'configured',
      lastError: null,
    })
    .where(eq(integrations.provider, provider));
}

export async function setIntegrationHealth(provider: string, ok: boolean, error?: string) {
  await db
    .update(integrations)
    .set({ status: ok ? 'connected' : 'error', lastCheckedAt: new Date(), lastError: ok ? null : (error ?? 'erro').slice(0, 1000) })
    .where(eq(integrations.provider, provider));
}

export interface ResolvedIntegration {
  provider: ProviderId;
  enabled: boolean;
  ready: boolean;
  config: Record<string, unknown>;
  credentials: Record<string, string>;
  missing: string[];
}

export async function getIntegration(provider: ProviderId): Promise<ResolvedIntegration> {
  const def = providerDef(provider)!;
  const [row] = await db.select().from(integrations).where(eq(integrations.provider, provider));
  if (!row) return { provider, enabled: false, ready: false, config: def.defaultConfig, credentials: {}, missing: ['registro ausente'] };
  const credentials = readCreds(row);
  const missing = missingFields(def, row, credentials);
  return { provider, enabled: row.enabled, ready: row.enabled && missing.length === 0, config: row.config, credentials, missing };
}

export async function requireIntegration(provider: ProviderId): Promise<ResolvedIntegration> {
  const i = await getIntegration(provider);
  if (!i.ready) {
    const why = !i.enabled ? 'desativada' : `pendente: ${i.missing.join(', ')}`;
    throw new IntegrationUnavailableError(provider, `Integração ${providerDef(provider)?.label} ${why}`);
  }
  return i;
}

export async function readyProviders(kind: ProviderDef['kind']): Promise<ResolvedIntegration[]> {
  const out: ResolvedIntegration[] = [];
  for (const p of PROVIDERS.filter((x) => x.kind === kind)) {
    const i = await getIntegration(p.id);
    if (i.ready) out.push(i);
  }
  return out;
}

// ---------- consumo ----------
export interface UsageRecord {
  provider: string;
  operation: string;
  model?: string | null;
  units?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  success: boolean;
  durationMs?: number;
  jobId?: string | null;
  error?: string | null;
}

export async function recordUsage(u: UsageRecord) {
  await db.insert(apiUsage).values({
    provider: u.provider,
    operation: u.operation,
    model: u.model ?? null,
    units: u.units ?? 1,
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    costUsd: (u.costUsd ?? 0).toFixed(6),
    success: u.success,
    durationMs: u.durationMs ?? null,
    jobId: u.jobId ?? null,
    error: u.error?.slice(0, 1000) ?? null,
  });
}

export async function usageToday(provider: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${apiUsage.units}),0)::int` })
    .from(apiUsage)
    .where(sql`${apiUsage.provider} = ${provider} and ${apiUsage.createdAt} >= date_trunc('day', now())`);
  return r?.n ?? 0;
}
