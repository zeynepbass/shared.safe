import { createSyncStore } from '../repositories/syncRepository';

// Stands in for the relay, following the same rules as the real one: an append-only log per
// group behind a token, token replacement with key envelopes for the old token, and vaults that
// only take a write based on their latest revision. It sees exactly what the relay would.
export function createRelay() {
  const groups = new Map(); // groupId → { token, log: [sealed], retired: Map<token, envelopes> }
  const vaults = new Map(); // vaultId → { token, rev, data }

  function syncGroup(store, { groupId, token, cursor }) {
    if (!groups.has(groupId)) groups.set(groupId, { token, log: [], retired: new Map() });
    const group = groups.get(groupId);
    if (group.token !== token) {
      const envelopes = group.retired.get(token);
      if (envelopes && store.rekeyed(groupId, envelopes)) {
        syncGroup(
          store,
          store.groups().find((g) => g.groupId === groupId),
        );
      }
      return;
    }
    const missed = group.log.slice(cursor).map((data, i) => ({ seq: cursor + i + 1, data }));
    if (missed.length) store.receive(groupId, missed);
    const prepared = store.prepareRekey(groupId);
    if (prepared) {
      group.retired.set(group.token, prepared.envelopes);
      group.token = prepared.next;
      store.commitRekey(groupId, prepared);
    }
    const outbox = store.outbox(groupId);
    for (const entry of outbox) group.log.push(entry.data);
    store.acknowledge(
      groupId,
      outbox.map((e) => e.id),
      group.log.length,
    );
  }

  function backUp(store) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const backup = store.vaultOutbox();
      if (!backup) return;
      const current = vaults.get(backup.vault);
      if (current && current.token !== backup.token) return;
      const rev = current?.rev ?? 0;
      if (backup.rev !== rev) {
        store.vaultMerge(rev, current?.data ?? null);
        continue;
      }
      vaults.set(backup.vault, { token: backup.token, rev: rev + 1, data: backup.data });
      store.vaultSaved(rev + 1);
    }
  }

  return {
    groups,
    vaults,
    // What SyncClient does on a connection: every group, then the backup.
    sync(db) {
      const store = createSyncStore(db);
      for (const group of store.groups()) syncGroup(store, group);
      backUp(store);
    },
    fetchVault({ vault, token }) {
      const current = vaults.get(vault);
      if (current && current.token !== token) throw new Error('forbidden');
      return { rev: current?.rev ?? 0, data: current?.data ?? null };
    },
  };
}
