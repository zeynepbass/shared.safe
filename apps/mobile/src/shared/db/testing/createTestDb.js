import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

import * as schema from '../schema';
import { attachKeyStore, createMemoryKeyStore } from '../security/keystore';
import { attachReceiptFiles, createMemoryReceiptFiles } from '../sync/receiptFiles';

// The repositories only use Drizzle's synchronous SQLite API, so the same code runs against
// better-sqlite3 in Node with the real migrations applied. Each database gets its own key store
// and its own receipt files, like a phone of its own.
export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '..', 'migrations') });
  const keyStore = createMemoryKeyStore();
  attachKeyStore(db, keyStore);
  const receiptFiles = createMemoryReceiptFiles();
  attachReceiptFiles(db, receiptFiles);
  return { db, sqlite, keyStore, receiptFiles };
}
