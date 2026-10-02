import { and, desc, eq, getTableColumns, inArray, isNull } from 'drizzle-orm';

import * as groupDoc from '@ortak-kasa/core/groupDoc';

import { DbValidationError } from '../errors';
import { newId, now } from '../ids';
import { expenses, expenseShares, receiptUploads } from '../schema';
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

function docInput(input, id, receiptId) {
  return {
    id,
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    category: input.category,
    payerId: input.payerId,
    spentOn: input.spentOn,
    note: input.note,
    receiptId,
    splitType: input.splitType,
    shares: input.shares,
  };
}

// A receipt photo is a file of the group, not part of its document: the expense carries the
// photo's id, the device that took it keeps the file at `receiptPath`, and the file waits in
// receipt_uploads until the relay has it (sealed).
//
// `input.receiptPath` says what to do with it: a path attaches that photo, null removes the
// receipt for everyone, and leaving it out keeps whatever the expense has. The last matters on a
// device that has not fetched the photo: editing the amount there must not take the receipt
// away. The same photo keeps its id through edits; another photo is another file.
function receiptOf(current, input) {
  if (input.receiptPath === undefined) return { id: current?.receiptId ?? null, kept: true };
  if (!input.receiptPath) return { id: null };
  if (current?.receiptId && current.receiptPath === input.receiptPath) {
    return { id: current.receiptId, kept: true };
  }
  return { id: newId(), isNew: true };
}

const saveReceipt =
  (expenseId, groupId, input, receipt, previousId = null) =>
  (tx) => {
    if (receipt.kept) return;
    tx.update(expenses)
      .set({ receiptPath: input.receiptPath })
      .where(eq(expenses.id, expenseId))
      .run();
    // A photo that was replaced or removed before it was sent is no longer needed by anyone.
    if (previousId) {
      tx.delete(receiptUploads).where(eq(receiptUploads.receiptId, previousId)).run();
    }
    if (receipt.isNew) {
      tx.insert(receiptUploads)
        .values({ receiptId: receipt.id, groupId, path: input.receiptPath, createdAt: now() })
        .run();
    }
  };

export function createExpense(db, input) {
  const id = newId();
  const receipt = receiptOf(null, input);
  commitGroupChange(
    db,
    input.groupId,
    (doc, ctx) => groupDoc.putExpense(doc, docInput(input, id, receipt.id), ctx),
    { afterProject: saveReceipt(id, input.groupId, input, receipt) },
  );
  return id;
}

export function updateExpense(db, id, input) {
  const current = db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!current || current.deletedAt) throw new DbValidationError('expenseNotFound');
  const receipt = receiptOf(current, input);
  commitGroupChange(
    db,
    current.groupId,
    (doc, ctx) => groupDoc.putExpense(doc, docInput(input, id, receipt.id), ctx),
    { afterProject: saveReceipt(id, current.groupId, input, receipt, current.receiptId) },
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
