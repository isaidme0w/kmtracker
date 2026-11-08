// Generates a new one-time password for an account, including the protected
// one. Meant for when nobody can sign in to the administrator panel.
import { resolve } from 'node:path';
import { normalizeUsername } from '../../shared/validation.ts';
import { loadConfig } from '../config.ts';
import { openDatabase } from '../db/database.ts';
import { migrate } from '../db/migrate.ts';
import { findAccountByUsername } from '../services/accounts.ts';
import { resetPassword } from '../services/accountAdmin.ts';

const username = process.argv[2];
if (!username) {
  console.error('Usage: npm run reset-password -- <username>');
  process.exit(1);
}

const config = loadConfig();
const db = openDatabase(config.dataDir);
migrate(db, resolve(config.dataDir, 'backups'));

const account = findAccountByUsername(db, normalizeUsername(username));
if (!account) {
  console.error(`Account "${username}" not found.`);
  process.exit(1);
}

const result = await resetPassword(db, null, account.id, { allowProtected: true });
db.close();

console.log(`New one-time password for "${result.username}": ${result.temporaryPassword}`);
console.log(`It expires at ${result.expiresAt}. The user must set their own password after signing in.`);
