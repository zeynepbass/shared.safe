import { monthlySpending, spendingByCategory, spendingTotals } from '../src/stats.js';

const e = (category, amount, spentOn, extra = {}) => ({ category, amount, spentOn, ...extra });

describe('spendingByCategory', () => {
  it('sums per category, largest first, skipping deleted expenses', () => {
    const result = spendingByCategory([
      e('food', 1000, '2026-09-01'),
      e('market', 3000, '2026-09-02'),
      e('food', 2500, '2026-09-03'),
      e('fun', 9999, '2026-09-03', { deletedAt: 1 }),
    ]);
    expect(result).toEqual([
      { category: 'food', amount: 3500, count: 2 },
      { category: 'market', amount: 3000, count: 1 },
    ]);
  });

  it('orders ties by category id', () => {
    const result = spendingByCategory([
      e('stay', 100, '2026-09-01'),
      e('bills', 100, '2026-09-01'),
    ]);
    expect(result.map((r) => r.category)).toEqual(['bills', 'stay']);
  });

  it('is empty without expenses', () => {
    expect(spendingByCategory([])).toEqual([]);
  });
});

describe('monthlySpending', () => {
  it('returns every month in the window, oldest first, including empty ones', () => {
    const result = monthlySpending(
      [
        e('food', 1000, '2026-09-29'),
        e('food', 500, '2026-09-01'),
        e('food', 700, '2026-07-15'),
        e('food', 9000, '2026-03-31'),
        e('food', 100, '2026-10-01'),
      ],
      { months: 6, until: '2026-09-29' },
    );
    expect(result).toEqual([
      { month: '2026-04', amount: 0 },
      { month: '2026-05', amount: 0 },
      { month: '2026-06', amount: 0 },
      { month: '2026-07', amount: 700 },
      { month: '2026-08', amount: 0 },
      { month: '2026-09', amount: 1500 },
    ]);
  });

  it('crosses year boundaries', () => {
    const result = monthlySpending([e('food', 1, '2025-12-31')], {
      months: 3,
      until: '2026-02-10',
    });
    expect(result.map((r) => r.month)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(result[0].amount).toBe(1);
  });
});

describe('spendingTotals', () => {
  it('counts only active expenses', () => {
    expect(
      spendingTotals([e('food', 100, '2026-09-01'), e('food', 50, '2026-09-01', { deletedAt: 1 })]),
    ).toEqual({ total: 100, count: 1 });
  });
});
