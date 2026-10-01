import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { toBase64 } from '@ortak-kasa/core/sync/base64';

import { createSyncServer } from '../src/server.js';
import { openStore } from '../src/store.js';
import { rawClient } from './helpers.js';

const token = () => randomBytes(32).toString('base64url');
const blob = (size = 64) => toBase64(new Uint8Array(randomBytes(size)));

let server;
beforeEach(async () => {
  server = createSyncServer();
  await server.ready;
});
afterEach(() => server.close());

async function subscribed(group, secret, since = 0) {
  const client = await rawClient(server.port);
  client.send({ t: 'sub', group, token: secret, since });
  await client.next((m) => ['sub_ok', 'rekeyed', 'error'].includes(m.t));
  return client;
}

describe('relay', () => {
  it('stores opaque bytes and hands them to other devices unchanged', async () => {
    const group = randomUUID();
    const secret = token();
    const alice = await subscribed(group, secret);
    const bob = await subscribed(group, secret);
    // Random bytes: the relay must not need to understand what it carries.
    const payload = blob(300);
    alice.send({ t: 'push', group, items: [{ id: 'c1', data: payload }] });

    const ack = await alice.next((m) => m.t === 'ack');
    expect(ack).toEqual({ t: 'ack', group, ids: ['c1'], seq: 1 });
    const delivered = await bob.next((m) => m.t === 'changes');
    expect(delivered.items).toEqual([{ seq: 1, data: payload }]);
    expect(alice.received.some((m) => m.t === 'changes')).toBe(false);
  });

  it('stores a repeated push once', async () => {
    const group = randomUUID();
    const alice = await subscribed(group, token());
    const payload = blob();
    alice.send({ t: 'push', group, items: [{ id: 'a', data: payload }] });
    await alice.next((m) => m.t === 'ack' && m.ids[0] === 'a');
    alice.send({ t: 'push', group, items: [{ id: 'a-retry', data: payload }] });
    const ack = await alice.next((m) => m.t === 'ack' && m.ids[0] === 'a-retry');
    expect(ack.seq).toBe(1);
  });

  it('sends what a device missed, from its cursor, before confirming the subscription', async () => {
    const group = randomUUID();
    const secret = token();
    const alice = await subscribed(group, secret);
    const payloads = Array.from({ length: 450 }, () => blob(16));
    alice.send({ t: 'push', group, items: payloads.map((data, i) => ({ id: `c${i}`, data })) });
    await alice.next((m) => m.t === 'ack');

    const late = await subscribed(group, secret, 100);
    const pages = late.received.filter((m) => m.t === 'changes');
    expect(pages.map((p) => p.items.length)).toEqual([200, 150]);
    const seqs = pages.flatMap((p) => p.items.map((i) => i.seq));
    expect(seqs[0]).toBe(101);
    expect(seqs.at(-1)).toBe(450);
    expect(pages.flatMap((p) => p.items.map((i) => i.data))).toEqual(payloads.slice(100));
    const order = late.received.map((m) => m.t);
    expect(order.indexOf('sub_ok')).toBeGreaterThan(order.lastIndexOf('changes'));
  });

  it('keeps a group closed to anyone without its token', async () => {
    const group = randomUUID();
    const alice = await subscribed(group, token());
    alice.send({ t: 'push', group, items: [{ id: 'x', data: blob() }] });
    await alice.next((m) => m.t === 'ack');

    const mallory = await subscribed(group, token());
    expect(mallory.received).toContainEqual({ t: 'error', code: 'forbidden', group });
    expect(mallory.received.some((m) => m.t === 'changes')).toBe(false);
    mallory.send({ t: 'push', group, items: [{ id: 'y', data: blob() }] });
    expect(await mallory.next((m) => m.code === 'notSubscribed')).toBeTruthy();
  });

  it('rejects anything outside the protocol', async () => {
    const stranger = await rawClient(server.port, { hello: false });
    stranger.send({ t: 'sub', group: randomUUID(), token: token(), since: 0 });
    expect(await stranger.next((m) => m.code === 'badRequest')).toBeTruthy();

    const client = await rawClient(server.port);
    for (const bad of [
      'not json',
      { t: 'push', group: 'not-a-uuid', items: [{ id: 'a', data: blob() }] },
      { t: 'sub', group: randomUUID(), token: 'short', since: 0 },
      { t: 'push', group: randomUUID(), items: [{ id: 'a', data: '***' }] },
    ]) {
      client.send(bad);
    }
    client.sendBinary(new Uint8Array([1, 2, 3]));
    await client.next(() => client.received.filter((m) => m.code === 'badRequest').length === 5);
  });
});

