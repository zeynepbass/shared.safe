export const EXACT_LIMIT = 16;

function pickLargest(entries) {
  let best = null;
  for (const entry of entries) {
    if (entry.amount === 0) continue;
    if (
      !best ||
      entry.amount > best.amount ||
      (entry.amount === best.amount && entry.order < best.order)
    ) {
      best = entry;
    }
  }
  return best;
}

// Greedy: the largest creditor is always paid by the largest debtor, re-picked after every
// transfer. Ties fall back to the member order so the result is stable. Each transfer zeroes at
// least one side, so there are at most n - 1 transfers.
function settleGreedy(entries) {
  const creditors = entries.filter((e) => e.amount > 0).map((e) => ({ ...e }));
  const debtors = entries.filter((e) => e.amount < 0).map((e) => ({ ...e, amount: -e.amount }));

  const transfers = [];
  for (;;) {
    const creditor = pickLargest(creditors);
    const debtor = pickLargest(debtors);
    if (!creditor || !debtor) break;
    const amount = Math.min(creditor.amount, debtor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amount });
    creditor.amount -= amount;
    debtor.amount -= amount;
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

// Before the greedy pass, small groups (up to EXACT_LIMIT non-zero balances) are split into the
// largest number of independent zero-sum subsets; settling each subset separately is what makes
// the transfer count minimal (n - subsets). Larger groups use the greedy pass directly.
export function simplifyDebts(balances, { order } = {}) {
  const ids = order ? [...new Set([...order, ...balances.keys()])] : [...balances.keys()];
  const entries = ids
    .map((id, index) => ({ id, amount: balances.get(id) ?? 0, order: index }))
    .filter((e) => e.amount !== 0);

  for (const e of entries) {
    if (!Number.isSafeInteger(e.amount)) throw new Error(`Balance of ${e.id} is not in kuruş`);
  }
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  if (total !== 0) {
    throw new Error(`Balances must sum to zero, got ${total}`);
  }
  if (entries.length === 0) return [];

  if (entries.length > EXACT_LIMIT) return settleGreedy(entries);

  return partitionIntoZeroSumGroups(entries).flatMap(settleGreedy);
}
