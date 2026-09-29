import { computeBalances } from '../balances';
import { formatMoney, toMinor } from '../money';
import { EXACT_LIMIT, simplifyDebts } from '../simplify';
import { computeSplit } from '../split';

// End-to-end: split an expense, derive balances, settle them.

const ids = (count) => Array.from({ length: count }, (_, i) => `m${String(i).padStart(2, '0')}`);
const membersOf = (memberIds) => memberIds.map((id) => ({ id }));
const total = (map) => [...map.values()].reduce((a, b) => a + b, 0);

function expense({ payerId, amount, type = 'equal', participants }) {
  const split = computeSplit({
    total: amount,
    type,
    participants: participants.map((p) => (typeof p === 'string' ? { memberId: p } : p)),
  });
  if (!split.valid) throw new Error(`invalid split: ${split.reason}`);
  return { payerId, amount, shares: split.shares };
}

function applyTransfers(balances, transfers) {
  const result = new Map(balances);
  for (const { from, to, amount } of transfers) {
    result.set(from, result.get(from) + amount);
    result.set(to, result.get(to) - amount);
  }
  return result;
}

function expectFullySettled(balances, transfers) {
  for (const value of applyTransfers(balances, transfers).values()) expect(value).toBe(0);
  for (const t of transfers) {
    expect(Number.isInteger(t.amount)).toBe(true);
    expect(t.amount).toBeGreaterThan(0);
    expect(t.from).not.toBe(t.to);
    expect(balances.get(t.from)).toBeLessThan(0);
    expect(balances.get(t.to)).toBeGreaterThan(0);
  }
}

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('equal split', () => {
  it('turns one payment into two equal debts', () => {
    const [a, b, c] = ids(3);
    const balances = computeBalances({
      members: membersOf([a, b, c]),
      expenses: [expense({ payerId: a, amount: toMinor(300), participants: [a, b, c] })],
    });
    expect(Object.fromEntries(balances)).toEqual({ [a]: 20000, [b]: -10000, [c]: -10000 });

    const transfers = simplifyDebts(balances, { order: [a, b, c] });
    expect(transfers).toEqual([
      { from: b, to: a, amount: 10000 },
      { from: c, to: a, amount: 10000 },
    ]);
    expect(formatMoney(transfers[0].amount)).toBe('₺100,00');
  });

  it('nets several payers against each other', () => {
    const [a, b, c, d] = ids(4);
    const people = [a, b, c, d];
    const balances = computeBalances({
      members: membersOf(people),
      expenses: [
        expense({ payerId: a, amount: 40000, participants: people }),
        expense({ payerId: b, amount: 20000, participants: people }),
        expense({ payerId: c, amount: 12000, participants: [c, d] }),
      ],
    });
    expect(Object.fromEntries(balances)).toEqual({
      [a]: 25000,
      [b]: 5000,
      [c]: -9000,
      [d]: -21000,
    });
    const transfers = simplifyDebts(balances, { order: people });
    expectFullySettled(balances, transfers);
    expect(transfers).toHaveLength(3);
  });
});

describe('percent split', () => {
  it('charges each member their percentage of the amount', () => {
    const [a, b, c] = ids(3);
    const balances = computeBalances({
      members: membersOf([a, b, c]),
      expenses: [
        expense({
          payerId: b,
          amount: toMinor(1000),
          type: 'percent',
          participants: [
            { memberId: a, weight: 5000 },
            { memberId: b, weight: 3000 },
            { memberId: c, weight: 2000 },
          ],
        }),
      ],
    });
    expect(Object.fromEntries(balances)).toEqual({ [a]: -50000, [b]: 70000, [c]: -20000 });
    expectFullySettled(balances, simplifyDebts(balances));
  });

  it('keeps the kuruş when percentages do not divide the amount', () => {
    const [a, b, c] = ids(3);
    const shares = expense({
      payerId: a,
      amount: 1001,
      type: 'percent',
      participants: [
        { memberId: a, weight: 3333 },
        { memberId: b, weight: 3333 },
        { memberId: c, weight: 3334 },
      ],
    }).shares;
    expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(1001);
    // 333,63 / 333,63 / 333,73: c has the largest remainder, the a/b tie goes to the lower id.
    expect(shares.map((s) => s.amount)).toEqual([334, 333, 334]);
  });
});

