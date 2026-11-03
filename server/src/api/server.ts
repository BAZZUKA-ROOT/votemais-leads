import { env } from '../config/env.js';
import { closeDb } from '../db/client.js';
import { log } from '../lib/logger.js';
import { closeRedis } from '../queue/connection.js';
import { closeQueues } from '../queue/queues.js';
import { ensureIntegrationRows } from '../services/integrations.js';
import { syncSchedules } from '../services/scheduler.js';
import { buildApp } from './app.js';

const app = await buildApp();
await ensureIntegrationRows();
await syncSchedules().catch((err) => log.error({ err }, 'falha ao sincronizar agendamentos'));
await app.listen({ host: env.API_HOST, port: env.API_PORT });

const shutdown = async (sig: string) => {
  log.info(`${sig} recebido, encerrando API`);
  await app.close();
  await closeQueues();
  await closeRedis();
  await closeDb();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
