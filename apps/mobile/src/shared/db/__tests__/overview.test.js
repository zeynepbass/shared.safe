import { computeBalances, effectOnMember } from '@ortak-kasa/core/balances';

import { buildTimeline } from '@/features/groups/timeline';

import {
  addMember,
  createExpense,
  createGroup,
  getGroupBalances,
  getGroupOverview,
  getGroupSnapshot,
  getGroupWithMembers,
  listGroupSummaries,
  listMembers,
  recordSettlement,
  saveProfile,
  softDeleteExpense,
  softDeleteGroup,
  softDeleteSettlement,
} from '../repositories';
import { createTestDb } from '../testing/createTestDb';

// The group and balances screens read sums and single shares straight from SQLite instead of
// loading every expense. These tests hold those queries to what core computes from the full
// records.

function setup() {
  const { db } = createTestDb();
  saveProfile(db, { name: 'Zeynep', avatarColor: '#111', defaultCurrency: 'TRY' });
  const groupId = createGroup(db, { name: 'Ev', type: 'home', currency: 'TRY' });
  const [self] = listMembers(db, groupId);
  const ali = addMember(db, groupId, { name: 'Ali', avatarColor: '#222' });
  const ayse = addMember(db, groupId, { name: 'Ayşe', avatarColor: '#333' });
  const expense = (overrides) =>
    createExpense(db, {
      groupId,
      description: 'Market',
      amount: 10000,
      category: 'market',
      payerId: self.id,
      spentOn: '2026-09-29',
      splitType: 'equal',
      shares: [{ memberId: self.id }, { memberId: ali }, { memberId: ayse }],
      ...overrides,
    });
  return { db, groupId, self: self.id, ali, ayse, expense };
}

function busyGroup() {
  const ctx = setup();
  const { db, groupId, self, ali, ayse, expense } = ctx;
  expense({ spentOn: '2026-09-27' });
  expense({ amount: 7001, payerId: ali, spentOn: '2026-09-28' });
  expense({ amount: 3000, payerId: ayse, shares: [{ memberId: ali }, { memberId: ayse }] });
  softDeleteExpense(db, expense({ amount: 99999 }));
  recordSettlement(db, {
    groupId,
    fromMemberId: ali,
    toMemberId: self,
    amount: 1200,
    paidOn: '2026-09-28',
  });
  softDeleteSettlement(
    db,
    recordSettlement(db, {
      groupId,
      fromMemberId: ayse,
      toMemberId: self,
      amount: 5,
      paidOn: '2026-09-30',
    }),
  );
  return ctx;
}

describe('balances summed by SQLite', () => {
  it('are the balances core computes from every record', () => {
    const { db, groupId } = busyGroup();
    const { balances, members } = getGroupBalances(db, groupId);
    expect(balances).toEqual(computeBalances(getGroupSnapshot(db, groupId)));
    expect([...balances.keys()]).toEqual(members.map((m) => m.id));
    expect([...balances.values()].reduce((sum, v) => sum + v, 0)).toBe(0);
  });

  it('are zero for everyone in a group without expenses', () => {
    const { db, groupId, self, ali, ayse } = setup();
    expect(getGroupBalances(db, groupId).balances).toEqual(
      new Map([
        [self, 0],
        [ali, 0],
        [ayse, 0],
      ]),
    );
  });

  it('stay apart for each group in the group list', () => {
    const { db, groupId, self } = busyGroup();
    const other = createGroup(db, { name: 'Tatil', type: 'trip', currency: 'TRY' });
    const [me] = listMembers(db, other);
    const can = addMember(db, other, { name: 'Can', avatarColor: '#444' });
    createExpense(db, {
      groupId: other,
      description: 'Otel',
      amount: 5000,
      category: 'stay',
      payerId: can,
      spentOn: '2026-10-01',
      splitType: 'equal',
      shares: [{ memberId: me.id }, { memberId: can }],
    });

    const summaries = new Map(listGroupSummaries(db).map((s) => [s.group.id, s]));
    expect(summaries.get(groupId).selfBalance).toBe(
      computeBalances(getGroupSnapshot(db, groupId)).get(self),
    );
    expect(summaries.get(other)).toMatchObject({
      selfBalance: -2500,
      memberCount: 2,
      lastExpense: { description: 'Otel', payer: { id: can } },
    });
  });

  it('are gone with a deleted group', () => {
    const { db, groupId } = busyGroup();
    softDeleteGroup(db, groupId);
    expect(getGroupBalances(db, groupId)).toBeNull();
    expect(getGroupOverview(db, groupId)).toBeNull();
    expect(getGroupWithMembers(db, groupId)).toBeNull();
    expect(listGroupSummaries(db)).toEqual([]);
  });
});

describe('the group screen', () => {
  it('gets every active expense with the share of the local user', () => {
    const { db, groupId, self } = busyGroup();
    const overview = getGroupOverview(db, groupId);
    const full = getGroupSnapshot(db, groupId);

    expect(overview.expenses.map((e) => e.id)).toEqual(full.expenses.map((e) => e.id));
    for (const [i, expense] of overview.expenses.entries()) {
      const share = full.expenses[i].shares.find((s) => s.memberId === self);
      expect(expense.selfShare).toBe(share ? share.amount : null);
      const paid = expense.payerId === self ? expense.amount : 0;
      expect(paid - (expense.selfShare ?? 0)).toBe(effectOnMember(full.expenses[i], self));
    }
    expect(overview.selfBalance).toBe(computeBalances(full).get(self));
    expect(overview.settlements).toEqual(full.settlements);
  });

  it('lists expenses and settlements newest first, under one header per day', () => {
    const { db, groupId } = busyGroup();
    const { expenses, settlements } = getGroupOverview(db, groupId);
    const rows = buildTimeline(expenses, settlements);

    // Within a day the most recently recorded comes first: the settlement of the 28th was
    // recorded after that day's expense.
    expect(rows.map((r) => (r.kind === 'day' ? r.date : r.kind))).toEqual([
      '2026-09-29',
      'expense',
      '2026-09-28',
      'settlement',
      'expense',
      '2026-09-27',
      'expense',
    ]);
    expect(buildTimeline([], [])).toEqual([]);
    expect(buildTimeline([], settlements).map((r) => r.kind)).toEqual(['day', 'settlement']);
  });

  it('reads the newest expenses first and the rest as asked', () => {
    const { db, groupId } = busyGroup();
    const all = getGroupOverview(db, groupId);
    expect(all.hasMore).toBe(false);

    // Only the expense of the 29th: the settlement of the 28th waits for that day's expense.
    const first = getGroupOverview(db, groupId, { limit: 1 });
    expect(first.hasMore).toBe(true);
    expect(first.expenses).toEqual(all.expenses.slice(0, 1));
    expect(first.settlements).toEqual([]);
    // Balances are of the whole group however much of the list is read.
    expect(first.balances).toEqual(all.balances);

    const second = getGroupOverview(db, groupId, { limit: 2 });
    expect(second.hasMore).toBe(true);
    expect(second.expenses).toEqual(all.expenses.slice(0, 2));
    expect(second.settlements).toEqual(all.settlements);

    const rest = getGroupOverview(db, groupId, { limit: 3 });
    expect(rest.hasMore).toBe(false);
    expect(rest.expenses).toEqual(all.expenses);
  });
});
