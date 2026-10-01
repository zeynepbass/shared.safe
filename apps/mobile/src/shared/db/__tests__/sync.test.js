import { eq, sql } from 'drizzle-orm';

import {
  claimMembership,
  countPendingChanges,
  createExpense,
  createGroup,
  createInvite,
  getExpense,
  getExpenseConflict,
  joinGroupByInvite,
  listGroupSummaries,
  listMembers,
  listPendingJoins,
  resolveConflict,
  saveProfile,
  softDeleteExpense,
  updateExpense,
} from '../repositories';
import { groups, members, syncGroups } from '../schema';
import { bootstrapSync } from '../sync/bootstrap';
import { forgetGroupDocs } from '../sync/groupDocs';
import { groupKeys } from '../security/keys';
import { parseInvite } from '../sync/invite';
import { createRelay } from '../testing/createRelay';
import { createTestDb } from '../testing/createTestDb';

function phone(name) {
  const { db } = createTestDb();
  saveProfile(db, { name, avatarColor: '#111', defaultCurrency: 'TRY' });
  return db;
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
  return { relay, zeynep, ali, groupId, ids };
}

describe('invites', () => {
  it('carry the group key through the link and reject anything else', () => {
    const { db } = createTestDb();
    saveProfile(db, { name: 'Z', avatarColor: '#1' });
    const groupId = createGroup(db, { name: 'Ev', type: 'home', currency: 'TRY' });
    const link = createInvite(db, groupId);
    expect(parseInvite(`Gel: ${link} 👋`)).toEqual({ groupId, keys: groupKeys(db, groupId) });
    expect(parseInvite('ortakkasa://join?g=nope&k=short')).toBeNull();
    expect(parseInvite(`ortakkasa://join?g=${groupId}&k=short`)).toBeNull();
    expect(parseInvite(`ortakkasa://join?g=${groupId}`)).toBeNull();
    expect(() => joinGroupByInvite(db, 'hello')).toThrow(
      expect.objectContaining({ code: 'invalidInvite' }),
    );
  });
});

describe('joining a group', () => {
  it('waits for the data, then lets the user pick who they are', () => {
    const relay = createRelay();
    const zeynep = phone('Zeynep');
    const groupId = createGroup(zeynep, {
      name: 'Ev',
      type: 'home',
      currency: 'TRY',
      members: [{ name: 'Ali', avatarColor: '#2' }],
    });
    relay.sync(zeynep);

    const ali = phone('Ali');
    joinGroupByInvite(ali, createInvite(zeynep, groupId));
    expect(listPendingJoins(ali)).toEqual([{ groupId, name: null, ready: false, expired: false }]);

    relay.sync(ali);
    expect(listPendingJoins(ali)).toEqual([{ groupId, name: 'Ev', ready: true, expired: false }]);
    const existing = listMembers(ali, groupId).find((m) => m.name === 'Ali');
    claimMembership(ali, groupId, existing.id);

    expect(listPendingJoins(ali)).toEqual([]);
    expect(listMembers(ali, groupId).find((m) => m.isLocalUser).id).toBe(existing.id);
    // Zeynep is still "me" only on her own phone.
    expect(listMembers(zeynep, groupId).find((m) => m.isLocalUser).name).toBe('Zeynep');
  });

  it('can join as a new member named after the profile', () => {
    const { zeynep, ali, groupId } = twoPhones();
    expect(listMembers(zeynep, groupId).map((m) => m.name)).toEqual(['Zeynep', 'Ali']);
    expect(listMembers(ali, groupId).find((m) => m.isLocalUser).name).toBe('Ali');
  });
});

describe('offline edits on two phones', () => {
  it('queue locally and merge when both sync', () => {
    const { relay, zeynep, ali, groupId, ids } = twoPhones();
    const [z, a] = ids;
    createExpense(zeynep, input(groupId, z, ids));
    createExpense(ali, input(groupId, a, ids, { amount: 4000, description: 'Ekmek' }));
    expect(countPendingChanges(zeynep, groupId)).toBeGreaterThan(0);
    expect(countPendingChanges(ali, groupId)).toBeGreaterThan(0);

    relay.sync(zeynep);
    relay.sync(ali);
    relay.sync(zeynep);

    for (const db of [zeynep, ali]) {
      expect(countPendingChanges(db, groupId)).toBe(0);
      const [summary] = listGroupSummaries(db);
      expect(summary.memberCount).toBe(2);
    }
    const onZeynep = listGroupSummaries(zeynep)[0].selfBalance;
    const onAli = listGroupSummaries(ali)[0].selfBalance;
    expect(onZeynep).toBe(4500 - 2000);
    expect(onAli).toBe(-onZeynep);
  });
});

