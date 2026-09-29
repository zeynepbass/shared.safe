import {
  addMember,
  buildShares,
  createExpense,
  createGroup,
  getExpense,
  getGroupSnapshot,
  getLocalUser,
  listActivity,
  listGroups,
  listMembers,
  recordSettlement,
  removeMember,
  restoreExpense,
  saveProfile,
  softDeleteExpense,
  softDeleteGroup,
  softDeleteSettlement,
  updateExpense,
} from '../repositories';
import { expenseShares } from '../schema';
import { createTestDb } from '../testing/createTestDb';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('crypto').randomUUID() }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sum = (shares) => shares.reduce((total, s) => total + s.amount, 0);

function setup() {
  const { db, sqlite } = createTestDb();
  saveProfile(db, { name: 'Zeynep', avatarColor: '#111', defaultCurrency: 'TRY' });
  const groupId = createGroup(db, {
    name: 'Ev',
    type: 'home',
    currency: 'TRY',
    self: { name: 'Zeynep', avatarColor: '#111' },
  });
  const [self] = listMembers(db, groupId);
  const ali = addMember(db, groupId, { name: 'Ali', avatarColor: '#222' });
  const ayse = addMember(db, groupId, { name: 'Ayşe', avatarColor: '#333' });
  return { db, sqlite, groupId, self: self.id, ali, ayse };
}

function expenseInput(ctx, overrides = {}) {
  return {
    groupId: ctx.groupId,
    description: 'Market',
    amount: 10000,
    category: 'market',
    payerId: ctx.self,
    spentOn: '2026-09-29',
    splitType: 'equal',
    shares: [{ memberId: ctx.self }, { memberId: ctx.ali }, { memberId: ctx.ayse }],
    ...overrides,
  };
}

describe('migrations', () => {
  it('creates every table', () => {
    const { sqlite } = createTestDb();
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%'",
      )
      .all()
      .map((row) => row.name)
      .sort();
    expect(tables).toEqual([
      'activity_log',
      'expense_shares',
      'expenses',
      'groups',
      'members',
      'settings',
      'settlements',
      'users',
    ]);
  });
});

describe('users', () => {
  it('keeps a single local profile and mirrors it onto the local members', () => {
    const ctx = setup();
    const first = getLocalUser(ctx.db);
    expect(first.id).toMatch(UUID);

    saveProfile(ctx.db, { name: 'Zeynep B', avatarColor: '#999' });
    const updated = getLocalUser(ctx.db);
    expect(updated.id).toBe(first.id);
    expect(updated.defaultCurrency).toBe('TRY');
    const self = listMembers(ctx.db, ctx.groupId).find((m) => m.isLocalUser);
    expect(self).toMatchObject({ name: 'Zeynep B', avatarColor: '#999' });
  });
});

describe('groups and members', () => {
  it('stores uuids, timestamps and the icon', () => {
    const ctx = setup();
    const { group, members } = getGroupSnapshot(ctx.db, ctx.groupId);
    expect(group.id).toMatch(UUID);
    expect(group.icon).toBe('home');
    expect(group.createdAt).toEqual(expect.any(Number));
    expect(group.updatedAt).toBeGreaterThanOrEqual(group.createdAt);
    expect(members.map((m) => m.name)).toEqual(['Zeynep', 'Ali', 'Ayşe']);
    expect(members.map((m) => m.position)).toEqual([0, 1, 2]);
  });

  it('soft deletes groups', () => {
    const ctx = setup();
    softDeleteGroup(ctx.db, ctx.groupId);
    expect(listGroups(ctx.db)).toEqual([]);
    expect(getGroupSnapshot(ctx.db, ctx.groupId)).toBeNull();
    const row = ctx.sqlite.prepare('SELECT deleted_at FROM groups WHERE id = ?').get(ctx.groupId);
    expect(row.deleted_at).toEqual(expect.any(Number));
  });

  it('refuses to remove a member that expenses still point at', () => {
    const ctx = setup();
    createExpense(ctx.db, expenseInput(ctx));
    expect(() => removeMember(ctx.db, ctx.ali)).toThrow(
      expect.objectContaining({ code: 'memberInUse' }),
    );

    const extra = addMember(ctx.db, ctx.groupId, { name: 'Can', avatarColor: '#444' });
    removeMember(ctx.db, extra);
    expect(listMembers(ctx.db, ctx.groupId).map((m) => m.name)).not.toContain('Can');
  });
});

describe('buildShares', () => {
  it('distributes leftover kuruş by member id, independent of input order', () => {
    const ids = ['c', 'a', 'b'];
    const forward = buildShares(
      100,
      'equal',
      ids.map((memberId) => ({ memberId })),
    );
    const reversed = buildShares(
      100,
      'equal',
      [...ids].reverse().map((memberId) => ({ memberId })),
    );
    const byMember = (shares) => Object.fromEntries(shares.map((s) => [s.memberId, s.amount]));
    expect(byMember(forward)).toEqual({ a: 34, b: 33, c: 33 });
    expect(byMember(reversed)).toEqual(byMember(forward));
  });

  it('always adds up to the amount', () => {
    for (const amount of [1, 2, 99, 100, 101, 12345, 999999]) {
      for (const [type, shares] of [
        ['equal', [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }]],
        [
          'shares',
          [
            { memberId: 'a', weight: 1 },
            { memberId: 'b', weight: 2 },
            { memberId: 'c', weight: 4 },
          ],
        ],
        [
          'percent',
          [
            { memberId: 'a', weight: 3333 },
            { memberId: 'b', weight: 3333 },
            { memberId: 'c', weight: 3334 },
          ],
        ],
      ]) {
        expect(sum(buildShares(amount, type, shares))).toBe(amount);
      }
    }
  });

  it('rejects splits that do not match the amount', () => {
    expect(() =>
      buildShares(1000, 'amount', [
        { memberId: 'a', amount: 400 },
        { memberId: 'b', amount: 500 },
      ]),
    ).toThrow(expect.objectContaining({ code: 'amountMismatch' }));
    expect(() =>
      buildShares(1000, 'percent', [
        { memberId: 'a', weight: 5000 },
        { memberId: 'b', weight: 4000 },
      ]),
    ).toThrow(expect.objectContaining({ code: 'percentMismatch' }));
    expect(() => buildShares(1000, 'equal', [])).toThrow(
      expect.objectContaining({ code: 'noParticipants' }),
    );
    expect(() => buildShares(1000, 'equal', [{ memberId: 'a' }, { memberId: 'a' }])).toThrow(
      expect.objectContaining({ code: 'duplicateShareMember' }),
    );
  });
});

