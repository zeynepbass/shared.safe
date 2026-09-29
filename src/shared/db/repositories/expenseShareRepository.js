import { and, asc, eq, getTableColumns, inArray, isNull } from 'drizzle-orm';

import { computeSplit, SPLIT_TYPES } from '@/domain/split';

import { DbValidationError } from '../errors';
import { newId } from '../ids';
import { expenseShares, members } from '../schema';

// Recomputes the stored amounts from the split definition instead of trusting the caller, so the
// shares always add up to the expense amount and leftover kuruş land on the same member on every
// device. `shares` is [{ memberId, weight?, amount? }]; for 'amount' splits the amount is the input.
export function buildShares(amount, splitType, shares) {
  if (!SPLIT_TYPES.includes(splitType)) throw new DbValidationError('invalidSplitType');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new DbValidationError('invalidAmount');

  const memberIds = shares.map((s) => s.memberId);
  if (new Set(memberIds).size !== memberIds.length) {
    throw new DbValidationError('duplicateShareMember');
  }

  const participants = shares.map((s) => ({
    memberId: s.memberId,
    weight: splitType === 'amount' ? (s.amount ?? s.weight) : s.weight,
  }));
  const split = computeSplit({ total: amount, type: splitType, participants });
  if (!split.valid) throw new DbValidationError(split.reason ?? 'invalidSplit');

  const total = split.shares.reduce((sum, s) => sum + s.amount, 0);
  if (total !== amount) {
    throw new DbValidationError('splitMismatch', `Shares (${total}) do not add up to ${amount}`);
  }
  return split.shares.map((s) => ({ ...s, splitType }));
}

// Upserts by (expense, member): existing rows keep their id, members dropped from the split are
// soft-deleted and revived if they come back, which keeps the rows stable for sync.
export function writeShares(tx, expenseId, shares, at) {
  const existing = tx
    .select()
    .from(expenseShares)
    .where(eq(expenseShares.expenseId, expenseId))
    .all();
  const byMember = new Map(existing.map((row) => [row.memberId, row]));
  const kept = new Set();

  for (const share of shares) {
    const current = byMember.get(share.memberId);
    kept.add(share.memberId);
    if (current) {
      tx.update(expenseShares)
        .set({
          amount: share.amount,
          splitType: share.splitType,
          weight: share.weight ?? null,
          deletedAt: null,
          updatedAt: at,
        })
        .where(eq(expenseShares.id, current.id))
        .run();
    } else {
      tx.insert(expenseShares)
        .values({
          id: newId(),
          expenseId,
          memberId: share.memberId,
          amount: share.amount,
          splitType: share.splitType,
          weight: share.weight ?? null,
          createdAt: at,
          updatedAt: at,
        })
        .run();
    }
  }

  for (const row of existing) {
    if (kept.has(row.memberId) || row.deletedAt) continue;
    tx.update(expenseShares)
      .set({ deletedAt: at, updatedAt: at })
      .where(eq(expenseShares.id, row.id))
      .run();
  }
}

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
