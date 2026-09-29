export function mapGroup(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function mapMember(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    color: row.color,
    isSelf: row.is_self === 1,
    position: row.position,
    removedAt: row.removed_at,
  };
}

export function mapExpense(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    amount: row.amount,
    category: row.category,
    payerId: row.payer_id,
    splitType: row.split_type,
    spentOn: row.spent_on,
    note: row.note,
    receiptUri: row.receipt_uri,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shares: [],
  };
}

export function mapShare(row) {
  return {
    expenseId: row.expense_id,
    memberId: row.member_id,
    amount: row.amount,
    weight: row.weight,
  };
}

export function mapSettlement(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amount: row.amount,
    paidOn: row.paid_on,
    createdAt: row.created_at,
  };
}

export function attachShares(expenses, shareRows) {
  const byId = new Map(expenses.map((e) => [e.id, e]));
  shareRows.forEach((row) => byId.get(row.expense_id)?.shares.push(mapShare(row)));
  return expenses;
}
