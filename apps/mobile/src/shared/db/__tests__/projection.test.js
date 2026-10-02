import { asc, eq, inArray } from 'drizzle-orm';

import {
  addMember,
  claimMembership,
  createExpense,
  createGroup,
  createInvite,
  getExpense,
  getExpenseConflict,
  joinGroupByInvite,
  listMembers,
  recordSettlement,
  removeMember,
  resolveConflict,
  restoreExpense,
  saveProfile,
  softDeleteExpense,
  softDeleteGroup,
  softDeleteSettlement,
  updateExpense,
  updateGroup,
  updateMember,
} from '../repositories';
import { activityLog, expenses, expenseShares, groups, members, settlements } from '../schema';
import { loadGroupDoc } from '../sync/groupDocs';
import { projectGroup } from '../sync/projection';
import { receiptFilesOf } from '../sync/receiptFiles';
import { createRelay } from '../testing/createRelay';
import { createTestDb } from '../testing/createTestDb';

// Changes are projected record by record. These tests hold that to the simple definition of
// right: after any sequence of changes the read tables are exactly what rebuilding them from
// the document gives.

function phone(name) {
  const { db } = createTestDb();
  saveProfile(db, { name, avatarColor: '#111', defaultCurrency: 'TRY' });
  return db;
}

function tables(db, groupId) {
  const of = (table) =>
    db.select().from(table).where(eq(table.groupId, groupId)).orderBy(asc(table.id)).all();
  const expenseRows = of(expenses);
  return {
    groups: db.select().from(groups).where(eq(groups.id, groupId)).all(),
    members: of(members),
    expenses: expenseRows,
    shares: db
      .select()
      .from(expenseShares)
      .where(
        inArray(
          expenseShares.expenseId,
          expenseRows.map((e) => e.id),
        ),
      )
      .orderBy(asc(expenseShares.id))
      .all(),
    settlements: of(settlements),
    activity: of(activityLog),
  };
}

function expectSameAsRebuild(db, groupId) {
  const projected = tables(db, groupId);
  db.transaction((tx) => projectGroup(tx, groupId, loadGroupDoc(db, groupId)));
  expect(projected).toEqual(tables(db, groupId));
}

const input = (groupId, payerId, memberIds, overrides = {}) => ({
  groupId,
  description: 'Market',
  amount: 9000,
  category: 'market',
  payerId,
  spentOn: '2026-09-30',
  splitType: 'equal',
  shares: memberIds.map((memberId) => ({ memberId })),
  ...overrides,
});

function twoPhones() {
  const relay = createRelay();
  const zeynep = phone('Zeynep');
  const ali = phone('Ali');
  const groupId = createGroup(zeynep, { name: 'Ev', type: 'home', currency: 'TRY' });
  relay.sync(zeynep);
  joinGroupByInvite(ali, createInvite(zeynep, groupId));
  relay.sync(ali);
  claimMembership(ali, groupId, null);
  relay.sync(ali);
  relay.sync(zeynep);
  const ids = listMembers(zeynep, groupId).map((m) => m.id);
  const check = () => {
    expectSameAsRebuild(zeynep, groupId);
    expectSameAsRebuild(ali, groupId);
  };
  const syncAll = () => {
    relay.sync(zeynep);
    relay.sync(ali);
    relay.sync(zeynep);
    check();
  };
  return { relay, zeynep, ali, groupId, ids, check, syncAll };
}

