import { randomUUID } from 'node:crypto';

import { Automerge } from '@ortak-kasa/core/automerge';
import {
  addMember,
  createGroupDoc,
  putExpense,
  resolveExpenseConflict,
  setExpenseDeleted,
} from '@ortak-kasa/core/groupDoc';
import { expenseConflict, readGroupDoc } from '@ortak-kasa/core/readGroupDoc';

import { createSyncServer } from '../src/server.js';
import { crypto, Device, waitFor } from './helpers.js';

let clock = Date.UTC(2026, 8, 30, 12);
const ctx = (actorMemberId) => ({ now: (clock += 1000), newId: randomUUID, actorMemberId });
const A_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const B_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

const expense = (id, overrides = {}) => ({
  id,
  description: 'Market',
  amount: 20000,
  category: 'market',
  payerId: A_ID,
  spentOn: '2026-09-30',
  splitType: 'equal',
  shares: [{ memberId: A_ID }, { memberId: B_ID }],
  ...overrides,
});

let server;
let phone;
let tablet;
let groupId;
let keys;

const view = (device) => readGroupDoc(device.doc(groupId));
const converged = () =>
  view(phone) &&
  view(tablet) &&
  JSON.stringify(Automerge.getHeads(phone.doc(groupId)).sort()) ===
    JSON.stringify(Automerge.getHeads(tablet.doc(groupId)).sort());

beforeEach(async () => {
  server = createSyncServer();
  await server.ready;
  phone = new Device('phone', server.port);
  tablet = new Device('tablet', server.port);
  await Promise.all([phone.start(), tablet.start()]);

  groupId = randomUUID();
  keys = [crypto.newGroupKey()];
  const doc = createGroupDoc(
    {
      id: groupId,
      name: 'Ev',
      type: 'home',
      currency: 'TRY',
      members: [
        { id: A_ID, name: 'Ayşe', avatarColor: '#1' },
        { id: B_ID, name: 'Berk', avatarColor: '#2' },
      ],
    },
    ctx(A_ID),
  );
  phone.track(groupId, keys, doc);
  await waitFor(() => phone.outbox(groupId).length === 0);
  // The tablet joins with the key from the invite and starts from an empty document.
  tablet.track(groupId, keys);
  await waitFor(converged);
});

afterEach(async () => {
  phone.stop();
  tablet.stop();
  await server.close();
});

describe('sync through the relay', () => {
  it('gives a joining device the whole group', () => {
    expect(view(tablet)).toEqual(view(phone));
    expect(view(tablet).members.map((m) => m.name)).toEqual(['Ayşe', 'Berk']);
  });

  it('delivers live edits both ways', async () => {
    const id = randomUUID();
    phone.edit(groupId, (doc) => putExpense(doc, expense(id), ctx(A_ID)));
    await waitFor(() => view(tablet).expenses.length === 1);
    tablet.edit(groupId, (doc) =>
      addMember(doc, { id: randomUUID(), name: 'Cem', avatarColor: '#3' }, ctx(B_ID)),
    );
    await waitFor(() => view(phone).members.length === 3);
    await waitFor(converged);
  });

  it('queues changes made offline and sends them when the device is back', async () => {
    tablet.goOffline();
    await waitFor(() => tablet.client.status.connection === 'offline');
    const onTablet = [randomUUID(), randomUUID()];
    for (const id of onTablet) {
      tablet.edit(groupId, (doc) => putExpense(doc, expense(id, { payerId: B_ID }), ctx(B_ID)));
    }
    const onPhone = randomUUID();
    phone.edit(groupId, (doc) => putExpense(doc, expense(onPhone), ctx(A_ID)));

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(tablet.outbox(groupId).length).toBeGreaterThanOrEqual(2);
    expect(view(phone).expenses.map((e) => e.id)).toEqual([onPhone]);

    await tablet.goOnline();
    await waitFor(converged);
    expect(tablet.outbox(groupId)).toEqual([]);
    for (const device of [phone, tablet]) {
      expect(
        view(device)
          .expenses.map((e) => e.id)
          .sort(),
      ).toEqual([...onTablet, onPhone].sort());
    }
  });

  it('recovers from a dropped connection without losing or duplicating changes', async () => {
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      const id = randomUUID();
      ids.push(id);
      phone.edit(groupId, (doc) => putExpense(doc, expense(id, { amount: 1000 + i }), ctx(A_ID)));
      if (i === 2) server.disconnectAll();
    }
    await waitFor(
      () => phone.client.status.connection === 'online' && phone.outbox(groupId).length === 0,
    );
    await waitFor(converged);
    expect(
      view(tablet)
        .expenses.map((e) => e.id)
        .sort(),
    ).toEqual(ids.sort());
  });

  it('turns concurrent offline edits of one expense into a conflict both devices see', async () => {
    const id = randomUUID();
    phone.edit(groupId, (doc) => putExpense(doc, expense(id), ctx(A_ID)));
    await waitFor(converged);

    tablet.goOffline();
    await waitFor(() => tablet.client.status.connection === 'offline');
    phone.edit(groupId, (doc) => putExpense(doc, expense(id, { amount: 25000 }), ctx(A_ID)));
    tablet.edit(groupId, (doc) =>
      putExpense(doc, expense(id, { description: 'Market (indirimli)' }), ctx(B_ID)),
    );
    await tablet.goOnline();
    await waitFor(converged);

    const versions = expenseConflict(phone.doc(groupId), id);
    expect(versions).toHaveLength(2);
    expect(expenseConflict(tablet.doc(groupId), id)).toEqual(versions);

    const keep = versions.find((v) => v.description === 'Market (indirimli)');
    tablet.edit(groupId, (doc) => resolveExpenseConflict(doc, id, keep, ctx(B_ID)));
    await waitFor(() => expenseConflict(phone.doc(groupId), id) === null);
    expect(view(phone).expenses[0]).toMatchObject({
      description: 'Market (indirimli)',
      amount: 20000,
    });
  });

  it('turns an offline delete against an edit into a conflict', async () => {
    const id = randomUUID();
    phone.edit(groupId, (doc) => putExpense(doc, expense(id), ctx(A_ID)));
    await waitFor(converged);

    phone.goOffline();
    await waitFor(() => phone.client.status.connection === 'offline');
    phone.edit(groupId, (doc) => setExpenseDeleted(doc, id, true, ctx(A_ID)));
    tablet.edit(groupId, (doc) => putExpense(doc, expense(id, { amount: 5000 }), ctx(B_ID)));
    await phone.goOnline();
    await waitFor(converged);

    for (const device of [phone, tablet]) {
      const versions = expenseConflict(device.doc(groupId), id);
      expect(versions.map((v) => Boolean(v.deletedAt)).sort()).toEqual([false, true]);
    }
  });

  it('refuses a device without the group key', async () => {
    const intruder = new Device('intruder', server.port);
    await intruder.start();
    intruder.track(groupId, [crypto.newGroupKey()]);
    await waitFor(() => intruder.client.status.groupErrors[groupId] === 'forbidden');
    expect(readGroupDoc(intruder.doc(groupId))).toBeNull();
    intruder.stop();
  });
});