describe('indivisible kuruş', () => {
  it('splits ₺100 three ways as 33,34 + 33,33 + 33,33', () => {
    const [a, b, c] = ids(3);
    const { shares } = expense({ payerId: a, amount: 10000, participants: [a, b, c] });
    expect(shares.map((s) => s.amount)).toEqual([3334, 3333, 3333]);
  });

  it('gives the extra kuruş to the same member whatever the order', () => {
    const [a, b, c] = ids(3);
    const forward = expense({ payerId: a, amount: 10000, participants: [a, b, c] }).shares;
    const reversed = expense({ payerId: a, amount: 10000, participants: [c, b, a] }).shares;
    const byMember = (shares) => Object.fromEntries(shares.map((s) => [s.memberId, s.amount]));
    expect(byMember(reversed)).toEqual(byMember(forward));
  });

  it('handles amounts smaller than the number of people', () => {
    const people = ids(3);
    for (const amount of [1, 2]) {
      const { shares } = expense({ payerId: people[0], amount, participants: people });
      expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(amount);
      expect(Math.max(...shares.map((s) => s.amount))).toBe(1);
    }
  });

  it('never loses a kuruş across many awkward expenses', () => {
    const people = ids(7);
    const rng = seeded(3);
    const expenses = Array.from({ length: 200 }, () =>
      expense({
        payerId: people[Math.floor(rng() * people.length)],
        amount: 1 + Math.floor(rng() * 99999),
        participants: people.filter(() => rng() > 0.3).concat(people[0]),
      }),
    );
    const balances = computeBalances({ members: membersOf(people), expenses });
    expect(total(balances)).toBe(0);
    expectFullySettled(balances, simplifyDebts(balances));
  });
});

describe('single-member group', () => {
  it('owes nothing to anyone', () => {
    const [me] = ids(1);
    const balances = computeBalances({
      members: membersOf([me]),
      expenses: [
        expense({ payerId: me, amount: 12345, participants: [me] }),
        expense({ payerId: me, amount: 1, participants: [me] }),
      ],
    });
    expect(balances.get(me)).toBe(0);
    expect(simplifyDebts(balances)).toEqual([]);
  });
});

