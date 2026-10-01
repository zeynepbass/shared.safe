import { monthlySpending, spendingByCategory, spendingTotals } from '@ortak-kasa/core/stats';

import { listExpenseRows } from './expenseRepository';
import { getGroup } from './groupAccess';

export function getGroupStats(db, groupId, { months = 6, today }) {
  const group = getGroup(db, groupId);
  if (!group) return null;
  // Totals only look at amounts, categories and dates, so the shares are not loaded.
  const expenses = listExpenseRows(db, groupId);
  return {
    group,
    totals: spendingTotals(expenses),
    byCategory: spendingByCategory(expenses),
    byMonth: monthlySpending(expenses, { months, until: today }),
  };
}
