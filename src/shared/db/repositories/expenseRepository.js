import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { notifyChange } from '../changes';
import { DbValidationError } from '../errors';
import { newId, now } from '../ids';
import { expenses } from '../schema';
import { logActivity } from './activityRepository';
import { buildShares, listShares, writeShares } from './expenseShareRepository';
import { getGroup, touchGroup } from './groupAccess';
import { assertActiveMembers } from './memberRepository';

const TABLES = ['expenses', 'expense_shares', 'groups', 'activity_log'];

function attachShares(rows, shareRows) {
  const byExpense = new Map(rows.map((row) => [row.id, { ...row, splitType: null, shares: [] }]));
  for (const share of shareRows) {
    const expense = byExpense.get(share.expenseId);
    if (!expense) continue;
    expense.shares.push(share);
    expense.splitType ??= share.splitType;
  }
  return [...byExpense.values()];
}

function activityPayload(expense) {
  return {
    description: expense.description,
    amount: expense.amount,
    currency: expense.currency,
  };
}

function prepare(tx, input) {
  const group = getGroup(tx, input.groupId);
  if (!group) throw new DbValidationError('groupNotFound');
  const shares = buildShares(input.amount, input.splitType, input.shares);
  assertActiveMembers(tx, input.groupId, [input.payerId, ...shares.map((s) => s.memberId)]);
  return {
    values: {
      description: input.description.trim(),
      amount: input.amount,
      currency: input.currency ?? group.currency,
      category: input.category,
      payerId: input.payerId,
      spentOn: input.spentOn,
      note: input.note ?? null,
      receiptPath: input.receiptPath ?? null,
    },
    shares,
  };
}

export function createExpense(db, input) {
  const timestamp = now();
  const id = newId();
  db.transaction((tx) => {
    const { values, shares } = prepare(tx, input);
    tx.insert(expenses)
      .values({ id, groupId: input.groupId, ...values, createdAt: timestamp, updatedAt: timestamp })
      .run();
    writeShares(tx, id, shares, timestamp);
    logActivity(tx, {
      groupId: input.groupId,
      type: 'expense_created',
      entityType: 'expense',
      entityId: id,
      payload: activityPayload(values),
      at: timestamp,
    });
    touchGroup(tx, input.groupId, timestamp);
  });
  notifyChange(TABLES);
  return id;
}

export function updateExpense(db, id, input) {
  const timestamp = now();
  db.transaction((tx) => {
    const current = tx.select().from(expenses).where(eq(expenses.id, id)).get();
    if (!current || current.deletedAt) throw new DbValidationError('expenseNotFound');
    const { values, shares } = prepare(tx, { ...input, groupId: current.groupId });
    tx.update(expenses)
      .set({ ...values, updatedAt: timestamp })
      .where(eq(expenses.id, id))
      .run();
    writeShares(tx, id, shares, timestamp);
    logActivity(tx, {
      groupId: current.groupId,
      type: 'expense_updated',
      entityType: 'expense',
      entityId: id,
      payload: activityPayload(values),
      at: timestamp,
    });
    touchGroup(tx, current.groupId, timestamp);
  });
  notifyChange(TABLES);
}

function setDeleted(db, id, deleted) {
  const timestamp = now();
  db.transaction((tx) => {
    const current = tx.select().from(expenses).where(eq(expenses.id, id)).get();
    if (!current || Boolean(current.deletedAt) === deleted) {
      throw new DbValidationError('expenseNotFound');
    }
    tx.update(expenses)
      .set({ deletedAt: deleted ? timestamp : null, updatedAt: timestamp })
      .where(eq(expenses.id, id))
      .run();
    logActivity(tx, {
      groupId: current.groupId,
      type: deleted ? 'expense_deleted' : 'expense_restored',
      entityType: 'expense',
      entityId: id,
      payload: activityPayload(current),
      at: timestamp,
    });
    touchGroup(tx, current.groupId, timestamp);
  });
  notifyChange(TABLES);
}

// Shares are left as they are so a restore brings the exact split back.
export function softDeleteExpense(db, id) {
  setDeleted(db, id, true);
}

export function restoreExpense(db, id) {
  setDeleted(db, id, false);
}

export function getExpense(db, id) {
  const row = db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!row) return null;
  return attachShares([row], listShares(db, [id]))[0];
}

export function listExpensesForGroups(db, groupIds) {
  if (groupIds.length === 0) return [];
  const rows = db
    .select()
    .from(expenses)
    .where(and(inArray(expenses.groupId, groupIds), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt))
    .all();
  return attachShares(
    rows,
    listShares(
      db,
      rows.map((row) => row.id),
    ),
  );
}

export function listExpenses(db, groupId) {
  return listExpensesForGroups(db, [groupId]);
}
