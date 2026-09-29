import { notifyChange } from '../changes';
import { newId, now } from '../ids';
import { touchGroup } from './groupRepository';
import { attachShares, mapExpense } from './mappers';

async function insertShares(txn, expenseId, shares) {
  for (const share of shares) {
    await txn.runAsync(
      'INSERT INTO expense_shares (expense_id, member_id, amount, weight) VALUES (?, ?, ?, ?)',
      [expenseId, share.memberId, share.amount, share.weight ?? null],
    );
  }
}

function assertBalanced(amount, shares) {
  const total = shares.reduce((sum, share) => sum + share.amount, 0);
  if (total !== amount) {
    throw new Error(`Expense shares (${total}) do not add up to amount (${amount})`);
  }
}

export async function createExpense(db, input) {
  assertBalanced(input.amount, input.shares);
  const id = newId();
  const timestamp = now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO expenses
         (id, group_id, title, amount, category, payer_id, split_type, spent_on, note,
          receipt_uri, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.groupId,
        input.title.trim(),
        input.amount,
        input.category,
        input.payerId,
        input.splitType,
        input.spentOn,
        input.note ?? null,
        input.receiptUri ?? null,
        timestamp,
        timestamp,
      ],
    );
    await insertShares(txn, id, input.shares);
    await touchGroup(txn, input.groupId);
  });
  notifyChange(['expenses', 'groups']);
  return id;
}

export async function updateExpense(db, id, input) {
  assertBalanced(input.amount, input.shares);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `UPDATE expenses SET title = ?, amount = ?, category = ?, payer_id = ?, split_type = ?,
         spent_on = ?, note = ?, receipt_uri = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.title.trim(),
        input.amount,
        input.category,
        input.payerId,
        input.splitType,
        input.spentOn,
        input.note ?? null,
        input.receiptUri ?? null,
        now(),
        id,
      ],
    );
    await txn.runAsync('DELETE FROM expense_shares WHERE expense_id = ?', [id]);
    await insertShares(txn, id, input.shares);
  });
  notifyChange(['expenses']);
}

export async function softDeleteExpense(db, id) {
  await db.runAsync('UPDATE expenses SET deleted_at = ? WHERE id = ?', [now(), id]);
  notifyChange(['expenses']);
}

export async function restoreExpense(db, id) {
  await db.runAsync('UPDATE expenses SET deleted_at = NULL WHERE id = ?', [id]);
  notifyChange(['expenses']);
}

export async function purgeDeletedExpenses(db, olderThan) {
  await db.runAsync('DELETE FROM expenses WHERE deleted_at IS NOT NULL AND deleted_at < ?', [
    olderThan,
  ]);
}

export async function getExpense(db, id) {
  const row = await db.getFirstAsync('SELECT * FROM expenses WHERE id = ?', [id]);
  if (!row) return null;
  const shareRows = await db.getAllAsync(
    `SELECT s.* FROM expense_shares s
     JOIN members m ON m.id = s.member_id
     WHERE s.expense_id = ?
     ORDER BY m.position, m.created_at`,
    [id],
  );
  const [expense] = attachShares([mapExpense(row)], shareRows);
  return { ...expense, deletedAt: row.deleted_at };
}
