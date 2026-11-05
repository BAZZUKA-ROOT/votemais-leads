/**
 * Redefine a senha de um usuário (e desbloqueia a conta). Uso em produção:
 *   docker compose exec api node dist/cli/reset-password.js email@dominio NovaSenhaForte123
 */
import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { hashPassword, validatePasswordStrength } from '../services/auth.js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: node dist/cli/reset-password.js <email> <nova-senha>');
  process.exit(1);
}
const weak = validatePasswordStrength(password);
if (weak) {
  console.error(weak);
  process.exit(1);
}
const [u] = await db
  .update(users)
  .set({ passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null, isActive: true })
  .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
  .returning({ id: users.id });
if (!u) {
  console.error(`Usuário ${email} não encontrado`);
  await closeDb();
  process.exit(1);
}
await db.delete(sessions).where(eq(sessions.userId, u.id));
console.log(`Senha redefinida para ${email}.`);
await closeDb();
