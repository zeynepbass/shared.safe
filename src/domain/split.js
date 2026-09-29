export const SPLIT_TYPES = ['equal', 'amount', 'percent', 'shares'];

export const PERCENT_SCALE = 100;
export const FULL_PERCENT = 100 * PERCENT_SCALE;

function compareKeys(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// Largest-remainder allocation on integers only. Leftover kuruş go to the largest remainders;
// ties are broken by `keys` (member ids) when given, so every device computes the same split
// regardless of the order participants are listed in. Falls back to list order otherwise.
export function allocateProportionally(total, weights, keys) {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0 || total === 0) return weights.map(() => 0);

  const floors = weights.map((w) => Math.floor((total * w) / weightSum));
  const remainders = weights.map((w, i) => total * w - floors[i] * weightSum);
  let leftover = total - floors.reduce((sum, v) => sum + v, 0);

  const order = weights
    .map((w, index) => index)
    .filter((index) => weights[index] > 0)
    .sort(
      (a, b) =>
        remainders[b] - remainders[a] || (keys ? compareKeys(keys[a], keys[b]) : 0) || a - b,
    );

  for (let i = 0; leftover > 0 && order.length > 0; i = (i + 1) % order.length) {
    floors[order[i]] += 1;
    leftover -= 1;
  }
  return floors;
}

export function computeSplit({ total, type, participants }) {
  const included = participants.filter((p) => p.included !== false);

  if (included.length === 0) {
    return { shares: [], remaining: total, valid: false, reason: 'noParticipants' };
  }
  const keys = included.map((p) => p.memberId);

  if (type === 'amount') {
    const shares = included.map((p) => ({
      memberId: p.memberId,
      amount: Math.max(0, Math.trunc(p.weight ?? 0)),
      weight: Math.max(0, Math.trunc(p.weight ?? 0)),
    }));
    const assigned = shares.reduce((sum, s) => sum + s.amount, 0);
    const remaining = total - assigned;
    return {
      shares,
      remaining,
      valid: remaining === 0 && total > 0,
      reason: remaining === 0 ? null : 'amountMismatch',
    };
  }

  if (type === 'percent') {
    const weights = included.map((p) => Math.max(0, Math.trunc(p.weight ?? 0)));
    const percentSum = weights.reduce((sum, w) => sum + w, 0);
    const remainingPercent = FULL_PERCENT - percentSum;
    const amounts =
      remainingPercent === 0 ? allocateProportionally(total, weights, keys) : weights.map(() => 0);
    return {
      shares: included.map((p, i) => ({
        memberId: p.memberId,
        amount: amounts[i],
        weight: weights[i],
      })),
      remaining: remainingPercent,
      valid: remainingPercent === 0 && total > 0,
      reason: remainingPercent === 0 ? null : 'percentMismatch',
    };
  }

  const weights =
    type === 'shares'
      ? included.map((p) => Math.max(0, Math.trunc(p.weight ?? 1)))
      : included.map(() => 1);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);

  if (weightSum === 0) {
    return { shares: [], remaining: total, valid: false, reason: 'noWeights' };
  }

  const amounts = allocateProportionally(total, weights, keys);
  return {
    shares: included.map((p, i) => ({
      memberId: p.memberId,
      amount: amounts[i],
      weight: type === 'shares' ? weights[i] : null,
    })),
    remaining: 0,
    valid: total > 0,
    reason: total > 0 ? null : 'noAmount',
  };
}
