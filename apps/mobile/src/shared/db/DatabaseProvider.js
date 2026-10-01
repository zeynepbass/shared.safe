import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { createContext, useContext, useMemo } from 'react';

import { createDb, DATABASE_NAME } from './client';
import { migrateDatabase } from './migrate';

const DbContext = createContext(null);

function DrizzleProvider({ children }) {
  const sqlite = useSQLiteContext();
  const db = useMemo(() => createDb(sqlite), [sqlite]);
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

const runNow = (run) => run();

// `around` wraps opening and migrating the database, e.g. to time it.
export function DatabaseProvider({ children, around = runNow }) {
  return (
    <SQLiteProvider
      databaseName={DATABASE_NAME}
      onInit={(sqlite) => around(() => migrateDatabase(sqlite))}
    >
      <DrizzleProvider>{children}</DrizzleProvider>
    </SQLiteProvider>
  );
}

export function useDb() {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb must be used inside DatabaseProvider');
  return db;
}
