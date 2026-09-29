import { monthlySpending, spendingByCategory, spendingTotals } from '@/shared/lib/stats';

import { listExpenses } from './expenseRepository';
import { getGroup } from './groupAccess';

export function getGroupStats(db, groupId, { months = 6, today }) {
  const group = getGroup(db, groupId);
  if (!group) return null;
  const expenses = listExpenses(db, groupId);
  return {
    group,
    totals: spendingTotals(expenses),
    byCategory: spendingByCategory(expenses),
    byMonth: monthlySpending(expenses, { months, until: today }),
  };
}
