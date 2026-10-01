import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { readAt } from '@ortak-kasa/core/canonical';
import { readGroupDoc, readRecord } from '@ortak-kasa/core/readGroupDoc';

import {
  activityLog,
  expenses,
  expenseShares,
  groups,
  members,
  settlements,
  syncGroups,
  users,
} from '../schema';

// Writes a group's document into the read tables. Device-only data is carried over: receipt
// photos stay on the device that took them, and the local user's photo comes from their profile.
//
// `touched` (see touchedRecords in core) names the records a change touched; only those are
// written, so a change costs the same in a group of ten expenses and of ten thousand. Without
// it, or when the group has no rows yet, everything is rebuilt from the document.

// Rows per INSERT; with the widest table this stays under SQLite's smallest variable limit.
const CHUNK = 50;

function insertAll(tx, table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    tx.insert(table)
      .values(rows.slice(i, i + CHUNK))
      .run();
  }
}

function upsert(tx, table, row) {
  const { id: _id, ...fields } = row;
  tx.insert(table).values(row).onConflictDoUpdate({ target: table.id, set: fields }).run();
}

function localUser(tx, groupId) {
  const identity = tx.select().from(syncGroups).where(eq(syncGroups.groupId, groupId)).get();
  const profile = tx.select().from(users).where(isNull(users.deletedAt)).get();
  return { memberId: identity?.localMemberId ?? null, avatarPath: profile?.avatarPath ?? null };
}

const groupRow = (group) => ({
  id: group.id,
  name: group.name,
  type: group.type,
  currency: group.currency,
  icon: group.icon,
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
  deletedAt: group.deletedAt,
  archivedAt: group.archivedAt,
});

function memberRow(m, groupId, local) {
  const isLocalUser = m.id === local.memberId;
  return {
    id: m.id,
    groupId,
    name: m.name,
    avatarColor: m.avatarColor,
    avatarPath: isLocalUser ? local.avatarPath : null,
    isLocalUser,
    position: m.position,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    deletedAt: m.deletedAt,
  };
}

const expenseRow = (e, groupId) => ({
  id: e.id,
  groupId,
  description: e.description,
  amount: e.amount,
  currency: e.currency,
  category: e.category,
  payerId: e.payerId,
  spentOn: e.spentOn,
  note: e.note,
  hasConflict: e.hasConflict,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
  deletedAt: e.deletedAt,
});

const shareRows = (e) =>
  e.shares.map((share) => ({
    id: `${e.id}:${share.memberId}`,
    expenseId: e.id,
    memberId: share.memberId,
    amount: share.amount,
    splitType: e.splitType,
    weight: share.weight,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }));

const settlementRow = (s, groupId) => ({ ...s, groupId });

const activityRow = (a, groupId) => ({
  id: a.id,
  groupId,
  type: a.type,
  entityType: a.entityType,
  entityId: a.entityId,
  payload: a.payload,
  occurredAt: a.occurredAt,
  createdAt: a.occurredAt,
  updatedAt: a.occurredAt,
});

function rebuildGroup(tx, groupId, doc) {
  const view = readGroupDoc(doc);
  if (!view) return;

  const local = localUser(tx, groupId);
  const receipts = new Map(
    tx
      .select({ id: expenses.id, path: expenses.receiptPath })
      .from(expenses)
      .where(and(eq(expenses.groupId, groupId), isNotNull(expenses.receiptPath)))
      .all()
      .map((r) => [r.id, r.path]),
  );

  const ofGroup = tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.groupId, groupId));
  tx.delete(expenseShares).where(inArray(expenseShares.expenseId, ofGroup)).run();
  tx.delete(activityLog).where(eq(activityLog.groupId, groupId)).run();
  tx.delete(settlements).where(eq(settlements.groupId, groupId)).run();
  tx.delete(expenses).where(eq(expenses.groupId, groupId)).run();
  tx.delete(members).where(eq(members.groupId, groupId)).run();
  tx.delete(groups).where(eq(groups.id, groupId)).run();

  tx.insert(groups).values(groupRow(view.group)).run();
  insertAll(
    tx,
    members,
    view.members.map((m) => memberRow(m, groupId, local)),
  );
  insertAll(
    tx,
    expenses,
    view.expenses.map((e) => ({ ...expenseRow(e, groupId), receiptPath: receipts.get(e.id) ?? null })),
  );
  insertAll(tx, expenseShares, view.expenses.flatMap(shareRows));
  insertAll(
    tx,
    settlements,
    view.settlements.map((s) => settlementRow(s, groupId)),
  );
  insertAll(
    tx,
    activityLog,
    view.activity.map((a) => activityRow(a, groupId)),
  );
}

// Records are never removed from a document (deleting sets deletedAt), so touched records are
// only ever inserted or updated. Members go first: expenses and settlements refer to them.
function projectTouched(tx, groupId, doc, touched) {
  if (touched.group) {
    const { id: _id, ...fields } = groupRow(readAt(doc, ['group']));
    tx.update(groups).set(fields).where(eq(groups.id, groupId)).run();
  }

  if (touched.members.size) {
    const local = localUser(tx, groupId);
    for (const id of touched.members) {
      const member = readRecord(doc, 'members', id);
      if (member) upsert(tx, members, memberRow(member, groupId, local));
    }
  }

  for (const id of touched.expenses) {
    const expense = readRecord(doc, 'expenses', id);
    if (!expense) continue;
    // The receipt path is not part of the row written here, so an existing one stays.
    upsert(tx, expenses, expenseRow(expense, groupId));
    tx.delete(expenseShares).where(eq(expenseShares.expenseId, id)).run();
    insertAll(tx, expenseShares, shareRows(expense));
  }

  for (const id of touched.settlements) {
    const settlement = readRecord(doc, 'settlements', id);
    if (settlement) upsert(tx, settlements, settlementRow(settlement, groupId));
  }

  for (const id of touched.activity) {
    const entry = readRecord(doc, 'activity', id);
    if (entry) upsert(tx, activityLog, activityRow(entry, groupId));
  }
}

export function projectGroup(tx, groupId, doc, touched) {
  const exists =
    touched &&
    !touched.all &&
    tx.select({ id: groups.id }).from(groups).where(eq(groups.id, groupId)).get();
  if (exists) projectTouched(tx, groupId, doc, touched);
  else rebuildGroup(tx, groupId, doc);
}
