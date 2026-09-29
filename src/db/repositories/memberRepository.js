import { notifyChange } from '../changes';
import { newId, now } from '../ids';
import { mapMember } from './mappers';

export async function listMembers(db, groupId) {
  const rows = await db.getAllAsync(
    'SELECT * FROM members WHERE group_id = ? ORDER BY position, created_at',
    [groupId],
  );
  return rows.map(mapMember);
}

export async function addMember(db, groupId, { name, color }) {
  const id = newId();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM members WHERE group_id = ?',
      [groupId],
    );
    await txn.runAsync(
      `INSERT INTO members (id, group_id, name, color, is_self, position, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [id, groupId, name.trim(), color, row.next, now()],
    );
  });
  notifyChange(['members']);
  return id;
}

export async function updateMember(db, id, { name, color }) {
  await db.runAsync('UPDATE members SET name = ?, color = ? WHERE id = ? AND is_self = 0', [
    name.trim(),
    color,
    id,
  ]);
  notifyChange(['members']);
}
