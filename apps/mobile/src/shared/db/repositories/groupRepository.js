import { and, asc, desc, inArray, isNull } from 'drizzle-orm';

import { computeBalances } from '@ortak-kasa/core/balances';

import * as groupDoc from '@ortak-kasa/core/groupDoc';

import { DbValidationError } from '../errors';
import { newId, now } from '../ids';
import { groups, members, settlements } from '../schema';
import { commitGroupChange, startGroupSync } from '../sync/groupDocs';
import { listExpensesForGroups } from './expenseRepository';
import { getGroup } from './groupAccess';
import { getLocalUser } from './userRepository';

export { getGroup };

export function listGroups(db) {
  return db
    .select()
    .from(groups)
    .where(and(isNull(groups.deletedAt), isNull(groups.archivedAt)))
    .orderBy(desc(groups.updatedAt))
    .all();
}

// The local user joins every group they create as its first member; `members` are added after
// them in the given order. The group starts syncing right away.
export function createGroup(db, { name, type, currency, icon, members: others = [] }) {
  const self = getLocalUser(db);
  if (!self) throw new DbValidationError('profileMissing');
  const id = newId();
  const selfMemberId = newId();
  const doc = groupDoc.createGroupDoc(
    {
      id,
      name,
      type,
      currency,
      icon,
      members: [
        { id: selfMemberId, name: self.name, avatarColor: self.avatarColor },
        ...others.map((m) => ({ id: newId(), name: m.name, avatarColor: m.avatarColor })),
      ],
    },
    { now: now(), newId },
  );
  startGroupSync(db, id, doc, { localMemberId: selfMemberId });
  return id;
}

export function updateGroup(db, id, { name, type, currency, icon }) {
  commitGroupChange(db, id, (doc, ctx) =>
    groupDoc.updateGroup(doc, { name, type, currency, icon }, ctx),
  );
}

// Deletes the group for everyone in it. Children stay in the document; every read goes through
// an active group, so they disappear with it.
export function softDeleteGroup(db, id) {
  commitGroupChange(db, id, (doc, ctx) => groupDoc.deleteGroup(doc, ctx));
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
