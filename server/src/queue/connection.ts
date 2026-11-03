import { Redis, type RedisOptions } from 'ioredis';
import { env } from '../config/env.js';

const opts: RedisOptions = { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false };

let shared: Redis | null = null;

/** Conexão compartilhada para comandos (locks, contadores). */
export function redis(): Redis {
  if (!shared) shared = new Redis(env.REDIS_URL, opts);
  return shared;
}

/** BullMQ exige conexões dedicadas para Workers (comandos bloqueantes). */
export function newRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, opts);
}

export async function closeRedis() {
  if (shared) {
    await shared.quit().catch(() => undefined);
    shared = null;
  }
}
