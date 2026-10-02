import { MAX_FILE_PLAIN_BYTES } from '@ortak-kasa/core/sync/protocol';

import {
  claimMembership,
  countPendingReceipts,
  createExpense,
  createGroup,
  createInvite,
  deleteAllData,
  getExpense,
  joinGroupByInvite,
  listMembers,
  receiptToFetch,
  saveFetchedReceipt,
  saveProfile,
  updateExpense,
} from '../repositories';
import { createRelay } from '../testing/createRelay';
import { createTestDb } from '../testing/createTestDb';

// A receipt photo is a file on the phone that took it. Its expense carries the photo's id; the
// file itself goes to the relay sealed and is fetched by the other phones when they need it.

// Stands in for a JPEG: bytes the relay must never be able to read.
const photo = (label = 'market') =>
  new TextEncoder().encode(`JFIF receipt of the ${label} ${'x'.repeat(500)}`);
const text = (bytes) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

function phone(name) {
  const { db, receiptFiles } = createTestDb();
  saveProfile(db, { name, avatarColor: '#111', defaultCurrency: 'TRY' });
  return { db, files: receiptFiles };
}

function twoPhones() {
  const relay = createRelay();
  const zeynep = phone('Zeynep');
  const ali = phone('Ali');
  const groupId = createGroup(zeynep.db, { name: 'Ev', type: 'home', currency: 'TRY' });
  relay.sync(zeynep.db);
  joinGroupByInvite(ali.db, createInvite(zeynep.db, groupId));
  relay.sync(ali.db);
  claimMembership(ali.db, groupId, null);
  relay.sync(ali.db);
  relay.sync(zeynep.db);
  const ids = listMembers(zeynep.db, groupId).map((m) => m.id);
  const input = (overrides = {}) => ({
    groupId,
    description: 'Market',
    amount: 9000,
    category: 'market',
    payerId: ids[0],
    spentOn: '2026-09-30',
    splitType: 'equal',
    shares: ids.map((memberId) => ({ memberId })),
    ...overrides,
  });
  const syncAll = () => [zeynep, ali, zeynep].forEach((p) => relay.sync(p.db));
  const stored = () => relay.groups.get(groupId).files;
  // What the expense screen does on a phone without the photo.
  const fetch = (p, expenseId) => {
    const target = receiptToFetch(p.db, expenseId);
    const sealed = relay.fetchFile(p.db, target.groupId, target.receiptId);
    return sealed && saveFetchedReceipt(p.db, expenseId, target, sealed);
  };
  return { relay, zeynep, ali, groupId, input, syncAll, stored, fetch };
}

