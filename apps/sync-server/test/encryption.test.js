import { randomUUID } from 'node:crypto';

import { Automerge } from '@ortak-kasa/core/automerge';
import { fromBase64 } from '@ortak-kasa/core/sync/base64';
import { createGroupDoc, putExpense, removeMember } from '@ortak-kasa/core/groupDoc';

import { createSyncServer } from '../src/server.js';
import { crypto, Device, rawClient, waitFor } from './helpers.js';

let clock = Date.UTC(2026, 8, 30, 12);
const ctx = (actorMemberId) => ({ now: (clock += 1000), newId: randomUUID, actorMemberId });
const AYSE = 'aaaaaaaa-0000-4000-8000-000000000001';
const BERK = 'bbbbbbbb-0000-4000-8000-000000000002';
const CEM = 'cccccccc-0000-4000-8000-000000000003';

const expense = (description, payerId = AYSE) => ({
  id: randomUUID(),
  description,
  amount: 20000,
  category: 'market',
  payerId,
  spentOn: '2026-09-30',
  splitType: 'equal',
  shares: [{ memberId: AYSE }, { memberId: BERK }],
});

let server;
let devices;
let groupId;

const heads = (device) => JSON.stringify(Automerge.getHeads(device.doc(groupId)).sort());
const converged = (...list) => list.every((d) => d.view(groupId) && heads(d) === heads(list[0]));
const hasExpense = (device, description) =>
  device.view(groupId)?.expenses.some((e) => e.description === description);

// Ayşe (phone), Berk (tablet) and Cem (laptop) share a group, each with their identity on
// their member.
beforeEach(async () => {
  server = createSyncServer();
  await server.ready;
  const [phone, tablet, laptop] = ['phone', 'tablet', 'laptop'].map(
    (name) => new Device(name, server.port),
  );
  devices = { phone, tablet, laptop };
  await Promise.all(Object.values(devices).map((d) => d.start()));

  groupId = randomUUID();
  const keys = [crypto.newGroupKey()];
  const doc = createGroupDoc(
    {
      id: groupId,
      name: 'Ev',
      type: 'home',
      currency: 'TRY',
      members: [
        { id: AYSE, name: 'Ayşe', avatarColor: '#1' },
        { id: BERK, name: 'Berk', avatarColor: '#2' },
        { id: CEM, name: 'Cem', avatarColor: '#3' },
      ],
    },
    ctx(AYSE),
  );
  phone.track(groupId, keys, doc);
  phone.claim(groupId, AYSE, ctx(AYSE));
  await waitFor(() => phone.outbox(groupId).length === 0);
  tablet.track(groupId, keys);
  laptop.track(groupId, keys);
  await waitFor(() => tablet.view(groupId) && laptop.view(groupId));
  tablet.claim(groupId, BERK, ctx(BERK));
  laptop.claim(groupId, CEM, ctx(CEM));
  await waitFor(() => converged(phone, tablet, laptop));
});

afterEach(async () => {
  Object.values(devices).forEach((d) => d.stop());
  await server.close();
});

