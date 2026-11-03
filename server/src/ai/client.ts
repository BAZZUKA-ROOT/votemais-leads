import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { IntegrationUnavailableError } from '../lib/errors.js';
import { getIntegration, recordUsage, requireIntegration } from '../services/integrations.js';

/** US$ por 1M tokens (tabela oficial Anthropic). */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
};

export function estimateCost(model: string, input: number, output: number): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING['claude-opus-5-5']!;
  return (input * p.input + output * p.output) / 1_000_000;
}

export type AiPurpose = 'extraction' | 'classification' | 'message' | 'refresh';

export interface AiRequest<S extends z.ZodType> {
  purpose: AiPurpose;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
  jobId?: string | null;
}

export interface AiResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export class AiRefusalError extends Error {}
export class AiOutputError extends Error {}

export type AiImpl = <S extends z.ZodType>(req: AiRequest<S>) => Promise<AiResult<z.infer<S>>>;

let override: AiImpl | null = null;
/** Injeção para testes automatizados. */
export function setAiImpl(impl: AiImpl | null) {
  override = impl;
}

const MODEL_KEY: Record<AiPurpose, string> = {
  extraction: 'extractionModel',
  classification: 'classificationModel',
  message: 'messageModel',
  refresh: 'classificationModel',
};

let cached: { key: string; client: Anthropic } | null = null;
function clientFor(apiKey: string) {
  if (!cached || cached.key !== apiKey) cached = { key: apiKey, client: new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 }) };
  return cached.client;
}

export type AiMode = 'anthropic' | 'ollama' | 'rules';

/** Provedor ativo, por prioridade: Anthropic → Ollama (local) → regras (sem IA). */
export async function aiMode(): Promise<AiMode | null> {
  if (override) return 'anthropic';
  for (const p of ['anthropic', 'ollama', 'rules'] as const) {
    if ((await getIntegration(p)).ready) return p;
  }
  return null;
}

export async function isAiReady(): Promise<boolean> {
  return (await aiMode()) !== null;
}

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

/** IA local via Ollama com saída estruturada (JSON Schema). Custo zero. */
async function ollamaCall<S extends z.ZodType>(req: AiRequest<S>): Promise<AiResult<z.infer<S>>> {
  const integ = await requireIntegration('ollama');
  const base = String(integ.config.baseUrl).replace(/\/+$/, '');
  const model = String(integ.config.model);
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: z.toJSONSchema(req.schema),
        options: { temperature: 0, num_ctx: 16384 },
        messages: [
          { role: 'system', content: `${req.system}\nResponda somente com JSON válido no formato solicitado.` },
          { role: 'user', content: req.user },
        ],
      }),
      signal: AbortSignal.timeout(300_000),
    });
    const body = (await res.json().catch(() => ({}))) as OllamaChatResponse;
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${body.error ?? ''}`);
    const parsed = req.schema.safeParse(JSON.parse(body.message?.content ?? 'null'));
    const inputTokens = body.prompt_eval_count ?? 0;
    const outputTokens = body.eval_count ?? 0;
    if (!parsed.success) {
      await recordUsage({ provider: 'ollama', operation: req.purpose, model, inputTokens, outputTokens, success: false, durationMs: Date.now() - started, jobId: req.jobId, error: 'saída inválida' });
      throw new AiOutputError('Saída do modelo local não segue o formato esperado');
    }
    await recordUsage({ provider: 'ollama', operation: req.purpose, model, inputTokens, outputTokens, costUsd: 0, success: true, durationMs: Date.now() - started, jobId: req.jobId });
    return { data: parsed.data as z.infer<S>, model: `ollama:${model}`, inputTokens, outputTokens, costUsd: 0 };
  } catch (err) {
    if (err instanceof AiOutputError) throw err;
    await recordUsage({ provider: 'ollama', operation: req.purpose, model, success: false, durationMs: Date.now() - started, jobId: req.jobId, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export async function testOllama(): Promise<void> {
  const integ = await requireIntegration('ollama');
  const base = String(integ.config.baseUrl).replace(/\/+$/, '');
  const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { models?: Array<{ name: string }> };
  const model = String(integ.config.model);
  if (!j.models?.some((m) => m.name === model || m.name === `${model}:latest`)) {
    throw new Error(`Modelo "${model}" não baixado. Rode: ollama pull ${model}`);
  }
}

async function anthropicCall<S extends z.ZodType>(req: AiRequest<S>): Promise<AiResult<z.infer<S>>> {
  const integ = await requireIntegration('anthropic');
  const model = String(integ.config[MODEL_KEY[req.purpose]] ?? 'claude-opus-5-5');
  const effort = String(integ.config.effort ?? 'low') as 'low' | 'medium' | 'high';
  const client = clientFor(integ.credentials.apiKey!);
  const started = Date.now();
  try {
    const res = await client.beta.messages.parse({
      model,
      max_tokens: req.maxTokens ?? 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      output_config: { effort, format: betaZodOutputFormat(req.schema) },
    });
    const servedModel = res.model;
    const inputTokens = res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    const outputTokens = res.usage.output_tokens;
    const costUsd = estimateCost(servedModel, inputTokens, outputTokens);
    if (res.stop_reason === 'refusal') {
      await recordUsage({ provider: 'anthropic', operation: req.purpose, model: servedModel, inputTokens, outputTokens, costUsd, success: false, durationMs: Date.now() - started, jobId: req.jobId, error: 'refusal' });
      throw new AiRefusalError(`Modelo recusou a solicitação (${res.stop_details?.category ?? 'sem categoria'})`);
    }
    if (res.stop_reason === 'max_tokens' || res.parsed_output == null) {
      await recordUsage({ provider: 'anthropic', operation: req.purpose, model: servedModel, inputTokens, outputTokens, costUsd, success: false, durationMs: Date.now() - started, jobId: req.jobId, error: `saída inválida (${res.stop_reason})` });
      throw new AiOutputError(`Saída estruturada inválida (stop_reason=${res.stop_reason})`);
    }
    await recordUsage({ provider: 'anthropic', operation: req.purpose, model: servedModel, inputTokens, outputTokens, costUsd, success: true, durationMs: Date.now() - started, jobId: req.jobId });
    return { data: res.parsed_output as z.infer<S>, model: servedModel, inputTokens, outputTokens, costUsd };
  } catch (err) {
    if (err instanceof AiRefusalError || err instanceof AiOutputError || err instanceof IntegrationUnavailableError) throw err;
    await recordUsage({ provider: 'anthropic', operation: req.purpose, model, success: false, durationMs: Date.now() - started, jobId: req.jobId, error: err instanceof Error ? err.message : String(err) });
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new IntegrationUnavailableError('anthropic', `Credencial Anthropic rejeitada: ${err.message}`);
    }
    throw err;
  }
}

/** Chamada a um LLM (Anthropic ou Ollama). O modo "regras" é tratado em cada módulo de IA. */
export async function aiCall<S extends z.ZodType>(req: AiRequest<S>): Promise<AiResult<z.infer<S>>> {
  if (override) return override(req);
  const mode = await aiMode();
  if (mode === 'ollama') return ollamaCall(req);
  return anthropicCall(req);
}

/** Teste de conexão real (lista modelos). */
export async function testAnthropic(): Promise<void> {
  const integ = await requireIntegration('anthropic');
  const client = clientFor(integ.credentials.apiKey!);
  const model = String(integ.config.classificationModel ?? 'claude-opus-5-5');
  await client.models.retrieve(model);
}
