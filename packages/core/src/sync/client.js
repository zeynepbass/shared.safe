import { toBase64, fromBase64 } from './base64.js';
import { encodeMessage, MAX_PUSH_BYTES, parseServerMessage, PROTOCOL_VERSION } from './protocol.js';

// Keeps a device's groups in step with the relay. It knows nothing about Automerge, encryption
// or storage: everything goes through `store`, whose methods may be sync or async:
//
//   groups()                        → [{ groupId, token, cursor }]
//   outbox(groupId)                 → [{ id, data: Uint8Array }] in the order they were made
//   acknowledge(groupId, ids, seq)  the relay has stored these outbox entries
//   receive(groupId, items)         apply [{ seq, data }] and remember the highest seq
//   prepareRekey(groupId)           → null, or { next, envelopes: [Uint8Array] } when the group's
//                                     key must be replaced (a member was removed)
//   commitRekey(groupId, prepared)  the relay accepted that replacement
//   rekeyed(groupId, envelopes)     → true if a new key for the group was found in [Uint8Array]
//                                     (its token is then in groups()), false if not
//   vaultOutbox()                   → null, or { vault, token, rev, data } to back up
//   vaultSaved(rev)                 the relay stored the backup that was sent
//   vaultMerge(rev, data)           the relay is at another revision: fold in its backup
//                                     (Uint8Array, or null if there is none)
//
// The key and backup methods are optional; a store without them never rotates keys or backs up.
//
// Changes made offline simply wait in the outbox; every (re)connection subscribes to each group
// with its cursor, receives what it missed, replaces the group key if needed, then sends what it
// has.

const INITIAL_STATUS = { connection: 'idle', lastSyncedAt: null, groupErrors: {} };
const REQUEST_TIMEOUT_MS = 15000;

export class SyncClient {
  #socket = null;
  #enabled = false;
  #networkUp = true;
  #retryDelay;
  #retryTimer = null;
  #subscribed = new Set();
  #subscribing = new Set();
  #inFlight = new Map();
  #rekeying = new Map();
  #vaultInFlight = false;
  #vaultRequests = new Map();
  #queue = Promise.resolve();
  #listeners = new Set();
  #status = INITIAL_STATUS;

  constructor({ url, deviceId, store, WebSocket, retry = {}, onError = () => {} }) {
    this.url = url;
    this.deviceId = deviceId;
    this.store = store;
    this.WebSocket = WebSocket ?? globalThis.WebSocket;
    this.retry = { min: retry.min ?? 1000, max: retry.max ?? 30000 };
    this.onError = onError;
    this.#retryDelay = this.retry.min;
  }

  get status() {
    return this.#status;
  }

