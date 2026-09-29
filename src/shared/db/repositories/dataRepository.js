import { notifyChange } from '../changes';
import {
  activityLog,
  expenses,
  expenseShares,
  groups,
  members,
  settings,
  settlements,
  users,
} from '../schema';
import { listGroupSnapshots } from './groupRepository';

// One row per expense and settlement across every active group, ready for toCsv. Amounts stay
// in kuruş; the caller decides how to print them.
export function listExportRows(db) {
  const rows = [];
  for (const {
    group,
    members: groupMembers,
    expenses: groupExpenses,
    settlements: paid,
  } of listGroupSnapshots(db)) {
    const nameOf = (id) => groupMembers.find((m) => m.id === id)?.name ?? '';
    for (const expense of groupExpenses) {
      rows.push({
        type: 'expense',
        group: group.name,
        date: expense.spentOn,
        description: expense.description,
        category: expense.category,
        amount: expense.amount,
        currency: expense.currency,
        paidBy: nameOf(expense.payerId),
        paidTo: '',
        splitType: expense.splitType,
        shares: expense.shares.map((s) => ({ name: nameOf(s.memberId), amount: s.amount })),
      });
    }
    for (const settlement of paid) {
      rows.push({
        type: 'settlement',
        group: group.name,
        date: settlement.paidOn,
        description: settlement.note ?? '',
        category: '',
        amount: settlement.amount,
        currency: settlement.currency,
        paidBy: nameOf(settlement.fromMemberId),
        paidTo: nameOf(settlement.toMemberId),
        splitType: '',
        shares: [],
      });
    }
  }
  return rows.sort((a, b) => a.group.localeCompare(b.group) || a.date.localeCompare(b.date));
}

const ALL_TABLES = [
  'activity_log',
  'expense_shares',
  'settlements',
  'expenses',
  'members',
  'groups',
  'users',
  'settings',
];

// Factory reset requested by the user: unlike every other delete this one is physical, since
// the point is that nothing stays on the device. Children go first to satisfy foreign keys.
export function deleteAllData(db) {
  db.transaction((tx) => {
    for (const table of [
      activityLog,
      expenseShares,
      settlements,
      expenses,
      members,
      groups,
      users,
      settings,
    ]) {
      tx.delete(table).run();
    }
  });
  notifyChange(ALL_TABLES);
}