describe('projecting only what changed', () => {
  it('matches a full rebuild after every kind of local change', () => {
    const { zeynep: db, groupId, ids, check } = twoPhones();

    const first = createExpense(db, input(groupId, ids[0], ids));
    const second = createExpense(
      db,
      input(groupId, ids[1], ids, {
        splitType: 'shares',
        shares: [
          { memberId: ids[0], weight: 2 },
          { memberId: ids[1], weight: 1 },
        ],
      }),
    );
    check();

    updateExpense(db, first, input(groupId, ids[1], [ids[0]], { amount: 4200, note: 'Pazar' }));
    check();
    expect(getExpense(db, first).shares).toHaveLength(1);

    softDeleteExpense(db, second);
    check();
    restoreExpense(db, second);
    check();

    const settlement = recordSettlement(db, {
      groupId,
      fromMemberId: ids[1],
      toMemberId: ids[0],
      amount: 1500,
      paidOn: '2026-10-01',
    });
    softDeleteSettlement(db, settlement);
    check();

    const mert = addMember(db, groupId, { name: 'Mert', avatarColor: '#333' });
    updateMember(db, mert, { name: 'Mert K.', avatarColor: '#444' });
    check();
    removeMember(db, mert);
    check();

    updateGroup(db, groupId, { name: 'Yeni ev', type: 'home', currency: 'TRY', icon: 'home' });
    check();
    softDeleteGroup(db, groupId);
    check();
  });

  it('matches a full rebuild after changes from another phone', () => {
    const { zeynep, ali, groupId, ids, syncAll } = twoPhones();
    const id = createExpense(zeynep, input(groupId, ids[0], ids));
    syncAll();

    updateExpense(ali, id, input(groupId, ids[1], ids, { amount: 7000 }));
    addMember(ali, groupId, { name: 'Ece', avatarColor: '#555' });
    recordSettlement(ali, {
      groupId,
      fromMemberId: ids[0],
      toMemberId: ids[1],
      amount: 100,
      paidOn: '2026-10-01',
    });
    syncAll();
    expect(getExpense(zeynep, id).amount).toBe(7000);
    expect(listMembers(zeynep, groupId)).toHaveLength(3);
  });

  it('marks and clears conflicts like a full rebuild does', () => {
    const { zeynep, ali, groupId, ids, syncAll } = twoPhones();
    const id = createExpense(zeynep, input(groupId, ids[0], ids));
    const other = createExpense(zeynep, input(groupId, ids[0], ids, { description: 'Kira' }));
    syncAll();

    updateExpense(zeynep, id, input(groupId, ids[0], ids, { amount: 12000 }));
    softDeleteExpense(ali, id);
    syncAll();
    for (const db of [zeynep, ali]) {
      expect(getExpense(db, id).hasConflict).toBe(true);
      expect(getExpense(db, other).hasConflict).toBe(false);
    }

    const versions = getExpenseConflict(ali, id).versions;
    resolveConflict(
      ali,
      id,
      versions.findIndex((v) => !v.deletedAt),
    );
    syncAll();
    for (const db of [zeynep, ali]) {
      expect(getExpense(db, id)).toMatchObject({ hasConflict: false, amount: 12000 });
    }
  });

  it('keeps a receipt through changes to its expense and to others', () => {
    const { zeynep, ali, groupId, ids, syncAll } = twoPhones();
    const receiptPath = receiptFilesOf(zeynep).write('r', new Uint8Array([1, 2, 3]));
    const id = createExpense(zeynep, input(groupId, ids[0], ids, { receiptPath }));
    syncAll();
    const { receiptId } = getExpense(zeynep, id);
    updateExpense(ali, id, input(groupId, ids[0], ids, { amount: 100 }));
    createExpense(ali, input(groupId, ids[1], ids));
    syncAll();
    expect(getExpense(zeynep, id)).toMatchObject({ amount: 100, receiptId, receiptPath });
    expect(getExpense(ali, id)).toMatchObject({ receiptId, receiptPath: null });
  });

  it('drops the copy of a receipt the expense no longer has', () => {
    const { zeynep, ali, groupId, ids, syncAll } = twoPhones();
    const first = receiptFilesOf(zeynep).write('first', new Uint8Array([1]));
    const id = createExpense(zeynep, input(groupId, ids[0], ids, { receiptPath: first }));
    syncAll();
    const second = receiptFilesOf(ali).write('second', new Uint8Array([2]));
    updateExpense(ali, id, input(groupId, ids[0], ids, { receiptPath: second }));
    syncAll();
    // Zeynep's file was of the first photo; the expense now has Ali's.
    expect(getExpense(zeynep, id)).toMatchObject({
      receiptId: getExpense(ali, id).receiptId,
      receiptPath: null,
    });
    expect(getExpense(ali, id).receiptPath).toBe(second);

    updateExpense(zeynep, id, input(groupId, ids[0], ids, { receiptPath: null }));
    syncAll();
    for (const db of [zeynep, ali]) {
      expect(getExpense(db, id)).toMatchObject({ receiptId: null, receiptPath: null });
    }
  });
});
