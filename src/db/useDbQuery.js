import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';

import { subscribe } from './changes';

export function useDbQuery(query, deps, tables) {
  const db = useSQLiteContext();
  const [state, setState] = useState({ data: undefined, loading: true, error: null });
  const queryRef = useRef(query);
  const tablesKey = tables.join('|');

  useEffect(() => {
    queryRef.current = query;
  });

  const run = useCallback(async () => {
    try {
      const data = await queryRef.current(db);
      setState({ data, loading: false, error: null });
    } catch (error) {
      console.error(error);
      setState((prev) => ({ ...prev, loading: false, error }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ...deps]);

  useEffect(() => {
    let active = true;
    const guardedRun = () => active && run();
    guardedRun();
    const watched = tablesKey.split('|');
    const unsubscribe = subscribe((changed) => {
      if (watched.some((table) => changed.has(table))) guardedRun();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [run, tablesKey]);

  return state;
}
