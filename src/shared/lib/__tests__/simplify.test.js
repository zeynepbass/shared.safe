import { EXACT_LIMIT, simplifyDebts } from '../simplify';

const toMap = (obj) => new Map(Object.entries(obj));

function apply(balances, transfers) {
  const result = new Map(balances);
  for (const { from, to, amount } of transfers) {
    result.set(from, result.get(from) + amount);
    result.set(to, result.get(to) - amount);
  }
  return result;
}

function expectSettled(balances, transfers) {
  for (const value of apply(balances, transfers).values()) expect(value).toBe(0);
  for (const t of transfers) {
    expect(t.amount).toBeGreaterThan(0);
    expect(Number.isInteger(t.amount)).toBe(true);
    expect(t.from).not.toBe(t.to);
  }
}

function bruteForceMinimum(values) {
  const nonZero = values.filter((v) => v !== 0);
  const n = nonZero.length;
  let bestGroups = 0;
  const search = (remaining, groups) => {
    if (remaining.length === 0) {
      bestGroups = Math.max(bestGroups, groups);
      return;
    }
    const [first, ...rest] = remaining;
    const m = rest.length;
    for (let mask = 0; mask < 1 << m; mask += 1) {
      const chosen = [first];
      const others = [];
      rest.forEach((v, i) => (mask & (1 << i) ? chosen : others).push(v));
      if (chosen.reduce((a, b) => a + b, 0) === 0) search(others, groups + 1);
    }
  };
  search(nonZero, 0);
  return n - bestGroups;
}

function randomBalances(rng, count) {
  const values = Array.from({ length: count - 1 }, () => Math.round((rng() - 0.5) * 20) * 500 || 0);
  values.push(-values.reduce((a, b) => a + b, 0) || 0);
  return values;
}

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('simplifyDebts', () => {
  it('returns nothing when everyone is settled', () => {
    expect(simplifyDebts(toMap({ a: 0, b: 0 }))).toEqual([]);
  });

  it('matches the design example: two debtors pay one creditor', () => {
    const balances = toMap({ me: 29113, ece: -26237, mert: -2876 });
    const transfers = simplifyDebts(balances, { order: ['me', 'ece', 'mert'] });
    expect(transfers).toEqual([
      { from: 'ece', to: 'me', amount: 26237 },
      { from: 'mert', to: 'me', amount: 2876 },
    ]);
  });

  it('pairs matching debts instead of chaining them', () => {
    const balances = toMap({ a: 1000, b: -1000, c: 700, d: -700 });
    const transfers = simplifyDebts(balances);
    expect(transfers).toHaveLength(2);
    expectSettled(balances, transfers);
  });

  it('finds the minimum where a naive greedy would not', () => {
    const balances = toMap({ a: 6, b: 5, c: -4, d: -4, e: -3 });
    const extra = toMap({ a: 600, b: 500, c: -400, d: -400, e: -300 });
    for (const map of [balances, extra]) {
      const transfers = simplifyDebts(map);
      expectSettled(map, transfers);
      expect(transfers.length).toBe(bruteForceMinimum([...map.values()]));
    }
  });

  it('is optimal on random inputs', () => {
    const rng = seeded(42);
    for (let run = 0; run < 150; run += 1) {
      const count = 2 + Math.floor(rng() * 7);
      const values = randomBalances(rng, count);
      const balances = new Map(values.map((v, i) => [`m${i}`, v]));
      const transfers = simplifyDebts(balances);
      expectSettled(balances, transfers);
      expect(transfers.length).toBe(bruteForceMinimum(values));
    }
  });

  it('falls back to a valid settlement for large groups', () => {
    const rng = seeded(7);
    const values = randomBalances(rng, EXACT_LIMIT + 4);
    const balances = new Map(values.map((v, i) => [`m${i}`, v]));
    const transfers = simplifyDebts(balances);
    expectSettled(balances, transfers);
    expect(transfers.length).toBeLessThan(values.filter((v) => v !== 0).length);
  });

  it('throws when balances do not sum to zero', () => {
    expect(() => simplifyDebts(toMap({ a: 100, b: -50 }))).toThrow();
  });
});

describe('greedy matching', () => {
  it('always pairs the largest debtor with the largest creditor, re-picking each step', () => {
    const balances = toMap({ a: 10000, b: 8000, c: -15000, d: -3000 });
    expect(simplifyDebts(balances)).toEqual([
      { from: 'c', to: 'a', amount: 10000 },
      { from: 'c', to: 'b', amount: 5000 },
      { from: 'd', to: 'b', amount: 3000 },
    ]);
  });

  it('breaks ties by member order', () => {
    const balances = toMap({ a: 500, b: 500, c: -500, d: -500 });
    expect(simplifyDebts(balances, { order: ['b', 'a', 'd', 'c'] })).toEqual([
      { from: 'd', to: 'b', amount: 500 },
      { from: 'c', to: 'a', amount: 500 },
    ]);
  });

  it('keeps members missing from the order option', () => {
    const balances = toMap({ a: 300, b: -100, c: -200 });
    const transfers = simplifyDebts(balances, { order: ['a'] });
    expectSettled(balances, transfers);
  });

  it('never needs more than n - 1 transfers above the exact limit', () => {
    const rng = seeded(11);
    for (let run = 0; run < 20; run += 1) {
      const values = randomBalances(rng, EXACT_LIMIT + 1 + run);
      const balances = new Map(values.map((v, i) => [`m${i}`, v]));
      const transfers = simplifyDebts(balances);
      expectSettled(balances, transfers);
      expect(transfers.length).toBeLessThanOrEqual(values.filter((v) => v !== 0).length - 1);
    }
  });

  it('rejects fractional kuruş', () => {
    expect(() => simplifyDebts(toMap({ a: 0.5, b: -0.5 }))).toThrow();
  });
});
