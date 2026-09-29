import { migrations } from './migrations';

export async function migrateDbIfNeeded(db) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  const pending = migrations.filter((m) => m.version > current);

  for (const migration of pending) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(migration.sql);
      await txn.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