describe('everyone at zero', () => {
  it('returns no transfers for a group without expenses', () => {
    const people = ids(4);
    const balances = computeBalances({ members: membersOf(people), expenses: [] });
    expect([...balances.values()]).toEqual([0, 0, 0, 0]);
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it('returns no transfers when expenses cancel out', () => {
    const [a, b] = ids(2);
    const balances = computeBalances({
      members: membersOf([a, b]),
      expenses: [
        expense({ payerId: a, amount: 5000, participants: [b] }),
        expense({ payerId: b, amount: 10000, participants: [a, b] }),
      ],
    });
    expect(Object.fromEntries(balances)).toEqual({ [a]: 0, [b]: 0 });
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it('returns no transfers once everything has been settled', () => {
    const [a, b, c] = ids(3);
    const expenses = [expense({ payerId: a, amount: 9000, participants: [a, b, c] })];
    const settlements = [
      { fromMemberId: b, toMemberId: a, amount: 3000 },
      { fromMemberId: c, toMemberId: a, amount: 3000 },
    ];
    const balances = computeBalances({ members: membersOf([a, b, c]), expenses, settlements });
    expect([...balances.values()]).toEqual([0, 0, 0]);
    expect(simplifyDebts(balances)).toEqual([]);
  });
});

describe('groups with 10+ members', () => {
  function randomGroup(seed, count, expenseCount) {
    const people = ids(count);
    const rng = seeded(seed);
    const expenses = Array.from({ length: expenseCount }, () => {
      const participants = people.filter(() => rng() > 0.4);
      if (participants.length === 0) participants.push(people[0]);
      return expense({
        payerId: people[Math.floor(rng() * count)],
        amount: 1 + Math.floor(rng() * 500000),
        participants,
      });
    });
    return { people, balances: computeBalances({ members: membersOf(people), expenses }) };
  }

  it.each([10, 12, EXACT_LIMIT, EXACT_LIMIT + 1, 25, 40])(
    'settles a %i-person group in at most n - 1 transfers',
    (count) => {
      const { people, balances } = randomGroup(count, count, count * 5);
      expect(total(balances)).toBe(0);
      const transfers = simplifyDebts(balances, { order: people });
      expectFullySettled(balances, transfers);
      const nonZero = [...balances.values()].filter((v) => v !== 0).length;
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
    },
  );

  it('splits one bill between 12 people and collects it with 11 transfers', () => {
    const people = ids(12);
    const balances = computeBalances({
      members: membersOf(people),
      expenses: [expense({ payerId: people[0], amount: toMinor(1234.56), participants: people })],
    });
    const transfers = simplifyDebts(balances, { order: people });
    expect(transfers).toHaveLength(11);
    expect(transfers.every((t) => t.to === people[0])).toBe(true);
    expect(balances.get(people[0])).toBe(123456 - 10288);
    expect(transfers.map((t) => t.amount)).toEqual(Array(11).fill(10288));
    expectFullySettled(balances, transfers);
  });

  it('is deterministic for the same input', () => {
    const first = randomGroup(99, 15, 60);
    const second = randomGroup(99, 15, 60);
    expect(simplifyDebts(second.balances, { order: second.people })).toEqual(
      simplifyDebts(first.balances, { order: first.people }),
    );
  });
});

describe('balance after a partial settlement', () => {
  const [a, b, c] = ids(3);
  const members = membersOf([a, b, c]);
  const expenses = [expense({ payerId: a, amount: 30000, participants: [a, b, c] })];

  it('reduces the debt by the amount paid', () => {
    const settlements = [{ fromMemberId: b, toMemberId: a, amount: 4000 }];
    const balances = computeBalances({ members, expenses, settlements });
    expect(Object.fromEntries(balances)).toEqual({ [a]: 16000, [b]: -6000, [c]: -10000 });
    expect(simplifyDebts(balances, { order: [a, b, c] })).toEqual([
      { from: c, to: a, amount: 10000 },
      { from: b, to: a, amount: 6000 },
    ]);
  });

  it('flips the direction when someone overpays', () => {
    const settlements = [{ fromMemberId: b, toMemberId: a, amount: 15000 }];
    const balances = computeBalances({ members, expenses, settlements });
    expect(Object.fromEntries(balances)).toEqual({ [a]: 5000, [b]: 5000, [c]: -10000 });
    const transfers = simplifyDebts(balances, { order: [a, b, c] });
    expect(transfers).toEqual([
      { from: c, to: a, amount: 5000 },
      { from: c, to: b, amount: 5000 },
    ]);
  });

  it('ignores a settlement that was deleted', () => {
    const settlements = [{ fromMemberId: b, toMemberId: a, amount: 4000, deletedAt: 1 }];
    const balances = computeBalances({ members, expenses, settlements });
    expect(Object.fromEntries(balances)).toEqual({ [a]: 20000, [b]: -10000, [c]: -10000 });
  });

  it('lets a settlement between two debtors move the debt', () => {
    const settlements = [{ fromMemberId: c, toMemberId: b, amount: 2500 }];
    const balances = computeBalances({ members, expenses, settlements });
    expect(Object.fromEntries(balances)).toEqual({ [a]: 20000, [b]: -12500, [c]: -7500 });
    expectFullySettled(balances, simplifyDebts(balances));
  });
});