describe('receipt photos', () => {
  it('reach the relay sealed and the other phone on request', () => {
    const { zeynep, ali, input, syncAll, stored, fetch } = twoPhones();
    const receiptPath = zeynep.files.write('taken', photo());
    const id = createExpense(zeynep.db, input({ receiptPath }));
    expect(countPendingReceipts(zeynep.db)).toBe(1);
    syncAll();
    expect(countPendingReceipts(zeynep.db)).toBe(0);

    const { receiptId } = getExpense(zeynep.db, id);
    expect(receiptId).toEqual(expect.any(String));
    expect([...stored().keys()]).toEqual([receiptId]);
    expect(text(stored().get(receiptId))).not.toContain('JFIF');
    expect(text(stored().get(receiptId))).not.toContain('receipt of the market');

    // Ali knows the expense has a receipt, but has no file until he asks for it.
    expect(getExpense(ali.db, id)).toMatchObject({ receiptId, receiptPath: null });
    expect(ali.files.files.size).toBe(0);
    const path = fetch(ali, id);
    expect(getExpense(ali.db, id).receiptPath).toBe(path);
    expect(ali.files.read(path)).toEqual(photo());
    // Nothing left to fetch, on either phone.
    expect(receiptToFetch(ali.db, id)).toBeNull();
    expect(receiptToFetch(zeynep.db, id)).toBeNull();
  });

  it('are not there to fetch until the phone that took them has been online', () => {
    const { relay, zeynep, ali, input, fetch } = twoPhones();
    const receiptPath = zeynep.files.write('taken', photo());
    const id = createExpense(zeynep.db, input({ receiptPath }));
    // The change arrives but the file does not: Zeynep's phone sends its changes, then drops.
    const store = relay.groups.get(input().groupId);
    relay.sync(zeynep.db);
    store.files.clear();
    relay.sync(ali.db);
    expect(fetch(ali, id)).toBeNull();
    expect(getExpense(ali.db, id).receiptPath).toBeNull();
  });

  it('keep their file through edits of the expense, by either phone', () => {
    const { zeynep, ali, input, syncAll, stored } = twoPhones();
    const receiptPath = zeynep.files.write('taken', photo());
    const id = createExpense(zeynep.db, input({ receiptPath }));
    syncAll();
    const { receiptId } = getExpense(zeynep.db, id);

    // Ali has not fetched the photo; his edit leaves the receipt alone.
    updateExpense(ali.db, id, input({ amount: 100 }));
    // Zeynep's form sends the same photo again.
    syncAll();
    updateExpense(zeynep.db, id, input({ amount: 200, receiptPath }));
    syncAll();

    for (const p of [zeynep, ali]) expect(getExpense(p.db, id).receiptId).toBe(receiptId);
    expect(getExpense(zeynep.db, id)).toMatchObject({ amount: 200, receiptPath });
    expect(stored().size).toBe(1);
    expect(countPendingReceipts(zeynep.db) + countPendingReceipts(ali.db)).toBe(0);
  });

  it('are sent as a new file when the photo is replaced', () => {
    const { zeynep, ali, input, syncAll, stored, fetch } = twoPhones();
    const id = createExpense(
      zeynep.db,
      input({ receiptPath: zeynep.files.write('first', photo('first')) }),
    );
    syncAll();
    fetch(ali, id);
    const first = getExpense(zeynep.db, id).receiptId;

    updateExpense(
      zeynep.db,
      id,
      input({ receiptPath: zeynep.files.write('second', photo('second')) }),
    );
    syncAll();
    const second = getExpense(zeynep.db, id).receiptId;
    expect(second).not.toBe(first);
    expect([...stored().keys()].sort()).toEqual([first, second].sort());
    // Ali's copy was of the first photo; he fetches the second.
    expect(getExpense(ali.db, id)).toMatchObject({ receiptId: second, receiptPath: null });
    expect(ali.files.read(fetch(ali, id))).toEqual(photo('second'));
  });

  it('are never sent when replaced or removed before the phone was online', () => {
    const { zeynep, input, syncAll, stored } = twoPhones();
    const id = createExpense(
      zeynep.db,
      input({ receiptPath: zeynep.files.write('first', photo('first')) }),
    );
    updateExpense(
      zeynep.db,
      id,
      input({ receiptPath: zeynep.files.write('second', photo('second')) }),
    );
    const other = createExpense(
      zeynep.db,
      input({ receiptPath: zeynep.files.write('third', photo('third')) }),
    );
    updateExpense(zeynep.db, other, input({ receiptPath: null }));
    expect(countPendingReceipts(zeynep.db)).toBe(1);
    syncAll();
    expect([...stored().keys()]).toEqual([getExpense(zeynep.db, id).receiptId]);
    expect(getExpense(zeynep.db, other)).toMatchObject({ receiptId: null, receiptPath: null });
  });

  it('stay on the phone when the file is gone or too large to send', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { zeynep, ali, input, syncAll, stored } = twoPhones();
    const gone = createExpense(zeynep.db, input({ receiptPath: 'memory://receipts/gone.jpg' }));
    const huge = createExpense(
      zeynep.db,
      input({
        receiptPath: zeynep.files.write('huge', new Uint8Array(MAX_FILE_PLAIN_BYTES + 1)),
      }),
    );
    syncAll();
    expect(stored().size).toBe(0);
    expect(countPendingReceipts(zeynep.db)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
    // The expenses themselves are synced as usual.
    for (const id of [gone, huge]) expect(getExpense(ali.db, id).amount).toBe(9000);
    warn.mockRestore();
  });

  it('do not open if the relay hands back something else', () => {
    const { zeynep, ali, input, syncAll, stored } = twoPhones();
    const one = createExpense(
      zeynep.db,
      input({ receiptPath: zeynep.files.write('one', photo('one')) }),
    );
    const two = createExpense(
      zeynep.db,
      input({ receiptPath: zeynep.files.write('two', photo('two')) }),
    );
    syncAll();
    const target = receiptToFetch(ali.db, one);
    const corrupt = expect.objectContaining({ code: 'corrupt' });

    // Another receipt of the same group under this one's id.
    const swapped = stored().get(getExpense(ali.db, two).receiptId);
    expect(() => saveFetchedReceipt(ali.db, one, target, swapped)).toThrow(corrupt);
    const tampered = stored().get(target.receiptId).slice();
    tampered[tampered.length - 1] ^= 1;
    expect(() => saveFetchedReceipt(ali.db, one, target, tampered)).toThrow(corrupt);
    expect(getExpense(ali.db, one).receiptPath).toBeNull();
    expect(ali.files.files.size).toBe(0);
  });

  it('leave nothing waiting after the data is deleted', () => {
    const { zeynep, input } = twoPhones();
    createExpense(zeynep.db, input({ receiptPath: zeynep.files.write('taken', photo()) }));
    deleteAllData(zeynep.db);
    expect(countPendingReceipts(zeynep.db)).toBe(0);
  });
});
