export const SPLIT_TYPES = ['equal', 'amount', 'percent', 'shares'];

export const PERCENT_SCALE = 100;
export const FULL_PERCENT = 100 * PERCENT_SCALE;

export function allocateProportionally(total, weights) {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0 || total === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (total * w) / weightSum);
  const floors = raw.map(Math.floor);
  let leftover = total - floors.reduce((sum, v) => sum + v, 0);

  const order = raw
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .filter(({ index }) => weights[index] > 0)
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; leftover > 0 && order.length > 0; i = (i + 1) % order.length) {
    floors[order[i].index] += 1;
    leftover -= 1;
  }
  return floors;
}

export function computeSplit({ total, type, participants }) {
  const included = participants.filter((p) => p.included !== false);

  if (included.length === 0) {
    return { shares: [], remaining: total, valid: false, reason: 'noParticipants' };
  }

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
      remainingPercent === 0 ? allocateProportionally(total, weights) : weights.map(() => 0);
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

  const amounts = allocateProportionally(total, weights);
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
