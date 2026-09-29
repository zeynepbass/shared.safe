import { computeBalances, effectOnMember, totalSpent } from '../balances';

const members = [{ id: 'me' }, { id: 'ece' }, { id: 'mert' }];

describe('computeBalances', () => {
  it('credits the payer and debits every share', () => {
    const balances = computeBalances({
      members,
      expenses: [
        {
          payerId: 'me',
          amount: 124000,
          shares: [
            { memberId: 'me', amount: 41334 },
            { memberId: 'ece', amount: 41333 },
            { memberId: 'mert', amount: 41333 },
          ],
        },
      ],
    });
    expect(balances.get('me')).toBe(82666);
    expect(balances.get('ece')).toBe(-41333);
    expect(balances.get('mert')).toBe(-41333);
  });

  it('always sums to zero', () => {
    const balances = computeBalances({
      members,
      expenses: [
        {
          payerId: 'ece',
          amount: 48640,
          shares: [
            { memberId: 'me', amount: 16214 },
            { memberId: 'ece', amount: 16213 },
            { memberId: 'mert', amount: 16213 },
          ],
        },
      ],
      settlements: [{ fromMemberId: 'mert', toMemberId: 'ece', amount: 10000 }],
    });
    const total = [...balances.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it('applies settlements from debtor to creditor', () => {
    const balances = computeBalances({
      members,
      expenses: [],
      settlements: [{ fromMemberId: 'ece', toMemberId: 'me', amount: 5000 }],
    });
    expect(balances.get('ece')).toBe(5000);
    expect(balances.get('me')).toBe(-5000);
    expect(balances.get('mert')).toBe(0);
  });
});

describe('effectOnMember', () => {
  const expense = {
    payerId: 'me',
    amount: 90000,
    shares: [
      { memberId: 'me', amount: 30000 },
      { memberId: 'ece', amount: 60000 },
    ],
  };

  it('is positive for the payer', () => {
    expect(effectOnMember(expense, 'me')).toBe(60000);
  });

  it('is negative for participants who did not pay', () => {
    expect(effectOnMember(expense, 'ece')).toBe(-60000);
  });

  it('is zero for uninvolved members', () => {
    expect(effectOnMember(expense, 'mert')).toBe(0);
  });
});

describe('soft-deleted records', () => {
  it('are left out of the balance', () => {
    const balances = computeBalances({
      members,
      expenses: [
        {
          payerId: 'me',
          amount: 6000,
          deletedAt: 1,
          shares: [
            { memberId: 'me', amount: 3000 },
            { memberId: 'ece', amount: 3000 },
          ],
        },
        {
          payerId: 'ece',
          amount: 1000,
          shares: [
            { memberId: 'me', amount: 1000 },
            { memberId: 'mert', amount: 500, deletedAt: 1 },
          ],
        },
      ],
      settlements: [{ fromMemberId: 'me', toMemberId: 'ece', amount: 400, deletedAt: 1 }],
    });
    expect(Object.fromEntries(balances)).toEqual({ me: -1000, ece: 1000, mert: 0 });
    expect(totalSpent([{ amount: 5 }, { amount: 7, deletedAt: 1 }])).toBe(5);
  });

  it('still reports members that appear only in records', () => {
    const balances = computeBalances({
      members: [{ id: 'me' }],
      expenses: [{ payerId: 'me', amount: 100, shares: [{ memberId: 'old', amount: 100 }] }],
    });
    expect(balances.get('old')).toBe(-100);
  });
});