describe('key rotation', () => {
  it('moves the group to the new token and hands the envelopes to everyone else', async () => {
    const group = randomUUID();
    const [oldToken, newToken] = [token(), token()];
    const alice = await subscribed(group, oldToken);
    const bob = await subscribed(group, oldToken);
    const envelopes = [blob(80), blob(80)];

    alice.send({ t: 'rekey', group, next: newToken, envelopes });
    expect(await alice.next((m) => m.t === 'rekey_ok')).toEqual({ t: 'rekey_ok', group });
    expect(await bob.next((m) => m.t === 'rekeyed')).toEqual({ t: 'rekeyed', group, envelopes });

    // Bob is off the group until he comes back with the new token.
    alice.send({ t: 'push', group, items: [{ id: 'after', data: blob() }] });
    await alice.next((m) => m.t === 'ack');
    bob.send({ t: 'push', group, items: [{ id: 'late', data: blob() }] });
    expect(await bob.next((m) => m.code === 'notSubscribed')).toBeTruthy();
    expect(bob.received.some((m) => m.t === 'changes')).toBe(false);

    bob.send({ t: 'sub', group, token: newToken, since: 0 });
    const page = await bob.next((m) => m.t === 'changes');
    expect(page.items.map((i) => i.seq)).toEqual([1]);
  });

  it('answers the old token with the envelopes, and chains through rotations', async () => {
    const group = randomUUID();
    const tokens = [token(), token(), token()];
    const alice = await subscribed(group, tokens[0]);
    alice.send({ t: 'rekey', group, next: tokens[1], envelopes: [blob()] });
    await alice.next((m) => m.t === 'rekey_ok');
    alice.send({ t: 'rekey', group, next: tokens[2], envelopes: [blob(), blob()] });
    await alice.next(() => alice.received.filter((m) => m.t === 'rekey_ok').length === 2);

    const offline = await subscribed(group, tokens[0]);
    expect(offline.received.at(-1)).toMatchObject({ t: 'rekeyed', group });
    expect(offline.received.at(-1).envelopes).toHaveLength(1);
    const later = await subscribed(group, tokens[1]);
    expect(later.received.at(-1).envelopes).toHaveLength(2);
    const current = await subscribed(group, tokens[2]);
    expect(current.received.at(-1)).toMatchObject({ t: 'sub_ok', group });
    const stranger = await subscribed(group, token());
    expect(stranger.received.at(-1)).toEqual({ t: 'error', code: 'forbidden', group });
  });

  it('only accepts a rotation from a subscribed device', async () => {
    const group = randomUUID();
    const secret = token();
    await subscribed(group, secret);
    const other = await rawClient(server.port);
    other.send({ t: 'rekey', group, next: token(), envelopes: [] });
    expect(await other.next((m) => m.code === 'notSubscribed')).toBeTruthy();
    const again = await subscribed(group, secret);
    expect(again.received.at(-1)).toMatchObject({ t: 'sub_ok' });
  });
});

describe('vaults', () => {
  it('store a backup per revision and refuse a stale one', async () => {
    const vault = randomUUID();
    const secret = token();
    const client = await rawClient(server.port);

    client.send({ t: 'vault_get', vault, token: secret });
    expect(await client.next((m) => m.t === 'vault')).toEqual({
      t: 'vault',
      vault,
      rev: 0,
      data: null,
    });

    const first = blob(120);
    client.send({ t: 'vault_put', vault, token: secret, rev: 0, data: first });
    expect(await client.next((m) => m.t === 'vault_ok')).toEqual({ t: 'vault_ok', vault, rev: 1 });

    // A second device that has not seen revision 1 gets it back instead of overwriting it.
    const other = await rawClient(server.port);
    other.send({ t: 'vault_put', vault, token: secret, rev: 0, data: blob(120) });
    expect(await other.next((m) => m.t === 'vault')).toEqual({
      t: 'vault',
      vault,
      rev: 1,
      data: first,
    });

    const second = blob(120);
    other.send({ t: 'vault_put', vault, token: secret, rev: 1, data: second });
    expect(await other.next((m) => m.t === 'vault_ok')).toMatchObject({ rev: 2 });
    client.send({ t: 'vault_get', vault, token: secret });
    await client.next((m) => m.t === 'vault' && m.rev === 2);
    expect(client.received.at(-1).data).toBe(second);
  });

  it('stay closed to anyone without the token', async () => {
    const vault = randomUUID();
    const client = await rawClient(server.port);
    client.send({ t: 'vault_put', vault, token: token(), rev: 0, data: blob() });
    await client.next((m) => m.t === 'vault_ok');
    const mallory = await rawClient(server.port);
    mallory.send({ t: 'vault_get', vault, token: token() });
    expect(await mallory.next((m) => m.t === 'error')).toEqual({
      t: 'error',
      code: 'forbidden',
      vault,
    });
    mallory.send({ t: 'vault_put', vault, token: token(), rev: 1, data: blob() });
    await mallory.next(() => mallory.received.filter((m) => m.code === 'forbidden').length === 2);
  });
});

describe('store', () => {
  it('keeps changes across restarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-'));
    try {
      const path = join(dir, 'relay.db');
      const group = randomUUID();
      const first = openStore(path);
      first.authorize(group, 'secret-token');
      first.append(group, [Buffer.from([1, 2, 3])]);
      first.close();

      const second = openStore(path);
      expect(second.authorize(group, 'secret-token')).toEqual({ status: 'ok' });
      expect(second.authorize(group, 'other-token')).toEqual({ status: 'forbidden' });
      const [row] = second.since(group, 0, 10);
      expect(row.seq).toBe(1);
      expect([...row.data]).toEqual([1, 2, 3]);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
