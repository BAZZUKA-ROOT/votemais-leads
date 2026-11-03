import { errMsg, syslog } from '../lib/logger.js';
import { getIntegration, recordUsage } from './integrations.js';

/** Envia evento para webhook do n8n, se configurado. Falhas não interrompem o fluxo principal. */
export async function notifyN8n(event: string, payload: Record<string, unknown>) {
  const integ = await getIntegration('n8n');
  if (!integ.ready) return;
  const started = Date.now();
  try {
    const res = await fetch(String(integ.config.webhookUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(integ.credentials.token ? { 'x-vml-token': integ.credentials.token } : {}) },
      body: JSON.stringify({ event, at: new Date().toISOString(), ...payload }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await recordUsage({ provider: 'n8n', operation: event, success: true, durationMs: Date.now() - started });
  } catch (err) {
    await recordUsage({ provider: 'n8n', operation: event, success: false, durationMs: Date.now() - started, error: errMsg(err) });
    await syslog('warn', 'n8n', `Falha ao notificar n8n (${event})`, { error: errMsg(err) });
  }
}
