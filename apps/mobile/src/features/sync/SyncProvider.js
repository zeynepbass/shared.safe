import { useNetworkState } from 'expo-network';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { SyncClient } from '@ortak-kasa/core/sync/client';
import { subscribe } from '@/shared/db/changes';
import {
  createSyncStore,
  getSetting,
  pendingChangesByGroup,
  removedGroupIds,
  setSetting,
  SETTING_KEYS,
  useDb,
  useDbQuery,
} from '@/shared/db';
import { newId } from '@/shared/db/ids';

// Where the relay lives. Set EXPO_PUBLIC_SYNC_URL for a real server; the default reaches a
// relay started with `npm run server` on the development machine from the iOS simulator.
export const SYNC_URL = process.env.EXPO_PUBLIC_SYNC_URL ?? 'ws://localhost:8787';

const SyncContext = createContext(null);

function deviceIdOf(db) {
  const existing = getSetting(db, SETTING_KEYS.deviceId);
  if (existing) return existing;
  const id = newId();
  setSetting(db, SETTING_KEYS.deviceId, id);
  return id;
}

export function SyncProvider({ children }) {
  const db = useDb();
  const network = useNetworkState();
  const clientRef = useRef(null);
  const [status, setStatus] = useState({ connection: 'idle', lastSyncedAt: null, groupErrors: {} });
  const { data: pendingByGroup } = useDbQuery(pendingChangesByGroup, [], ['sync_outbox']);
  const { data: removed } = useDbQuery(removedGroupIds, [], ['sync_groups']);

  // isInternetReachable is null until the OS knows; trust isConnected until then.
  const online = network.isConnected !== false && network.isInternetReachable !== false;

  useEffect(() => {
    const client = new SyncClient({
      url: SYNC_URL,
      deviceId: deviceIdOf(db),
      store: createSyncStore(db),
      onError: (error) => console.warn('Sync error', error?.message ?? error),
    });
    clientRef.current = client;
    const offStatus = client.onStatus(setStatus);
    // Local edits land in the outbox, new groups and keys in sync_groups and backup bookkeeping
    // in settings: send them right away.
    const offChanges = subscribe((changed) => {
      if (['sync_outbox', 'sync_groups', 'settings'].some((table) => changed.has(table))) {
        client.kick();
      }
    });
    client.start();
    return () => {
      offChanges();
      offStatus();
      client.stop();
      clientRef.current = null;
    };
  }, [db]);

  useEffect(() => {
    clientRef.current?.setNetworkAvailable(online);
  }, [online]);

  const value = useMemo(() => {
    const pending = pendingByGroup ?? {};
    const pendingTotal = Object.values(pending).reduce((sum, n) => sum + n, 0);
    const connected = online && status.connection === 'online';
    return {
      online,
      connection: online ? status.connection : 'offline',
      connected,
      lastSyncedAt: status.lastSyncedAt,
      pendingTotal,
      // One word per group for SyncBadge.
      stateOf(groupId) {
        if (status.groupErrors[groupId] || removed?.includes(groupId)) return 'error';
        if (!connected) return 'offline';
        return pending[groupId] ? 'pending' : 'synced';
      },
      pendingOf: (groupId) => pending[groupId] ?? 0,
      syncNow: () => clientRef.current?.kick(),
      // Reads the backup of a recovery phrase from the relay (restoring on a new phone).
      fetchVault: (access) =>
        clientRef.current
          ? clientRef.current.fetchVault(access)
          : Promise.reject(new Error('offline')),
    };
  }, [online, status, pendingByGroup, removed]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
