import { notifyChange } from '../changes';
import { newId, now } from '../ids';
import { attachShares, mapExpense, mapGroup, mapMember, mapSettlement } from './mappers';

export async function createGroup(db, { name, type, currency, self }) {
  const id = newId();
  const timestamp = now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO groups (id, name, type, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name.trim(), type, currency, timestamp, timestamp],
    );
    await txn.runAsync(
      `INSERT INTO members (id, group_id, name, color, is_self, position, created_at)
       VALUES (?, ?, ?, ?, 1, 0, ?)`,
      [newId(), id, self.name, self.color, timestamp],
    );
  });
  notifyChange(['groups', 'members']);
  return id;
}

export async function updateGroup(db, id, { name, type, currency }) {
  await db.runAsync(
    'UPDATE groups SET name = ?, type = ?, currency = ?, updated_at = ? WHERE id = ?',
    [name.trim(), type, currency, now(), id],
  );
  notifyChange(['groups']);
}

export async function deleteGroup(db, id) {
  await db.runAsync('DELETE FROM groups WHERE id = ?', [id]);
  notifyChange(['groups', 'members', 'expenses', 'settlements']);
}

export async function getGroup(db, id) {
  const row = await db.getFirstAsync('SELECT * FROM groups WHERE id = ?', [id]);
  return row ? mapGroup(row) : null;
}

async function loadSnapshots(db, groupRows) {
  if (groupRows.length === 0) return [];
  const ids = groupRows.map((g) => g.id);
  const placeholders = ids.map(() => '?').join(', ');

  const [memberRows, expenseRows, shareRows, settlementRows] = await Promise.all([
    db.getAllAsync(
      `SELECT * FROM members WHERE group_id IN (${placeholders}) ORDER BY position, created_at`,
      ids,
    ),
    db.getAllAsync(
      `SELECT * FROM expenses WHERE group_id IN (${placeholders}) AND deleted_at IS NULL
       ORDER BY spent_on DESC, created_at DESC`,
      ids,
    ),
    db.getAllAsync(
      `SELECT s.* FROM expense_shares s
       JOIN expenses e ON e.id = s.expense_id
       JOIN members m ON m.id = s.member_id
       WHERE e.group_id IN (${placeholders}) AND e.deleted_at IS NULL
       ORDER BY m.position, m.created_at`,
      ids,
    ),
    db.getAllAsync(
      `SELECT * FROM settlements WHERE group_id IN (${placeholders}) AND deleted_at IS NULL
       ORDER BY paid_on DESC, created_at DESC`,
      ids,
    ),
  ]);

  const expenses = attachShares(expenseRows.map(mapExpense), shareRows);

  return groupRows.map((row) => ({
    group: mapGroup(row),
    members: memberRows.filter((m) => m.group_id === row.id).map(mapMember),
    expenses: expenses.filter((e) => e.groupId === row.id),
    settlements: settlementRows.filter((s) => s.group_id === row.id).map(mapSettlement),
  }));
}

export async function listGroupSnapshots(db) {
  const rows = await db.getAllAsync(
    'SELECT * FROM groups WHERE archived_at IS NULL ORDER BY updated_at DESC',
  );
  return loadSnapshots(db, rows);
}

export async function getGroupSnapshot(db, id) {
  const row = await db.getFirstAsync('SELECT * FROM groups WHERE id = ?', [id]);
  if (!row) return null;
  const [snapshot] = await loadSnapshots(db, [row]);
  return snapshot;
}

export async function touchGroup(executor, id) {
  await executor.runAsync('UPDATE groups SET updated_at = ? WHERE id = ?', [now(), id]);
}
