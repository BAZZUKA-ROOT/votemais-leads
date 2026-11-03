import { closeDb } from '../db/client.js';
import { log } from '../lib/logger.js';
import { closeRedis } from '../queue/connection.js';
import { closeQueues } from '../queue/queues.js';
import { startWorkers } from './index.js';

const stop = await startWorkers();
const shutdown = async (sig: string) => {
  log.info(`${sig} recebido, finalizando workers (tarefas em andamento serão concluídas)`);
  await stop();
  await closeQueues();
  await closeRedis();
  await closeDb();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
