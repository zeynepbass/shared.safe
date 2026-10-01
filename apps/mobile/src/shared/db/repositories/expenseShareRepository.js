import { and, asc, eq, getTableColumns, inArray, isNull } from 'drizzle-orm';

import { expenses, expenseShares, members } from '../schema';

// Share maths lives in core, next to the document that stores the result.
export { buildShares } from '@ortak-kasa/core/shares';

export function listShares(db, expenseIds) {
  if (expenseIds.length === 0) return [];
  return db
    .select(getTableColumns(expenseShares))
    .from(expenseShares)
    .innerJoin(members, eq(members.id, expenseShares.memberId))
    .where(and(inArray(expenseShares.expenseId, expenseIds), isNull(expenseShares.deletedAt)))
    .orderBy(asc(members.position), asc(members.createdAt))
    .all();
}

// Shares of every active expense in the groups. Selected through the expenses rather than by a
// list of their ids: a large group has more expenses than a query can take as parameters.
export function listSharesOfGroups(db, groupIds) {
  if (groupIds.length === 0) return [];
  return db
    .select(getTableColumns(expenseShares))
    .from(expenseShares)
    .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
    .innerJoin(members, eq(members.id, expenseShares.memberId))
    .where(
      and(
        inArray(expenses.groupId, groupIds),
        isNull(expenses.deletedAt),
        isNull(expenseShares.deletedAt),
      ),
    )
    .orderBy(asc(members.position), asc(members.createdAt))
    .all();
}
