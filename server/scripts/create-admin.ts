import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { closeDb } from '../src/db/client.js';
import { createUser } from '../src/services/auth.js';

const rl = createInterface({ input: stdin, output: stdout });
const email = process.argv[2] ?? (await rl.question('E-mail: '));
const name = process.argv[3] ?? (await rl.question('Nome: '));
const password = process.env.ADMIN_PASSWORD ?? (await rl.question('Senha (mín. 12, maiúscula/minúscula/número): '));
rl.close();
try {
  const u = await createUser({ email, name, password, role: 'admin' });
  console.log(`Administrador criado: ${u.email}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
