import { and, desc, eq, getTableColumns, inArray, isNull } from 'drizzle-orm';

import * as groupDoc from '@ortak-kasa/core/groupDoc';

import { DbValidationError } from '../errors';
import { newId } from '../ids';
import { expenses, expenseShares } from '../schema';
import { commitGroupChange } from '../sync/groupDocs';
import { listShares, listSharesOfGroups } from './expenseShareRepository';

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

function docInput(input, id) {
  return {
    id,
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    category: input.category,
    payerId: input.payerId,
    spentOn: input.spentOn,
    note: input.note,
    splitType: input.splitType,
    shares: input.shares,
  };
}

// The receipt photo stays on this device, so it is kept next to the synced record rather than
// in it.
const setReceipt = (id, receiptPath) => (tx) =>
  tx
    .update(expenses)
    .set({ receiptPath: receiptPath ?? null })
    .where(eq(expenses.id, id))
    .run();

export function createExpense(db, input) {
  const id = newId();
  commitGroupChange(
    db,
    input.groupId,
    (doc, ctx) => groupDoc.putExpense(doc, docInput(input, id), ctx),
    {
      afterProject: setReceipt(id, input.receiptPath),
    },
  );
  return id;
}

export function updateExpense(db, id, input) {
  const current = db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!current || current.deletedAt) throw new DbValidationError('expenseNotFound');
  commitGroupChange(
    db,
    current.groupId,
    (doc, ctx) => groupDoc.putExpense(doc, docInput(input, id), ctx),
    {
      afterProject: setReceipt(id, input.receiptPath),
    },
  );
}

function setDeleted(db, id, deleted) {
  const current = db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!current) throw new DbValidationError('expenseNotFound');
  commitGroupChange(db, current.groupId, (doc, ctx) =>
    groupDoc.setExpenseDeleted(doc, id, deleted, ctx),
  );
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
  return attachShares(rows, listSharesOfGroups(db, groupIds));
}

export function listExpenses(db, groupId) {
  return listExpensesForGroups(db, [groupId]);
}

const newestFirst = [desc(expenses.spentOn), desc(expenses.createdAt)];
const activeIn = (groupId) => and(eq(expenses.groupId, groupId), isNull(expenses.deletedAt));

// Active expenses of a group without their shares, newest first: for totals and charts.
export function listExpenseRows(db, groupId) {
  return db
    .select()
    .from(expenses)
    .where(activeIn(groupId))
    .orderBy(...newestFirst)
    .all();
}

// The same rows with one share each: `selfShare` is what `memberId` owes of the expense, or null
// when they have no part in it. That is all a list of expenses seen by one member needs.
// `limit` keeps it to the newest ones.
export function listExpensesWithShareOf(db, groupId, memberId, { limit } = {}) {
  const query = db
    .select({ ...getTableColumns(expenses), selfShare: expenseShares.amount })
    .from(expenses)
    .leftJoin(
      expenseShares,
      and(
        eq(expenseShares.expenseId, expenses.id),
        eq(expenseShares.memberId, memberId ?? ''),
        isNull(expenseShares.deletedAt),
      ),
    )
    .where(activeIn(groupId))
    .orderBy(...newestFirst);
  return (limit ? query.limit(limit) : query).all();
}

export function getLastExpense(db, groupId) {
  return (
    db
      .select()
      .from(expenses)
      .where(activeIn(groupId))
      .orderBy(...newestFirst)
      .limit(1)
      .get() ?? null
  );
}
