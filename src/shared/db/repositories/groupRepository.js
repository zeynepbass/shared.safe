import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { computeBalances } from '@/shared/lib/balances';

import { notifyChange } from '../changes';
import { DbValidationError } from '../errors';
import { newId, now } from '../ids';
import { groups, members, settlements } from '../schema';
import { logActivity } from './activityRepository';
import { getGroup, touchGroup } from './groupAccess';
import { listExpensesForGroups } from './expenseRepository';
import { insertMember } from './memberRepository';
import { getLocalUser } from './userRepository';

export { getGroup, touchGroup };

export function listGroups(db) {
  return db
    .select()
    .from(groups)
    .where(and(isNull(groups.deletedAt), isNull(groups.archivedAt)))
    .orderBy(desc(groups.updatedAt))
    .all();
}

// The local user joins every group they create as its first member; `members` are added after
// them in the given order.
export function createGroup(db, { name, type, currency, icon, members: others = [] }) {
  const timestamp = now();
  const id = newId();
  db.transaction((tx) => {
    const self = getLocalUser(tx);
    if (!self) throw new DbValidationError('profileMissing');
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
      {
        name: self.name,
        avatarColor: self.avatarColor,
        avatarPath: self.avatarPath,
        isLocalUser: true,
      },
      timestamp,
    );
    for (const member of others) insertMember(tx, id, member, timestamp);
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

// Everything the group list needs, with balances already computed from the local user's side.
// Groups come most recently active first (every change touches updated_at).
export function listGroupSummaries(db) {
  return listGroupSnapshots(db).map(
    ({ group, members: groupMembers, expenses, settlements: groupSettlements }) => {
      const balances = computeBalances({
        members: groupMembers,
        expenses,
        settlements: groupSettlements,
      });
      const self = groupMembers.find((m) => m.isLocalUser) ?? null;
      const lastExpense = expenses[0] ?? null;
      return {
        group,
        memberCount: groupMembers.length,
        selfBalance: self ? (balances.get(self.id) ?? 0) : 0,
        lastExpense: lastExpense && {
          id: lastExpense.id,
          description: lastExpense.description,
          spentOn: lastExpense.spentOn,
          payer: groupMembers.find((m) => m.id === lastExpense.payerId) ?? null,
        },
      };
    },
  );
}
