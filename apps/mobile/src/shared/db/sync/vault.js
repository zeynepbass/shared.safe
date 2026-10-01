import { isNull } from 'drizzle-orm';

import { Automerge } from '@ortak-kasa/core/automerge';
import { decodeKeyring, encodeKeyring } from '@ortak-kasa/core/crypto';

import { notifyChange } from '../changes';
import { now } from '../ids';
import { getSetting, SETTING_KEYS, upsertSetting } from '../repositories/settingsRepository';
import { groupDocs, syncGroups, users } from '../schema';
import { keyStoreOf } from '../security/keystore';
import {
  getIdentity,
  groupKeys,
  relayTokenFor,
  saveGroupKeys,
  VAULT_EXTRA_ITEM,
} from '../security/keys';
import { crypto } from '../security/sodium';

// The vault is the user's backup on the relay: their profile and, for every group, its keys and
// which member they are. It is sealed with a key derived from the recovery phrase, so the phrase
// alone brings everything back on a new phone (the group data itself comes through sync).
//
// Local changes bump a version number; the vault is due while the version last stored on the
// relay is behind it. Two devices of the same user may both write it: the relay only accepts a
// write based on the latest revision, and the loser merges before trying again.

const VAULT_FORMAT = 1;

export function markVaultChanged(executor) {
  const version = Number(getSetting(executor, SETTING_KEYS.vaultVersion) ?? 0);
  upsertSetting(executor, SETTING_KEYS.vaultVersion, version + 1);
}

function localEntries(db) {
  return db
    .select()
    .from(syncGroups)
    .where(isNull(syncGroups.removedAt))
    .all()
    .map((row) => ({ row, keys: groupKeys(db, row.groupId) }))
    .filter(({ keys }) => keys.length > 0)
    .map(({ row, keys }) => ({
      id: row.groupId,
      keys: encodeKeyring(keys),
      member: row.localMemberId,
    }));
}

// Groups found in another device's backup but not on this one, kept so a merge loses nothing.
function extraEntries(db) {
  try {
    return JSON.parse(keyStoreOf(db).get(VAULT_EXTRA_ITEM) ?? '[]');
  } catch {
    return [];
  }
}

function backupContents(db, profile) {
  const local = localEntries(db);
  const known = new Set(local.map((g) => g.id));
  return {
    v: VAULT_FORMAT,
    profile: {
      name: profile.name,
      avatarColor: profile.avatarColor,
      defaultCurrency: profile.defaultCurrency,
    },
    groups: [...local, ...extraEntries(db).filter((g) => !known.has(g.id))],
  };
}

// The storage side of SyncClient's backup methods.
export function createVaultStore(db) {
  let sending = null;
  return {
    vaultOutbox() {
      const identity = getIdentity(db);
      const profile = db.select().from(users).where(isNull(users.deletedAt)).get();
      if (!identity || !profile) return null;
      const version = getSetting(db, SETTING_KEYS.vaultVersion) ?? '0';
      if (getSetting(db, SETTING_KEYS.vaultSaved) === version) return null;
      sending = version;
      return {
        vault: identity.vault.id,
        token: identity.vault.token,
        rev: Number(getSetting(db, SETTING_KEYS.vaultRev) ?? 0),
        data: crypto.sealVault(identity.vault.key, backupContents(db, profile)),
      };
    },

    vaultSaved(rev) {
      db.transaction((tx) => {
        upsertSetting(tx, SETTING_KEYS.vaultRev, rev);
        if (sending !== null) upsertSetting(tx, SETTING_KEYS.vaultSaved, sending);
      });
      sending = null;
    },

    // `data` is null when the relay has no backup at this revision (e.g. a fresh vault).
    vaultMerge(rev, data) {
      const identity = getIdentity(db);
      let theirs = [];
      try {
        if (data) theirs = crypto.openVault(identity.vault.key, data).groups ?? [];
      } catch (error) {
        console.warn(`Backup on the relay could not be read (${error.code ?? error.message})`);
      }
      const known = new Set(localEntries(db).map((g) => g.id));
      const extra = [...extraEntries(db), ...theirs].filter(
        (g, i, all) => !known.has(g.id) && all.findIndex((o) => o.id === g.id) === i,
      );
      keyStoreOf(db).set(VAULT_EXTRA_ITEM, JSON.stringify(extra));
      upsertSetting(db, SETTING_KEYS.vaultRev, rev);
      sending = null;
    },
  };
}

// Opens a backup fetched with the identity of `secret`. Throws a CryptoError if it does not open.
export function readBackup(secret, data) {
  const identity = crypto.identityFromSecret(secret);
  const contents = crypto.openVault(identity.vault.key, data);
  if (contents?.v !== VAULT_FORMAT || !contents.profile?.name) {
    throw Object.assign(new Error('unsupportedBackup'), { code: 'unsupportedBackup' });
  }
  return contents;
}

// Registers every group of a backup on this device (its data then arrives through sync) and
// records the backup as current.
export function restoreGroups(db, { rev, contents }) {
  for (const entry of contents.groups) saveGroupKeys(db, entry.id, decodeKeyring(entry.keys));
  const empty = Automerge.save(Automerge.init());
  db.transaction((tx) => {
    for (const entry of contents.groups) {
      tx.insert(syncGroups)
        .values({
          groupId: entry.id,
          token: relayTokenFor(entry.id, groupKeys(db, entry.id)),
          cursor: 0,
          localMemberId: entry.member ?? null,
          joinedAt: now(),
        })
        .onConflictDoNothing()
        .run();
      tx.insert(groupDocs)
        .values({ groupId: entry.id, snapshot: empty, updatedAt: now() })
        .onConflictDoNothing()
        .run();
    }
    const version = Number(getSetting(tx, SETTING_KEYS.vaultVersion) ?? 0);
    upsertSetting(tx, SETTING_KEYS.vaultRev, rev);
    upsertSetting(tx, SETTING_KEYS.vaultSaved, version);
    upsertSetting(tx, SETTING_KEYS.recoveryConfirmed, 1);
  });
  notifyChange(['settings', 'sync_groups']);
}
