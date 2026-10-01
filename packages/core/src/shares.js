import { ValidationError } from './errors.js';
import { computeSplit, SPLIT_TYPES } from './split.js';

// Recomputes the stored amounts from the split definition instead of trusting the caller, so the
// shares always add up to the expense amount and leftover kuruş land on the same member on every
// device. `shares` is [{ memberId, weight?, amount? }]; for 'amount' splits the amount is the input.
export function buildShares(amount, splitType, shares) {
  if (!SPLIT_TYPES.includes(splitType)) throw new ValidationError('invalidSplitType');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ValidationError('invalidAmount');

  const memberIds = shares.map((s) => s.memberId);
  if (new Set(memberIds).size !== memberIds.length) {
    throw new ValidationError('duplicateShareMember');
  }

  const participants = shares.map((s) => ({
    memberId: s.memberId,
    weight: splitType === 'amount' ? (s.amount ?? s.weight) : s.weight,
  }));
  const split = computeSplit({ total: amount, type: splitType, participants });
  if (!split.valid) throw new ValidationError(split.reason ?? 'invalidSplit');

  const total = split.shares.reduce((sum, s) => sum + s.amount, 0);
  if (total !== amount) {
    throw new ValidationError('splitMismatch', `Shares (${total}) do not add up to ${amount}`);
  }
  return split.shares.map((s) => ({ ...s, splitType }));
}
