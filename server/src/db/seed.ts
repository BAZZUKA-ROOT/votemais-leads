import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { closeDb, db } from './client.js';
import { automationSettings, categories, users } from './schema.js';
import { DEFAULT_CATEGORIES, DEFAULT_NEGATIVE } from './seed-data.js';
import { ensureIntegrationRows } from '../services/integrations.js';
import { createUser } from '../services/auth.js';

/** Dados de configuração iniciais (categorias, automação, integrações). Não cria leads. */
export async function seed() {
  for (const c of DEFAULT_CATEGORIES) {
    await db
      .insert(categories)
      .values({ ...c, negativeKeywords: DEFAULT_NEGATIVE })
      .onConflictDoNothing();
  }
  await db.insert(automationSettings).values({ id: 1, searchConnectorOrder: ['searxng', 'brave', 'serper', 'tavily', 'google_cse'] }).onConflictDoNothing();
  await ensureIntegrationRows();

  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (n === 0 && email && password) {
    await createUser({ email, password, name: process.env.ADMIN_NAME ?? 'Administrador', role: 'admin' });
    console.log(`Usuário administrador criado: ${email}`);
  } else if (n === 0) {
    console.log('Nenhum usuário existe. Defina ADMIN_EMAIL e ADMIN_PASSWORD e rode novamente, ou use `pnpm admin:create`.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seed()
    .then(() => {
      console.log('Seed concluído.');
      return closeDb();
    })
    .catch(async (err) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
