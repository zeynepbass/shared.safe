import { and, asc, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { Automerge } from '@ortak-kasa/core/automerge';
import { fromBase64Url, toBase64Url } from '@ortak-kasa/core/crypto';
import { addMember, resolveExpenseConflict } from '@ortak-kasa/core/groupDoc';
import { expenseConflict, keyRecipients } from '@ortak-kasa/core/readGroupDoc';

import { notifyChange } from '../changes';
import { DbValidationError } from '../errors';
import { newId, now } from '../ids';
import { expenses, groupDocs, groups, members, syncGroups, syncOutbox } from '../schema';
import {
  getIdentity,
  groupKeys,
  relayTokenFor,
  saveGroupKeys,
  setRecoverySecret,
} from '../security/keys';
import { crypto } from '../security/sodium';
import {
  commitGroupChange,
  ensureMemberKey,
  getSyncGroup,
  GROUP_TABLES,
  loadGroupDoc,
  receiveGroupChanges,
} from '../sync/groupDocs';
import { encodeInvite, parseInvite } from '../sync/invite';
import { projectGroup } from '../sync/projection';
import { createVaultStore, markVaultChanged, readBackup, restoreGroups } from '../sync/vault';
import { getLocalUser, saveProfile } from './userRepository';

export { getSyncGroup };

export function createInvite(db, groupId) {
  const keys = groupKeys(db, groupId);
  if (!getSyncGroup(db, groupId) || !keys.length) throw new DbValidationError('groupNotFound');
  return encodeInvite({ groupId, keys });
}

// Registers a group from an invite and keeps its keys. Its data arrives through sync; until then
// the group has no rows in the read tables and `listPendingJoins` reports it.
export function joinGroupByInvite(db, text) {
  const invite = parseInvite(text);
  if (!invite) throw new DbValidationError('invalidInvite');
  const existing = getSyncGroup(db, invite.groupId);
  if (existing?.removedAt) {
    // A fresh invite after the old one expired, or after being removed: take the new keys.
    if (invite.keys.length <= groupKeys(db, invite.groupId).length) {
      throw new DbValidationError('inviteExpired');
    }
    adoptKeys(db, invite.groupId, invite.keys, { removedAt: null, rekeyPending: false });
    return { groupId: invite.groupId, alreadyJoined: existing.localMemberId != null };
  }
  if (existing) return { groupId: invite.groupId, alreadyJoined: true };
  saveGroupKeys(db, invite.groupId, invite.keys);
  db.transaction((tx) => {
    tx.insert(syncGroups)
      .values({
        groupId: invite.groupId,
        token: relayTokenFor(invite.groupId, invite.keys),
        cursor: 0,
        localMemberId: null,
        joinedAt: now(),
      })
      .run();
    tx.insert(groupDocs)
      .values({
        groupId: invite.groupId,
        snapshot: Automerge.save(Automerge.init()),
        updatedAt: now(),
      })
      .onConflictDoNothing()
      .run();
    markVaultChanged(tx);
  });
  notifyChange(['sync_groups', 'settings']);
  return { groupId: invite.groupId, alreadyJoined: false };
}

// Joined groups where the user has not yet said which member they are, with whether the group's
// data has arrived, or whether the invite no longer works (the group's key was replaced since).
export function listPendingJoins(db) {
  const rows = db
    .select({ groupId: syncGroups.groupId, name: groups.name, removedAt: syncGroups.removedAt })
    .from(syncGroups)
    .leftJoin(groups, eq(groups.id, syncGroups.groupId))
    .where(isNull(syncGroups.localMemberId))
    .all();
  return rows.map((r) => ({
    groupId: r.groupId,
    name: r.name,
    ready: r.name != null,
    expired: r.removedAt != null,
  }));
}

// `memberId` is an existing member the user says they are, or null to join as a new member
// named after the profile.
export function claimMembership(db, groupId, memberId) {
  const sync = getSyncGroup(db, groupId);
  if (!sync) throw new DbValidationError('groupNotFound');
  if (memberId) {
    const member = db.select().from(members).where(eq(members.id, memberId)).get();
    if (!member || member.groupId !== groupId || member.deletedAt) {
      throw new DbValidationError('memberNotFound');
    }
    db.transaction((tx) => {
      tx.update(syncGroups)
        .set({ localMemberId: memberId })
        .where(eq(syncGroups.groupId, groupId))
        .run();
      projectGroup(tx, groupId, loadGroupDoc(db, groupId));
      markVaultChanged(tx);
    });
    notifyChange(GROUP_TABLES);
    ensureMemberKey(db, groupId);
    return memberId;
  }
  const profile = getLocalUser(db);
  if (!profile) throw new DbValidationError('profileMissing');
  const id = newId();
  commitGroupChange(
    db,
    groupId,
    (doc, ctx) =>
      addMember(
        doc,
        { id, name: profile.name, avatarColor: profile.avatarColor },
        {
          ...ctx,
          actorMemberId: id,
        },
      ),
    {
      afterProject: (tx) => {
        tx.update(syncGroups)
          .set({ localMemberId: id })
          .where(eq(syncGroups.groupId, groupId))
          .run();
        projectGroup(tx, groupId, loadGroupDoc(db, groupId));
        markVaultChanged(tx);
      },
    },
  );
  ensureMemberKey(db, groupId);
  return id;
}

// Is the user still in the group? False once another member replaced the key without them.
export function isRemovedFromGroup(db, groupId) {
  return Boolean(getSyncGroup(db, groupId)?.removedAt);
}

export function removedGroupIds(db) {
  return db
    .select({ id: syncGroups.groupId })
    .from(syncGroups)
    .where(isNotNull(syncGroups.removedAt))
    .all()
    .map((r) => r.id);
}

// Sets up a new device from the backup that belongs to `secret` (fetched from the relay):
// recovery secret, profile, and every group, whose data then arrives through sync. Throws a
// CryptoError if the backup does not open with this secret.
export function restoreAccount(db, secret, { rev, data }) {
  const contents = readBackup(secret, data);
  setRecoverySecret(db, secret);
  saveProfile(db, contents.profile);
  restoreGroups(db, { rev, contents });
}

export function getExpenseConflict(db, expenseId) {
  const row = db.select().from(expenses).where(eq(expenses.id, expenseId)).get();
  if (!row) return null;
  const versions = expenseConflict(loadGroupDoc(db, row.groupId), expenseId);
  return versions && { groupId: row.groupId, expenseId, versions };
}

export function resolveConflict(db, expenseId, versionIndex) {
  const conflict = getExpenseConflict(db, expenseId);
  const version = conflict?.versions[versionIndex];
  if (!version) throw new DbValidationError('conflictNotFound');
  commitGroupChange(db, conflict.groupId, (doc, ctx) =>
    resolveExpenseConflict(doc, expenseId, version, ctx),
  );
}

export function countPendingChanges(db, groupId) {
  const where = groupId ? eq(syncOutbox.groupId, groupId) : undefined;
  return db.select({ n: count() }).from(syncOutbox).where(where).get().n;
}

// Pending change count per group, for the list's sync badges.
export function pendingChangesByGroup(db) {
  const rows = db
    .select({ groupId: syncOutbox.groupId, n: count() })
    .from(syncOutbox)
    .groupBy(syncOutbox.groupId)
    .all();
  return Object.fromEntries(rows.map((r) => [r.groupId, r.n]));
}

function markRemoved(db, groupId) {
  db.transaction((tx) => {
    tx.update(syncGroups).set({ removedAt: now() }).where(eq(syncGroups.groupId, groupId)).run();
    markVaultChanged(tx);
  });
  notifyChange(['sync_groups', 'settings']);
}

function adoptKeys(db, groupId, keys, patch = {}) {
  saveGroupKeys(db, groupId, keys);
  db.transaction((tx) => {
    tx.update(syncGroups)
      .set({ token: relayTokenFor(groupId, keys), ...patch })
      .where(eq(syncGroups.groupId, groupId))
      .run();
    markVaultChanged(tx);
  });
  notifyChange(['sync_groups', 'settings']);
}

// Seals outbox entries with the group's newest key, reusing what was sealed before unless the
// key has changed since. Not a change anyone needs to hear about.
function sealedOutbox(db, groupId) {
  const keys = groupKeys(db, groupId);
  if (!keys.length) return [];
  const rows = db
    .select()
    .from(syncOutbox)
    .where(eq(syncOutbox.groupId, groupId))
    .orderBy(asc(syncOutbox.id))
    .all();
  const fresh = [];
  const entries = rows.map((row) => {
    if (row.sealed && row.sealedEpoch === keys.length)
      return { id: String(row.id), data: row.sealed };
    const sealed = crypto.sealChange(groupId, keys, row.data);
    fresh.push({ id: row.id, sealed });
    return { id: String(row.id), data: sealed };
  });
  if (fresh.length) {
    db.transaction((tx) => {
      for (const { id, sealed } of fresh) {
        tx.update(syncOutbox)
          .set({ sealed, sealedEpoch: keys.length })
          .where(eq(syncOutbox.id, id))
          .run();
      }
    });
  }
  return entries;
}

// The storage side of SyncClient (see core/sync/client.js). Everything is sealed on the way out
// and opened on the way in; the relay only sees envelopes.
export function createSyncStore(db) {
  return {
    groups: () =>
      db
        .select({ groupId: syncGroups.groupId, token: syncGroups.token, cursor: syncGroups.cursor })
        .from(syncGroups)
        .where(isNull(syncGroups.removedAt))
        .all(),
    outbox: (groupId) => sealedOutbox(db, groupId),
    acknowledge: (groupId, ids, seq) => {
      db.transaction((tx) => {
        if (ids.length) {
          tx.delete(syncOutbox)
            .where(and(eq(syncOutbox.groupId, groupId), inArray(syncOutbox.id, ids.map(Number))))
            .run();
        }
        const current = tx.select().from(syncGroups).where(eq(syncGroups.groupId, groupId)).get();
        if (current && seq > current.cursor) {
          tx.update(syncGroups).set({ cursor: seq }).where(eq(syncGroups.groupId, groupId)).run();
        }
      });
      notifyChange(['sync_outbox', 'sync_groups']);
    },
    receive: (groupId, items) => receiveGroupChanges(db, groupId, items),

    // A member was removed: a new key for everyone still in the group (and this user).
    prepareRekey(groupId) {
      const sync = getSyncGroup(db, groupId);
      const keys = groupKeys(db, groupId);
      const identity = getIdentity(db);
      if (!sync?.rekeyPending || sync.removedAt || !keys.length || !identity) return null;
      const key = crypto.newGroupKey();
      const epoch = keys.length + 1;
      const recipients = new Set([
        ...keyRecipients(loadGroupDoc(db, groupId)).map((r) => r.publicKey),
        toBase64Url(identity.publicKey),
      ]);
      const envelopes = [...recipients].map((publicKey) =>
        crypto.sealKeyEnvelope(fromBase64Url(publicKey), { groupId, epoch, key }),
      );
      return { next: crypto.relayToken(groupId, key), envelopes, key };
    },

    commitRekey(groupId, prepared) {
      adoptKeys(db, groupId, [...groupKeys(db, groupId), prepared.key], { rekeyPending: false });
    },

    // Someone replaced the group key. Epochs are the same on every device, so the new key takes
    // its place in the keyring (this also covers a device that stored its own new key but had
    // not recorded the rotation when it was interrupted).
    rekeyed(groupId, envelopes) {
      const identity = getIdentity(db);
      const keys = groupKeys(db, groupId);
      const found = identity && crypto.openKeyEnvelopes(identity, groupId, envelopes);
      if (!found || found.epoch > keys.length + 1) {
        markRemoved(db, groupId);
        return false;
      }
      adoptKeys(db, groupId, [...keys.slice(0, found.epoch - 1), found.key]);
      return true;
    },

    ...createVaultStore(db),
  };
}
