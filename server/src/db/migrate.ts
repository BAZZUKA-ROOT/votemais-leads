import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, db } from './client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/db -> ../../drizzle  |  dist/db -> ../../drizzle
export const migrationsFolder = path.resolve(here, '../../drizzle');

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => {
      console.log('Migrations aplicadas.');
      return closeDb();
    })
    .catch(async (err) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
