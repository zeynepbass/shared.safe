export function computeBalances({ members, expenses, settlements = [] }) {
  const balances = new Map(members.map((m) => [m.id, 0]));
  const add = (id, delta) => balances.set(id, (balances.get(id) ?? 0) + delta);

  for (const expense of expenses) {
    add(expense.payerId, expense.amount);
    for (const share of expense.shares) add(share.memberId, -share.amount);
  }

  for (const settlement of settlements) {
    add(settlement.fromMemberId, settlement.amount);
    add(settlement.toMemberId, -settlement.amount);
  }

  return balances;
}

export function effectOnMember(expense, memberId) {
  const paid = expense.payerId === memberId ? expense.amount : 0;
  const owed = expense.shares.find((s) => s.memberId === memberId)?.amount ?? 0;
  return paid - owed;
}

export function totalSpent(expenses) {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}
