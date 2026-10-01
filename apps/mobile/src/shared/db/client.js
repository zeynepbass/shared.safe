import { drizzle } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'ortak-kasa.db';

export function createDb(sqlite) {
  return drizzle(sqlite, { schema });
}
