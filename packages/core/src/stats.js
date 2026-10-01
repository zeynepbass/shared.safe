const isActive = (record) => !record.deletedAt;

// Spending per category, largest first (ties by category id so the order is stable).
export function spendingByCategory(expenses) {
  const totals = new Map();
  for (const expense of expenses) {
    if (!isActive(expense)) continue;
    const entry = totals.get(expense.category) ?? {
      category: expense.category,
      amount: 0,
      count: 0,
    };
    entry.amount += expense.amount;
    entry.count += 1;
    totals.set(expense.category, entry);
  }
  return [...totals.values()].sort(
    (a, b) => b.amount - a.amount || (a.category < b.category ? -1 : 1),
  );
}

const monthKey = (year, monthIndex) => `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

// Spending per calendar month for the `months` months ending with the month of `until`
// (YYYY-MM-DD), oldest first. Months without expenses are present with 0 so the axis is even.
export function monthlySpending(expenses, { months = 6, until }) {
  const [year, month] = until.split('-').map(Number);
  const keys = Array.from({ length: months }, (_, i) => {
    const date = new Date(year, month - 1 - (months - 1 - i), 1);
    return monthKey(date.getFullYear(), date.getMonth());
  });
  const totals = new Map(keys.map((key) => [key, 0]));
  for (const expense of expenses) {
    if (!isActive(expense)) continue;
    const key = expense.spentOn.slice(0, 7);
    if (totals.has(key)) totals.set(key, totals.get(key) + expense.amount);
  }
  return keys.map((key) => ({ month: key, amount: totals.get(key) }));
}

export function spendingTotals(expenses) {
  const active = expenses.filter(isActive);
  return { total: active.reduce((sum, e) => sum + e.amount, 0), count: active.length };
}
