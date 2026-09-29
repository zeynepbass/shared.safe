import { notifyChange } from '../changes';
import { newId, now } from '../ids';
import { touchGroup } from './groupRepository';

export async function recordSettlement(db, { groupId, fromMemberId, toMemberId, amount, paidOn }) {
  const id = newId();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO settlements
         (id, group_id, from_member_id, to_member_id, amount, paid_on, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, groupId, fromMemberId, toMemberId, amount, paidOn, now()],
    );
    await touchGroup(txn, groupId);
  });
  notifyChange(['settlements', 'groups']);
  return id;
}

export async function softDeleteSettlement(db, id) {
  await db.runAsync('UPDATE settlements SET deleted_at = ? WHERE id = ?', [now(), id]);
  notifyChange(['settlements']);
}

export async function restoreSettlement(db, id) {
  await db.runAsync('UPDATE settlements SET deleted_at = NULL WHERE id = ?', [id]);
  notifyChange(['settlements']);
}
