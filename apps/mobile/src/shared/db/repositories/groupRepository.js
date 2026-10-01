import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import * as groupDoc from '@ortak-kasa/core/groupDoc';

import { DbValidationError } from '../errors';
import { newId, now } from '../ids';
import { expenses, expenseShares, groups, members, settlements } from '../schema';
import { commitGroupChange, startGroupSync } from '../sync/groupDocs';
import {
  getLastExpense,
  listExpensesForGroups,
  listExpensesWithShareOf,
} from './expenseRepository';
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

function activeMembers(db, groupIds) {
  return db
    .select()
    .from(members)
    .where(and(inArray(members.groupId, groupIds), isNull(members.deletedAt)))
    .orderBy(asc(members.position), asc(members.createdAt))
    .all();
}

function activeSettlements(db, groupIds) {
  return db
    .select()
    .from(settlements)
    .where(and(inArray(settlements.groupId, groupIds), isNull(settlements.deletedAt)))
    .orderBy(desc(settlements.paidOn), desc(settlements.createdAt))
    .all();
}

// Net balance per member of each group: Map<groupId, Map<memberId, kuruş>>, the same numbers as
// computeBalances in core. The sums are left to SQLite, so no expense or share is loaded; a
// group's balances cost the same to show whether it has ten expenses or ten thousand.
function balancesByGroup(db, groupIds, memberRows) {
  const balances = new Map(groupIds.map((id) => [id, new Map()]));
  for (const member of memberRows) balances.get(member.groupId).set(member.id, 0);
  const add = ({ groupId, memberId, amount }, sign) => {
    const ofGroup = balances.get(groupId);
    ofGroup.set(memberId, (ofGroup.get(memberId) ?? 0) + sign * amount);
  };
  const total = (column) => sql`sum(${column})`.mapWith(Number);
  const activeExpenses = and(inArray(expenses.groupId, groupIds), isNull(expenses.deletedAt));
  const activePayments = and(inArray(settlements.groupId, groupIds), isNull(settlements.deletedAt));

  db.select({
    groupId: expenses.groupId,
    memberId: expenses.payerId,
    amount: total(expenses.amount),
  })
    .from(expenses)
    .where(activeExpenses)
    .groupBy(expenses.groupId, expenses.payerId)
    .all()
    .forEach((row) => add(row, 1));
  db.select({
    groupId: expenses.groupId,
    memberId: expenseShares.memberId,
    amount: total(expenseShares.amount),
  })
    .from(expenseShares)
    .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
    .where(and(activeExpenses, isNull(expenseShares.deletedAt)))
    .groupBy(expenses.groupId, expenseShares.memberId)
    .all()
    .forEach((row) => add(row, -1));
  // The payer hands money over, which reduces what they owe.
  db.select({
    groupId: settlements.groupId,
    memberId: settlements.fromMemberId,
    amount: total(settlements.amount),
  })
    .from(settlements)
    .where(activePayments)
    .groupBy(settlements.groupId, settlements.fromMemberId)
    .all()
    .forEach((row) => add(row, 1));
  db.select({
    groupId: settlements.groupId,
    memberId: settlements.toMemberId,
    amount: total(settlements.amount),
  })
    .from(settlements)
    .where(activePayments)
    .groupBy(settlements.groupId, settlements.toMemberId)
    .all()
    .forEach((row) => add(row, -1));

  return balances;
}

// For forms and details that only need to know who is in the group.
export function getGroupWithMembers(db, id) {
  const group = getGroup(db, id);
  return group ? { group, members: activeMembers(db, [id]) } : null;
}

// The group, its members and what each of them is owed or owes (the balances screen).
export function getGroupBalances(db, id) {
  const sheet = getGroupWithMembers(db, id);
  if (!sheet) return null;
  return { ...sheet, balances: balancesByGroup(db, [id], sheet.members).get(id) };
}

// What the group screen shows: the balances from the local user's side, the settlements and
// the expenses with the local user's share of each. Other members' shares are not needed there
// and stay in the database.
//
// With `limit`, only the newest expenses are read; `hasMore` says older ones exist, and the
// settlements older than the last expense read are held back with them, so the list never
// shows a settlement above an expense that came after it.
export function getGroupOverview(db, id, { limit } = {}) {
  const sheet = getGroupBalances(db, id);
  if (!sheet) return null;
  const self = sheet.members.find((m) => m.isLocalUser) ?? null;
  const read = listExpensesWithShareOf(db, id, self?.id ?? null, {
    limit: limit ? limit + 1 : undefined,
  });
  const hasMore = Boolean(limit) && read.length > limit;
  const shown = hasMore ? read.slice(0, limit) : read;
  const oldest = hasMore ? shown[shown.length - 1].spentOn : null;
  return {
    ...sheet,
    self,
    selfBalance: self ? (sheet.balances.get(self.id) ?? 0) : 0,
    expenses: shown,
    settlements: activeSettlements(db, [id]).filter((s) => !oldest || s.paidOn >= oldest),
    hasMore,
  };
}

function loadSnapshots(db, groupRows) {
  if (groupRows.length === 0) return [];
  const ids = groupRows.map((g) => g.id);

  const memberRows = activeMembers(db, ids);
  const expenseRows = listExpensesForGroups(db, ids);
  const settlementRows = activeSettlements(db, ids);

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
// Groups come most recently active first (every change touches updated_at). Only the newest
// expense of each group is read.
export function listGroupSummaries(db) {
  const groupRows = listGroups(db);
  if (groupRows.length === 0) return [];
  const ids = groupRows.map((g) => g.id);
  const memberRows = activeMembers(db, ids);
  const balances = balancesByGroup(db, ids, memberRows);

  return groupRows.map((group) => {
    const groupMembers = memberRows.filter((m) => m.groupId === group.id);
    const self = groupMembers.find((m) => m.isLocalUser) ?? null;
    const lastExpense = getLastExpense(db, group.id);
    return {
      group,
      memberCount: groupMembers.length,
      selfBalance: self ? (balances.get(group.id).get(self.id) ?? 0) : 0,
      lastExpense: lastExpense && {
        id: lastExpense.id,
        description: lastExpense.description,
        spentOn: lastExpense.spentOn,
        payer: groupMembers.find((m) => m.id === lastExpense.payerId) ?? null,
      },
    };
  });
}
