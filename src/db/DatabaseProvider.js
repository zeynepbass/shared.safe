import { SQLiteProvider } from 'expo-sqlite';

import { migrateDbIfNeeded } from './migrate';

export const DATABASE_NAME = 'ortak-kasa.db';

export function DatabaseProvider({ children }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
      {children}
    </SQLiteProvider>
  );
}