describe('expenses', () => {
  it('saves shares that add up to the amount, with the group currency', () => {
    const ctx = setup();
    const id = createExpense(ctx.db, expenseInput(ctx));
    const expense = getExpense(ctx.db, id);
    expect(expense).toMatchObject({ currency: 'TRY', splitType: 'equal', amount: 10000 });
    expect(sum(expense.shares)).toBe(10000);
    expect(expense.shares.every((s) => UUID.test(s.id))).toBe(true);
    expect(expense.shares.map((s) => s.splitType)).toEqual(['equal', 'equal', 'equal']);
  });

  it('ignores caller-supplied amounts for computed splits', () => {
    const ctx = setup();
    const id = createExpense(
      ctx.db,
      expenseInput(ctx, {
        shares: [
          { memberId: ctx.self, amount: 1 },
          { memberId: ctx.ali, amount: 1 },
          { memberId: ctx.ayse, amount: 1 },
        ],
      }),
    );
    expect(sum(getExpense(ctx.db, id).shares)).toBe(10000);
  });

  it('rejects members from another group', () => {
    const ctx = setup();
    const otherGroup = createGroup(ctx.db, {
      name: 'Tatil',
      type: 'trip',
      currency: 'EUR',
      self: { name: 'Zeynep', avatarColor: '#111' },
    });
    const stranger = addMember(ctx.db, otherGroup, { name: 'Deniz', avatarColor: '#555' });
    expect(() =>
      createExpense(ctx.db, expenseInput(ctx, { shares: [{ memberId: stranger }] })),
    ).toThrow(expect.objectContaining({ code: 'memberNotInGroup' }));
  });

  it('keeps share rows stable across edits and soft deletes dropped members', () => {
    const ctx = setup();
    const id = createExpense(ctx.db, expenseInput(ctx));
    const before = getExpense(ctx.db, id).shares;

    updateExpense(
      ctx.db,
      id,
      expenseInput(ctx, {
        amount: 5001,
        splitType: 'shares',
        shares: [
          { memberId: ctx.self, weight: 2 },
          { memberId: ctx.ali, weight: 1 },
        ],
      }),
    );
    const after = getExpense(ctx.db, id);
    expect(after.splitType).toBe('shares');
    expect(sum(after.shares)).toBe(5001);
    expect(after.shares.map((s) => s.id)).toEqual(before.slice(0, 2).map((s) => s.id));

    const all = ctx.db.select().from(expenseShares).all();
    expect(all).toHaveLength(3);
    expect(all.find((s) => s.memberId === ctx.ayse).deletedAt).toEqual(expect.any(Number));
  });

  it('soft deletes and restores', () => {
    const ctx = setup();
    const id = createExpense(ctx.db, expenseInput(ctx));
    softDeleteExpense(ctx.db, id);
    expect(getGroupSnapshot(ctx.db, ctx.groupId).expenses).toEqual([]);
    expect(getExpense(ctx.db, id).deletedAt).toEqual(expect.any(Number));

    restoreExpense(ctx.db, id);
    const [restored] = getGroupSnapshot(ctx.db, ctx.groupId).expenses;
    expect(restored.id).toBe(id);
    expect(sum(restored.shares)).toBe(10000);
  });
});

describe('settlements and activity', () => {
  it('records settlements, soft deletes them and logs every change', () => {
    const ctx = setup();
    const expenseId = createExpense(ctx.db, expenseInput(ctx));
    const settlementId = recordSettlement(ctx.db, {
      groupId: ctx.groupId,
      fromMemberId: ctx.ali,
      toMemberId: ctx.self,
      amount: 3333,
      paidOn: '2026-09-29',
    });
    expect(getGroupSnapshot(ctx.db, ctx.groupId).settlements).toHaveLength(1);
    softDeleteSettlement(ctx.db, settlementId);
    expect(getGroupSnapshot(ctx.db, ctx.groupId).settlements).toHaveLength(0);

    const log = listActivity(ctx.db, ctx.groupId);
    expect(log.map((entry) => entry.type).sort()).toEqual(
      [
        'group_created',
        'member_added',
        'member_added',
        'member_added',
        'expense_created',
        'settlement_created',
        'settlement_deleted',
      ].sort(),
    );
    const expenseEntry = log.find((entry) => entry.type === 'expense_created');
    expect(expenseEntry).toMatchObject({ entityType: 'expense', entityId: expenseId });
    expect(expenseEntry.payload).toEqual({ description: 'Market', amount: 10000, currency: 'TRY' });
  });

  it('rejects settling with yourself', () => {
    const ctx = setup();
    expect(() =>
      recordSettlement(ctx.db, {
        groupId: ctx.groupId,
        fromMemberId: ctx.ali,
        toMemberId: ctx.ali,
        amount: 100,
        paidOn: '2026-09-29',
      }),
    ).toThrow(expect.objectContaining({ code: 'sameMember' }));
  });
});