describe('end-to-end encryption', () => {
  it('never lets the relay see group data', async () => {
    const { phone, tablet } = devices;
    phone.edit(groupId, (doc) => putExpense(doc, expense('Kira Moda'), ctx(AYSE)));
    await waitFor(() => hasExpense(tablet, 'Kira Moda'));

    // Read the log the way anyone with relay access would.
    const spy = await rawClient(server.port);
    spy.send({ t: 'sub', group: groupId, token: phone.groups()[0].token, since: 0 });
    await spy.next((m) => m.t === 'sub_ok');
    const stored = spy.received
      .filter((m) => m.t === 'changes')
      .flatMap((m) => m.items.map((i) => Buffer.from(fromBase64(i.data)).toString('latin1')));
    expect(stored.length).toBeGreaterThan(0);
    for (const secret of ['Kira Moda', 'Ayşe', 'Ev', 'market', AYSE]) {
      expect(stored.some((blob) => blob.includes(secret))).toBe(false);
    }
    // Automerge's own format would start with its magic bytes.
    expect(stored.some((blob) => blob.startsWith('\x85\x6f\x4a\x83'))).toBe(false);
  });

  it('replaces the key when a member is removed, so they read nothing written after', async () => {
    const { phone, tablet, laptop } = devices;
    phone.edit(groupId, (doc) => putExpense(doc, expense('Before'), ctx(AYSE)));
    await waitFor(() => hasExpense(laptop, 'Before'));

    phone.removeMember(groupId, (doc) => removeMember(doc, CEM, ctx(AYSE)));
    await waitFor(() => laptop.client.status.groupErrors[groupId] === 'removed');
    await waitFor(() => tablet.keysOf(groupId).length === 2);
    expect(phone.keysOf(groupId)).toEqual(tablet.keysOf(groupId));
    expect(laptop.keysOf(groupId)).toHaveLength(1);

    phone.edit(groupId, (doc) => putExpense(doc, expense('After'), ctx(AYSE)));
    tablet.edit(groupId, (doc) => putExpense(doc, expense('Also after', BERK), ctx(BERK)));
    await waitFor(() => hasExpense(tablet, 'After') && hasExpense(phone, 'Also after'));
    await waitFor(() => converged(phone, tablet));
    expect(tablet.view(groupId).members.find((m) => m.id === CEM).deletedAt).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(hasExpense(laptop, 'After')).toBe(false);
    expect(hasExpense(laptop, 'Also after')).toBe(false);
    // Even the removal itself was sealed with the new key.
    expect(laptop.view(groupId).members.find((m) => m.id === CEM).deletedAt).toBeNull();

    // The laptop's token no longer opens the group, and trying again changes nothing.
    laptop.client.stop();
    laptop.meta.get(groupId).removed = false;
    await laptop.start();
    await waitFor(() => laptop.client.status.groupErrors[groupId] === 'removed');
    expect(laptop.errors).toEqual([]);
  });

  it('lets a device that was offline catch up through several rotations', async () => {
    const { phone, tablet, laptop } = devices;
    tablet.goOffline();
    await waitFor(() => tablet.client.status.connection === 'offline');
    tablet.edit(groupId, (doc) => putExpense(doc, expense('Offline', BERK), ctx(BERK)));

    phone.removeMember(groupId, (doc) => removeMember(doc, CEM, ctx(AYSE)));
    await waitFor(() => phone.keysOf(groupId).length === 2);
    // A second rotation while the tablet is still away.
    phone.rekeyDue.add(groupId);
    phone.client.kick();
    await waitFor(() => phone.keysOf(groupId).length === 3);
    phone.edit(groupId, (doc) => putExpense(doc, expense('Epoch 3'), ctx(AYSE)));

    await tablet.goOnline();
    await waitFor(() => tablet.keysOf(groupId).length === 3);
    await waitFor(() => hasExpense(tablet, 'Epoch 3') && hasExpense(phone, 'Offline'));
    await waitFor(() => converged(phone, tablet));
    expect(tablet.keysOf(groupId)).toEqual(phone.keysOf(groupId));
    expect(hasExpense(laptop, 'Offline')).toBe(false);
    expect(tablet.errors).toEqual([]);
  });

  it('settles two rotations started at the same time on one key', async () => {
    const { phone, tablet } = devices;
    phone.removeMember(groupId, (doc) => removeMember(doc, CEM, ctx(AYSE)));
    tablet.rekeyDue.add(groupId);
    tablet.client.kick();
    await waitFor(() => !phone.rekeyDue.size && !tablet.rekeyDue.size);
    await waitFor(
      () =>
        phone.keysOf(groupId).length === tablet.keysOf(groupId).length &&
        phone.keysOf(groupId).length >= 2,
    );
    expect(tablet.keysOf(groupId)).toEqual(phone.keysOf(groupId));

    tablet.edit(groupId, (doc) => putExpense(doc, expense('Settled', BERK), ctx(BERK)));
    await waitFor(() => hasExpense(phone, 'Settled'));
  });
});
