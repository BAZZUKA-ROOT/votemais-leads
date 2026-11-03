import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema.js';

// DATE como string (YYYY-MM-DD) para evitar deslocamento de fuso
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
});

export type DB = NodePgDatabase<typeof schema>;
export const db: DB = drizzle(pool, { schema, casing: 'snake_case' });
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export { schema };

export async function closeDb() {
  await pool.end();
}
