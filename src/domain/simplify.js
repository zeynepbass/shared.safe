export const EXACT_LIMIT = 16;

function settleGreedy(entries) {
  const creditors = entries
    .filter((e) => e.amount > 0)
    .map((e) => ({ ...e }))
    .sort((a, b) => b.amount - a.amount || a.order - b.order);
  const debtors = entries
    .filter((e) => e.amount < 0)
    .map((e) => ({ ...e, amount: -e.amount }))
    .sort((a, b) => b.amount - a.amount || a.order - b.order);

  const transfers = [];
  let c = 0;
  let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const amount = Math.min(creditors[c].amount, debtors[d].amount);
    transfers.push({ from: debtors[d].id, to: creditors[c].id, amount });
    creditors[c].amount -= amount;
    debtors[d].amount -= amount;
    if (creditors[c].amount === 0) c += 1;
    if (debtors[d].amount === 0) d += 1;
  }
  return transfers;
}

function partitionIntoZeroSumGroups(entries) {
  const n = entries.length;
  const size = 1 << n;
  const sums = new Float64Array(size);
  const best = new Int8Array(size);

  for (let mask = 1; mask < size; mask += 1) {
    const low = mask & -mask;
    const bit = 31 - Math.clz32(low);
    sums[mask] = sums[mask ^ low] + entries[bit].amount;
  }

  for (let mask = 1; mask < size; mask += 1) {
    let value = 0;
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) {
        const candidate = best[mask ^ (1 << i)];
        if (candidate > value) value = candidate;
      }
    }
    best[mask] = value + (sums[mask] === 0 ? 1 : 0);
  }

  const sequence = [];
  let mask = size - 1;
  while (mask) {
    const bonus = sums[mask] === 0 ? 1 : 0;
    for (let i = n - 1; i >= 0; i -= 1) {
      const bit = 1 << i;
      if (mask & bit && best[mask ^ bit] + bonus === best[mask]) {
        sequence.push(i);
        mask ^= bit;
        break;
      }
    }
  }
  sequence.reverse();

  const groups = [];
  let current = [];
  let running = 0;
  for (const index of sequence) {
    current.push(entries[index]);
    running += entries[index].amount;
    if (running === 0) {
      groups.push(current);
      current = [];
    }
  }
  return groups;
}

export function simplifyDebts(balances, { order } = {}) {
  const ids = order ?? [...balances.keys()];
  const entries = ids
    .map((id, index) => ({ id, amount: balances.get(id) ?? 0, order: index }))
    .filter((e) => e.amount !== 0);

  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  if (total !== 0) {
    throw new Error(`Balances must sum to zero, got ${total}`);
  }
  if (entries.length === 0) return [];

  if (entries.length > EXACT_LIMIT) return settleGreedy(entries);

  return partitionIntoZeroSumGroups(entries).flatMap(settleGreedy);
}