describe('conflicts', () => {
  function conflicting(edit) {
    const t = twoPhones();
    const [z] = t.ids;
    const id = createExpense(t.zeynep, input(t.groupId, z, t.ids));
    t.relay.sync(t.zeynep);
    t.relay.sync(t.ali);
    edit(t, id);
    t.relay.sync(t.zeynep);
    t.relay.sync(t.ali);
    t.relay.sync(t.zeynep);
    return { ...t, id };
  }

  it('marks an expense edited on both phones and offers both versions', () => {
    const { zeynep, ali, id } = conflicting((t, expenseId) => {
      updateExpense(t.zeynep, expenseId, input(t.groupId, t.ids[0], t.ids, { amount: 12000 }));
      updateExpense(t.ali, expenseId, input(t.groupId, t.ids[1], t.ids));
    });
    for (const db of [zeynep, ali]) {
      expect(getExpense(db, id).hasConflict).toBe(true);
      expect(getExpenseConflict(db, id).versions).toHaveLength(2);
    }
    expect(getExpenseConflict(ali, id)).toEqual(getExpenseConflict(zeynep, id));
  });

  it('clears everywhere once resolved on one phone', () => {
    const { relay, zeynep, ali, id } = conflicting((t, expenseId) => {
      updateExpense(t.zeynep, expenseId, input(t.groupId, t.ids[0], t.ids, { amount: 12000 }));
      softDeleteExpense(t.ali, expenseId);
    });
    const versions = getExpenseConflict(ali, id).versions;
    const edited = versions.findIndex((v) => !v.deletedAt);
    resolveConflict(ali, id, edited);
    relay.sync(ali);
    relay.sync(zeynep);
    for (const db of [zeynep, ali]) {
      const expense = getExpense(db, id);
      expect(expense).toMatchObject({ hasConflict: false, amount: 12000, deletedAt: null });
      expect(getExpenseConflict(db, id)).toBeNull();
    }
  });
});

describe('local data kept out of sync', () => {
  it('keeps receipt photos on the phone that took them', () => {
    const { relay, zeynep, ali, groupId, ids } = twoPhones();
    const id = createExpense(zeynep, input(groupId, ids[0], ids, { receiptPath: 'file:///r.jpg' }));
    relay.sync(zeynep);
    relay.sync(ali);
    createExpense(ali, input(groupId, ids[1], ids));
    relay.sync(ali);
    relay.sync(zeynep);
    expect(getExpense(zeynep, id).receiptPath).toBe('file:///r.jpg');
    expect(getExpense(ali, id).receiptPath).toBeNull();
  });

  it('renames "me" in every group when the profile changes', () => {
    const { relay, zeynep, ali, groupId } = twoPhones();
    saveProfile(ali, { name: 'Ali Veli', avatarColor: '#999', avatarPath: 'file:///me.jpg' });
    relay.sync(ali);
    relay.sync(zeynep);
    const onZeynep = listMembers(zeynep, groupId).find((m) => m.name === 'Ali Veli');
    expect(onZeynep).toMatchObject({ avatarColor: '#999', avatarPath: null });
    expect(listMembers(ali, groupId).find((m) => m.isLocalUser).avatarPath).toBe('file:///me.jpg');
  });
});

describe('groups made before sync', () => {
  it('become documents with their ids and history, and start syncing', () => {
    const { db } = createTestDb();
    saveProfile(db, { name: 'Zeynep', avatarColor: '#1' });
    const groupId = createGroup(db, { name: 'Ev', type: 'home', currency: 'TRY' });
    const memberIds = listMembers(db, groupId).map((m) => m.id);
    const expenseId = createExpense(db, input(groupId, memberIds[0], memberIds));
    // Simulate a database from before sync: read tables only.
    db.delete(syncGroups).run();
    db.run(sql`DELETE FROM group_docs`);
    db.run(sql`DELETE FROM group_doc_changes`);
    db.run(sql`DELETE FROM sync_outbox`);
    forgetGroupDocs(db);

    bootstrapSync(db);
    const sync = db.select().from(syncGroups).where(eq(syncGroups.groupId, groupId)).get();
    expect(sync.localMemberId).toBe(memberIds[0]);
    expect(countPendingChanges(db, groupId)).toBeGreaterThan(0);
    expect(getExpense(db, expenseId).amount).toBe(9000);
    expect(db.select().from(groups).all()).toHaveLength(1);
    expect(db.select().from(members).all()).toHaveLength(1);

    bootstrapSync(db);
    expect(db.select().from(syncGroups).all()).toHaveLength(1);
  });
});
