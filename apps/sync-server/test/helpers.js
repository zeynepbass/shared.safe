import { Automerge } from '@ortak-kasa/core/automerge';
import { createCrypto, toBase64Url } from '@ortak-kasa/core/crypto';
import { setMemberKey } from '@ortak-kasa/core/groupDoc';
import { keyRecipients, readGroupDoc } from '@ortak-kasa/core/readGroupDoc';
import { SyncClient } from '@ortak-kasa/core/sync/client';
import sodium from 'libsodium-wrappers-sumo';
import { encodeMessage, PROTOCOL_VERSION } from '@ortak-kasa/core/sync/protocol';
import WebSocket from 'ws';

export async function waitFor(check, { timeout = 3000, interval = 10 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// A bare protocol client for testing the relay itself.
export async function rawClient(port, { hello = true } = {}) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const received = [];
  socket.on('message', (data) => received.push(JSON.parse(data.toString())));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const client = {
    received,
    send: (message) => socket.send(typeof message === 'string' ? message : encodeMessage(message)),
    sendBinary: (bytes) => socket.send(bytes),
    next: (predicate) => waitFor(() => received.find(predicate)),
    close: () => socket.close(),
  };
  if (hello) {
    client.send({ t: 'hello', v: PROTOCOL_VERSION, device: 'raw' });
    await client.next((m) => m.t === 'welcome');
  }
  return client;
}

await sodium.ready;
export const crypto = createCrypto(sodium);

const hashOf = (change) => Automerge.decodeChange(change).hash;

// A device as the app sees it: Automerge documents, keyrings and an outbox, synced through the
// real SyncClient with everything sealed before it leaves. Reads use the canonical view, like
// the app.
export class Device {
  docs = new Map();
  meta = new Map();
  pending = [];
  errors = [];
  rekeyDue = new Set();

  constructor(name, port) {
    this.name = name;
    this.identity = crypto.identityFromSecret(sodium.randombytes_buf(16));
    this.client = new SyncClient({
      url: `ws://127.0.0.1:${port}`,
      deviceId: name,
      store: this,
      WebSocket,
      retry: { min: 10, max: 50 },
      onError: (error) => this.errors.push(error),
    });
  }

  get publicKey() {
    return toBase64Url(this.identity.publicKey);
  }

  // SyncClient store interface
  groups() {
    return [...this.meta]
      .filter(([, m]) => !m.removed)
      .map(([groupId, m]) => ({ groupId, token: m.token, cursor: m.cursor }));
  }

  outbox(groupId) {
    const { keys } = this.meta.get(groupId);
    return this.pending
      .filter((p) => p.groupId === groupId)
      .map((p) => ({ id: p.id, data: crypto.sealChange(groupId, keys, p.data) }));
  }

  acknowledge(groupId, ids, seq) {
    this.pending = this.pending.filter((p) => p.groupId !== groupId || !ids.includes(p.id));
    const meta = this.meta.get(groupId);
    meta.cursor = Math.max(meta.cursor, seq);
  }

  receive(groupId, items) {
    const meta = this.meta.get(groupId);
    const changes = items.map((i) => crypto.openChange(groupId, meta.keys, i.data));
    this.docs.set(groupId, Automerge.applyChanges(this.docs.get(groupId), changes)[0]);
    meta.cursor = Math.max(meta.cursor, ...items.map((i) => i.seq));
  }

  prepareRekey(groupId) {
    if (!this.rekeyDue.has(groupId)) return null;
    const meta = this.meta.get(groupId);
    const key = crypto.newGroupKey();
    const epoch = meta.keys.length + 1;
    const envelopes = keyRecipients(this.docs.get(groupId)).map((r) =>
      crypto.sealKeyEnvelope(Buffer.from(r.publicKey, 'base64url'), { groupId, epoch, key }),
    );
    return { next: crypto.relayToken(groupId, key), envelopes, key };
  }

  commitRekey(groupId, prepared) {
    this.rekeyDue.delete(groupId);
    this.adopt(groupId, prepared.key);
  }

  rekeyed(groupId, envelopes) {
    const found = crypto.openKeyEnvelopes(this.identity, groupId, envelopes);
    const meta = this.meta.get(groupId);
    if (!found || found.epoch !== meta.keys.length + 1) {
      meta.removed = true;
      return false;
    }
    this.adopt(groupId, found.key);
    return true;
  }

  adopt(groupId, key) {
    const meta = this.meta.get(groupId);
    meta.keys = [...meta.keys, key];
    meta.token = crypto.relayToken(groupId, key);
  }

  // App-side helpers
  track(groupId, keys, doc = Automerge.init()) {
    this.docs.set(groupId, doc);
    this.meta.set(groupId, {
      keys,
      token: crypto.relayToken(groupId, keys.at(-1)),
      cursor: 0,
    });
    this.enqueue(groupId, Automerge.init(), doc);
    this.client.kick();
  }

  // Once the group has arrived, records this device's identity on its member.
  claim(groupId, memberId, ctx) {
    return this.edit(groupId, (doc) => setMemberKey(doc, memberId, this.publicKey, ctx));
  }

  keysOf(groupId) {
    return this.meta.get(groupId).keys;
  }

  // Removes a member and replaces the group key, as the app does.
  removeMember(groupId, mutate) {
    this.edit(groupId, mutate);
    this.rekeyDue.add(groupId);
    this.client.kick();
  }

  view(groupId) {
    return readGroupDoc(this.docs.get(groupId));
  }

  enqueue(groupId, before, after) {
    for (const change of Automerge.getChanges(before, after)) {
      this.pending.push({ groupId, id: hashOf(change), data: change });
    }
  }

  edit(groupId, mutate) {
    const before = this.docs.get(groupId);
    const after = mutate(before);
    this.docs.set(groupId, after);
    this.enqueue(groupId, before, after);
    this.client.kick();
    return after;
  }

  doc(groupId) {
    return this.docs.get(groupId);
  }

  start() {
    this.client.start();
    return waitFor(() => this.client.status.connection === 'online');
  }

  goOffline() {
    this.client.setNetworkAvailable(false);
  }

  goOnline() {
    this.client.setNetworkAvailable(true);
    return waitFor(() => this.client.status.connection === 'online');
  }

  stop() {
    this.client.stop();
  }
}
