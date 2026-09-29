import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from './migrations/migrations';

// Tables created by the hand-written schema that predates Drizzle (tracked via user_version).
const LEGACY_TABLES = [
  'expense_shares',
  'settlements',
  'expenses',
  'members',
  'groups',
  'settings',
];

async function dropLegacySchema(sqlite) {
  const row = await sqlite.getFirstAsync('PRAGMA user_version');
  if (!row?.user_version) return;
  await sqlite.execAsync('PRAGMA foreign_keys = OFF');
  await sqlite.withExclusiveTransactionAsync(async (txn) => {
    for (const table of LEGACY_TABLES) await txn.execAsync(`DROP TABLE IF EXISTS ${table}`);
    await txn.execAsync('PRAGMA user_version = 0');
  });
}

export async function migrateDatabase(sqlite) {
  await sqlite.execAsync('PRAGMA journal_mode = WAL');
  await dropLegacySchema(sqlite);
  await sqlite.execAsync('PRAGMA foreign_keys = ON');
  await migrate(drizzle(sqlite), migrations);
}