  onStatus(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start() {
    this.#enabled = true;
    this.#connect();
  }

  stop() {
    this.#enabled = false;
    clearTimeout(this.#retryTimer);
    this.#socket?.close();
    this.#setStatus({ connection: 'idle' });
  }

  // Hint from the OS network state: go quiet while offline, reconnect at once when back.
  setNetworkAvailable(available) {
    if (available === this.#networkUp) return;
    this.#networkUp = available;
    if (!available) {
      clearTimeout(this.#retryTimer);
      this.#socket?.close();
      this.#setStatus({ connection: 'offline' });
    } else {
      this.#retryDelay = this.retry.min;
      this.#connect();
    }
  }

  // Something was added to the outbox, a group was added or a backup is due; send what we can.
  kick() {
    this.#enqueue(async () => {
      if (!this.#isOpen()) return;
      const groups = await this.store.groups();
      for (const group of groups) {
        if (this.#subscribed.has(group.groupId)) await this.#sendPending(group.groupId);
        else this.#subscribe(group);
      }
      await this.#flushVault();
    });
  }

  // Reads a vault that may not belong to any group this device has (restoring on a new device).
  // Resolves with { rev, data: Uint8Array | null }.
  fetchVault({ vault, token }) {
    return new Promise((resolve, reject) => {
      if (!this.#isOpen()) {
        reject(new Error('offline'));
        return;
      }
      const timer = setTimeout(() => {
        this.#vaultRequests.delete(vault);
        reject(new Error('timeout'));
      }, REQUEST_TIMEOUT_MS);
      this.#vaultRequests.set(vault, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#send({ t: 'vault_get', vault, token });
    });
  }

  #isOpen() {
    return this.#socket?.readyState === 1 && this.#status.connection === 'online';
  }

  #setStatus(patch) {
    this.#status = { ...this.#status, ...patch };
    for (const listener of this.#listeners) listener(this.#status);
  }

  #connect() {
    if (!this.#enabled || !this.#networkUp || this.#socket) return;
    clearTimeout(this.#retryTimer);
    this.#setStatus({ connection: 'connecting' });
    let socket;
    try {
      socket = new this.WebSocket(this.url);
    } catch (error) {
      this.onError(error);
      this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;
    socket.onopen = () => this.#send({ t: 'hello', v: PROTOCOL_VERSION, device: this.deviceId });
    socket.onmessage = (event) => this.#enqueue(() => this.#handle(event.data));
    socket.onerror = () => {};
    socket.onclose = () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#subscribed.clear();
      this.#subscribing.clear();
      this.#inFlight.clear();
      this.#rekeying.clear();
      this.#vaultInFlight = false;
      for (const request of this.#vaultRequests.values()) request.reject(new Error('closed'));
      this.#vaultRequests.clear();
      if (this.#enabled && this.#networkUp) {
        this.#setStatus({ connection: 'connecting' });
        this.#scheduleReconnect();
      } else {
        this.#setStatus({ connection: this.#networkUp ? 'idle' : 'offline' });
      }
    };
  }

  #scheduleReconnect() {
    clearTimeout(this.#retryTimer);
    const delay = this.#retryDelay;
    this.#retryDelay = Math.min(this.#retryDelay * 2, this.retry.max);
    this.#retryTimer = setTimeout(() => this.#connect(), delay);
  }

  #subscribe({ groupId, token, cursor }) {
    if (this.#subscribing.has(groupId) || this.#subscribed.has(groupId)) return;
    this.#subscribing.add(groupId);
    this.#send({ t: 'sub', group: groupId, token, since: cursor });
  }

  #send(message) {
    if (this.#socket?.readyState === 1) this.#socket.send(encodeMessage(message));
  }

  // Messages are handled strictly one after another, since applying changes is async.
  #enqueue(task) {
    this.#queue = this.#queue.then(task).catch((error) => this.onError(error));
    return this.#queue;
  }

  async #handle(raw) {
    const message = parseServerMessage(typeof raw === 'string' ? raw : String(raw));
    switch (message.t) {
      case 'welcome': {
        this.#retryDelay = this.retry.min;
        this.#setStatus({ connection: 'online' });
        for (const group of await this.store.groups()) this.#subscribe(group);
        await this.#flushVault();
        break;
      }
      case 'changes': {
        if (message.items.length === 0) break;
        const items = message.items.map((item) => ({ seq: item.seq, data: fromBase64(item.data) }));
        await this.store.receive(message.group, items);
        this.#setStatus({ lastSyncedAt: Date.now() });
        break;
      }
      case 'sub_ok': {
        this.#subscribing.delete(message.group);
        this.#subscribed.add(message.group);
        this.#clearGroupError(message.group);
        await this.#sendPending(message.group);
        this.#setStatus({ lastSyncedAt: Date.now() });
        break;
      }
      case 'ack': {
        const pending = this.#inFlight.get(message.group);
        message.ids.forEach((id) => pending?.delete(id));
        await this.store.acknowledge(message.group, message.ids, message.seq);
        this.#setStatus({ lastSyncedAt: Date.now() });
        break;
      }
      case 'rekey_ok': {
        const prepared = this.#rekeying.get(message.group);
        if (!prepared) break;
        this.#rekeying.delete(message.group);
        await this.store.commitRekey(message.group, prepared);
        await this.#flush(message.group);
        break;
      }
      case 'rekeyed': {
        this.#forgetGroup(message.group);
        const envelopes = message.envelopes.map(fromBase64);
        if (await this.store.rekeyed?.(message.group, envelopes)) {
          const group = (await this.store.groups()).find((g) => g.groupId === message.group);
          if (group) this.#subscribe(group);
        } else {
          this.#setGroupError(message.group, 'removed');
        }
        break;
      }
      case 'vault': {
        const request = this.#vaultRequests.get(message.vault);
        if (request) {
          this.#vaultRequests.delete(message.vault);
          request.resolve({ rev: message.rev, data: message.data && fromBase64(message.data) });
        } else if (this.#vaultInFlight) {
          // Our backup was based on an older revision: merge theirs and try again.
          this.#vaultInFlight = false;
          await this.store.vaultMerge(message.rev, message.data && fromBase64(message.data));
          await this.#flushVault();
        }
        break;
      }
      case 'vault_ok': {
        this.#vaultInFlight = false;
        await this.store.vaultSaved(message.rev);
        await this.#flushVault();
        break;
      }
      case 'error': {
        if (message.vault) {
          const request = this.#vaultRequests.get(message.vault);
          this.#vaultRequests.delete(message.vault);
          request?.reject(new Error(message.code));
          if (!request) {
            this.#vaultInFlight = false;
            this.onError(new Error(`vault error: ${message.code}`));
          }
        } else if (message.group && message.code === 'notSubscribed') {
          // A push raced a key rotation that ended the subscription; `rekeyed` handles the rest.
          this.#inFlight.delete(message.group);
        } else if (message.group) {
          this.#forgetGroup(message.group);
          this.#setGroupError(message.group, message.code);
        } else {
          this.onError(new Error(`relay error: ${message.code}`));
        }
        break;
      }
      default:
        break;
    }
  }

  #forgetGroup(groupId) {
    this.#subscribing.delete(groupId);
    this.#subscribed.delete(groupId);
    this.#inFlight.delete(groupId);
    this.#rekeying.delete(groupId);
  }

  #setGroupError(groupId, code) {
    this.#setStatus({ groupErrors: { ...this.#status.groupErrors, [groupId]: code } });
  }

  // A pending key replacement goes first, so nothing written after a member was removed is
  // sealed with a key they still have.
  async #sendPending(groupId) {
    if (this.#rekeying.has(groupId)) return;
    const prepared = await this.store.prepareRekey?.(groupId);
    if (prepared) {
      this.#rekeying.set(groupId, prepared);
      this.#send({
        t: 'rekey',
        group: groupId,
        next: prepared.next,
        envelopes: prepared.envelopes.map(toBase64),
      });
      return;
    }
    await this.#flush(groupId);
  }

  async #flushVault() {
    if (this.#vaultInFlight || !this.#isOpen()) return;
    const backup = await this.store.vaultOutbox?.();
    if (!backup) return;
    this.#vaultInFlight = true;
    this.#send({
      t: 'vault_put',
      vault: backup.vault,
      token: backup.token,
      rev: backup.rev,
      data: toBase64(backup.data),
    });
  }

  #clearGroupError(groupId) {
    if (!(groupId in this.#status.groupErrors)) return;
    const groupErrors = { ...this.#status.groupErrors };
    delete groupErrors[groupId];
    this.#setStatus({ groupErrors });
  }

  // Sends outbox entries not already on their way, in batches that stay under the frame limit.
  async #flush(groupId) {
    const inFlight = this.#inFlight.get(groupId) ?? new Set();
    this.#inFlight.set(groupId, inFlight);
    const entries = (await this.store.outbox(groupId)).filter((e) => !inFlight.has(e.id));
    let batch = [];
    let size = 0;
    const sendBatch = () => {
      if (batch.length === 0) return;
      this.#send({ t: 'push', group: groupId, items: batch });
      batch = [];
      size = 0;
    };
    for (const entry of entries) {
      const data = toBase64(entry.data);
      if (size + data.length > MAX_PUSH_BYTES) sendBatch();
      batch.push({ id: entry.id, data });
      size += data.length;
      inFlight.add(entry.id);
    }
    sendBatch();
  }
}
