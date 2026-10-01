const isActive = (record) => !record.deletedAt;

// Net balance per member in kuruş: positive means the group owes them, negative means they owe
// the group. Soft-deleted expenses, shares and settlements are ignored. The result always sums
// to zero as long as every expense's shares add up to its amount.
export function computeBalances({ members, expenses = [], settlements = [] }) {
  const balances = new Map(members.map((m) => [m.id, 0]));
  const add = (id, delta) => balances.set(id, (balances.get(id) ?? 0) + delta);

  for (const expense of expenses) {
    if (!isActive(expense)) continue;
    add(expense.payerId, expense.amount);
    for (const share of expense.shares) {
      if (isActive(share)) add(share.memberId, -share.amount);
    }
  }

  // The payer hands money over, which reduces what they owe.
  for (const settlement of settlements) {
    if (!isActive(settlement)) continue;
    add(settlement.fromMemberId, settlement.amount);
    add(settlement.toMemberId, -settlement.amount);
  }

  return balances;
}

export function effectOnMember(expense, memberId) {
  const paid = expense.payerId === memberId ? expense.amount : 0;
  const owed = expense.shares.find((s) => s.memberId === memberId && isActive(s))?.amount ?? 0;
  return paid - owed;
}

export function totalSpent(expenses) {
  return expenses.filter(isActive).reduce((sum, e) => sum + e.amount, 0);
}
