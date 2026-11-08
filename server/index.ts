import { resolve } from 'node:path';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { migrate } from './db/migrate.ts';
import { SetupState, setupMessage } from './auth/setup.ts';
import { buildApp } from './app.ts';

const config = loadConfig();
const db = openDatabase(config.dataDir);
const migration = migrate(db, resolve(config.dataDir, 'backups'));
const setup = new SetupState(db);
const app = await buildApp({ config, db, setup });

if (migration.applied.length > 0) {
  app.log.info({ applied: migration.applied, backup: migration.backupFile }, 'Database migrations applied');
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

if (setup.required) console.log(setupMessage(setup.generateCode(), config.port));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().then(() => {
      db.close();
      process.exit(0);
    });
  });
}
