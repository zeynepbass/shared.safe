import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { notifyChange } from '../changes';
import { DbValidationError } from '../errors';
import { newId, now } from '../ids';
import { groups, members, settlements } from '../schema';
import { logActivity } from './activityRepository';
import { listExpensesForGroups } from './expenseRepository';
import { insertMember } from './memberRepository';

const activeGroup = (id) => and(eq(groups.id, id), isNull(groups.deletedAt));

export function touchGroup(executor, id, at = now()) {
  executor.update(groups).set({ updatedAt: at }).where(eq(groups.id, id)).run();
}

export function getGroup(db, id) {
  return db.select().from(groups).where(activeGroup(id)).get() ?? null;
}

export function listGroups(db) {
  return db
    .select()
    .from(groups)
    .where(and(isNull(groups.deletedAt), isNull(groups.archivedAt)))
    .orderBy(desc(groups.updatedAt))
    .all();
}

export function createGroup(db, { name, type, currency, icon, self }) {
  const timestamp = now();
  const id = newId();
  db.transaction((tx) => {
    tx.insert(groups)
      .values({
        id,
        name: name.trim(),
        type,
        currency,
        icon: icon ?? type,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    logActivity(tx, {
      groupId: id,
      type: 'group_created',
      entityType: 'group',
      entityId: id,
      payload: { name: name.trim() },
      at: timestamp,
    });
    insertMember(
      tx,
      id,
      { name: self.name, avatarColor: self.avatarColor, isLocalUser: true },
      timestamp,
    );
  });
  notifyChange(['groups', 'members', 'activity_log']);
  return id;
}

export function updateGroup(db, id, { name, type, currency, icon }) {
  const timestamp = now();
  db.transaction((tx) => {
    const group = getGroup(tx, id);
    if (!group) throw new DbValidationError('groupNotFound');
    tx.update(groups)
      .set({ name: name.trim(), type, currency, icon: icon ?? type, updatedAt: timestamp })
      .where(eq(groups.id, id))
      .run();
    logActivity(tx, {
      groupId: id,
      type: 'group_updated',
      entityType: 'group',
      entityId: id,
      payload: { name: name.trim() },
      at: timestamp,
    });
  });
  notifyChange(['groups', 'activity_log']);
}

// Children stay untouched; every read goes through an active group, so they disappear with it.
export function softDeleteGroup(db, id) {
  const timestamp = now();
  db.transaction((tx) => {
    const group = getGroup(tx, id);
    if (!group) throw new DbValidationError('groupNotFound');
    tx.update(groups)
      .set({ deletedAt: timestamp, updatedAt: timestamp })
      .where(eq(groups.id, id))
      .run();
    logActivity(tx, {
      groupId: id,
      type: 'group_deleted',
      entityType: 'group',
      entityId: id,
      payload: { name: group.name },
      at: timestamp,
    });
  });
  notifyChange(['groups', 'activity_log']);
}

function loadSnapshots(db, groupRows) {
  if (groupRows.length === 0) return [];
  const ids = groupRows.map((g) => g.id);

  const memberRows = db
    .select()
    .from(members)
    .where(and(inArray(members.groupId, ids), isNull(members.deletedAt)))
    .orderBy(asc(members.position), asc(members.createdAt))
    .all();
  const expenseRows = listExpensesForGroups(db, ids);
  const settlementRows = db
    .select()
    .from(settlements)
    .where(and(inArray(settlements.groupId, ids), isNull(settlements.deletedAt)))
    .orderBy(desc(settlements.paidOn), desc(settlements.createdAt))
    .all();

  return groupRows.map((group) => ({
    group,
    members: memberRows.filter((m) => m.groupId === group.id),
    expenses: expenseRows.filter((e) => e.groupId === group.id),
    settlements: settlementRows.filter((s) => s.groupId === group.id),
  }));
}

export function listGroupSnapshots(db) {
  return loadSnapshots(db, listGroups(db));
}

export function getGroupSnapshot(db, id) {
  const group = getGroup(db, id);
  if (!group) return null;
  return loadSnapshots(db, [group])[0];
}
