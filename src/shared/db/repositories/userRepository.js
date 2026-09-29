import { and, asc, eq, isNull } from 'drizzle-orm';

import { notifyChange } from '../changes';
import { newId, now } from '../ids';
import { members, users } from '../schema';

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

// The device has a single local profile; onboarding is done once it exists. Saving it also
// updates the "me" member in every group.
export function saveProfile(db, { name, avatarColor, avatarPath = null, defaultCurrency }) {
  const timestamp = now();
  const trimmed = name.trim();
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
    tx.update(members)
      .set({ name: trimmed, avatarColor, avatarPath, updatedAt: timestamp })
      .where(and(eq(members.isLocalUser, true), isNull(members.deletedAt)))
      .run();
    return userId;
  });
  notifyChange(['users', 'members']);
  return id;
}

export function setDefaultCurrency(db, currency) {
  const user = getLocalUser(db);
  if (!user) return;
  db.update(users)
    .set({ defaultCurrency: currency, updatedAt: now() })
    .where(eq(users.id, user.id))
    .run();
  notifyChange(['users']);
}
