import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';

import { updateMember } from '@ortak-kasa/core/groupDoc';

import { notifyChange } from '../changes';
import { newId, now } from '../ids';
import { members, syncGroups, users } from '../schema';
import { ensureRecoverySecret } from '../security/keys';
import { commitGroupChange } from '../sync/groupDocs';
import { markVaultChanged } from '../sync/vault';

export function getLocalUser(db) {
  return (
    db
      .select()
      .from(users)
      .where(isNull(users.deletedAt))
      .orderBy(asc(users.createdAt))
      .limit(1)
      .get() ?? null
  );
}

export function hasLocalUser(db) {
  return getLocalUser(db) !== null;
}

// The device has a single local profile; creating it also creates the user's recovery secret
// (and with it their identity). Saving it also updates the "me" member in every group.
export function saveProfile(db, { name, avatarColor, avatarPath = null, defaultCurrency }) {
  const timestamp = now();
  const trimmed = name.trim();
  ensureRecoverySecret(db);
  const id = db.transaction((tx) => {
    const existing = getLocalUser(tx);
    let userId = existing?.id;
    if (existing) {
      tx.update(users)
        .set({
          name: trimmed,
          avatarColor,
          avatarPath,
          defaultCurrency: defaultCurrency ?? existing.defaultCurrency,
          updatedAt: timestamp,
        })
        .where(eq(users.id, existing.id))
        .run();
    } else {
      userId = newId();
      tx.insert(users)
        .values({
          id: userId,
          name: trimmed,
          avatarColor,
          avatarPath,
          defaultCurrency: defaultCurrency ?? 'TRY',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
    }
    // The photo never leaves the device, so it is written straight into the local rows.
    tx.update(members)
      .set({ avatarPath })
      .where(and(eq(members.isLocalUser, true), isNull(members.deletedAt)))
      .run();
    markVaultChanged(tx);
    return userId;
  });
  // Name and colour are part of each group, so every group gets the change.
  for (const sync of db
    .select()
    .from(syncGroups)
    .where(isNotNull(syncGroups.localMemberId))
    .all()) {
    const member = db.select().from(members).where(eq(members.id, sync.localMemberId)).get();
    if (!member || member.deletedAt) continue;
    if (member.name === trimmed && member.avatarColor === avatarColor) continue;
    commitGroupChange(db, sync.groupId, (doc, ctx) =>
      updateMember(doc, sync.localMemberId, { name: trimmed, avatarColor }, ctx),
    );
  }
  notifyChange(['users', 'members', 'settings']);
  return id;
}

export function setDefaultCurrency(db, currency) {
  const user = getLocalUser(db);
  if (!user) return;
  db.transaction((tx) => {
    tx.update(users)
      .set({ defaultCurrency: currency, updatedAt: now() })
      .where(eq(users.id, user.id))
      .run();
    markVaultChanged(tx);
  });
  notifyChange(['users', 'settings']);
}
