import { fromBase64, toBase64 } from '@ortak-kasa/core/sync/base64';
import {
  encodeMessage,
  MAX_FRAME_BYTES,
  PAGE_SIZE,
  parseClientMessage,
  PROTOCOL_VERSION,
} from '@ortak-kasa/core/sync/protocol';
import { WebSocketServer } from 'ws';

import { openStore } from './store.js';

const HEARTBEAT_MS = 30_000;

// A relay, nothing more: it checks a group's access token, stores the blobs devices push and
// forwards them to the other devices on that group, keeps the group's files and each user's
// vault. It never decodes a blob; everything is end-to-end encrypted on the devices.
export function createSyncServer({ port = 0, dbPath = ':memory:', log = () => {} } = {}) {
  const store = openStore(dbPath);
  const wss = new WebSocketServer({ port, maxPayload: MAX_FRAME_BYTES });
  const subscribers = new Map(); // groupId → Set<socket>

  const send = (socket, message) => {
    if (socket.readyState === socket.OPEN) socket.send(encodeMessage(message));
  };

  const broadcast = (groupId, except, items) => {
    for (const socket of subscribers.get(groupId) ?? []) {
      if (socket !== except) send(socket, { t: 'changes', group: groupId, items });
    }
  };

  const unsubscribe = (socket, groupId) => {
    socket.groups.delete(groupId);
    subscribers.get(groupId)?.delete(socket);
  };

  function subscribe(socket, { group, token, since }) {
    const access = store.authorize(group, token);
    if (access.status === 'rekeyed') {
      send(socket, { t: 'rekeyed', group, envelopes: access.envelopes });
      return;
    }
    if (access.status !== 'ok') {
      send(socket, { t: 'error', code: 'forbidden', group });
      return;
    }
    let cursor = since;
    for (;;) {
      const rows = store.since(group, cursor, PAGE_SIZE);
      if (rows.length === 0) break;
      send(socket, {
        t: 'changes',
        group,
        items: rows.map((r) => ({ seq: r.seq, data: toBase64(r.data) })),
      });
      cursor = rows[rows.length - 1].seq;
    }
    socket.groups.add(group);
    if (!subscribers.has(group)) subscribers.set(group, new Set());
    subscribers.get(group).add(socket);
    send(socket, { t: 'sub_ok', group, head: store.head(group) });
  }

  function push(socket, { group, items }) {
    if (!socket.groups.has(group)) {
      send(socket, { t: 'error', code: 'notSubscribed', group });
      return;
    }
    const { added, head } = store.append(
      group,
      items.map((item) => Buffer.from(fromBase64(item.data))),
    );
    send(socket, { t: 'ack', group, ids: items.map((i) => i.id), seq: head });
    if (added.length) {
      broadcast(
        group,
        socket,
        added.map((a) => ({ seq: a.seq, data: toBase64(a.data) })),
      );
    }
  }

  // The key was replaced: every other device on the group was subscribed with the old token, so
  // it is dropped and told to fetch the new key, then comes back with the new token.
  function rekey(socket, { group, next, envelopes }) {
    if (!socket.groups.has(group)) {
      send(socket, { t: 'error', code: 'notSubscribed', group });
      return;
    }
    store.rekey(group, next, envelopes);
    for (const other of [...(subscribers.get(group) ?? [])]) {
      if (other === socket) continue;
      unsubscribe(other, group);
      send(other, { t: 'rekeyed', group, envelopes });
    }
    send(socket, { t: 'rekey_ok', group });
  }

  function vaultGet(socket, { vault, token }) {
    const result = store.getVault(vault, token);
    if (result.status !== 'ok') {
      send(socket, { t: 'error', code: 'forbidden', vault });
      return;
    }
    send(socket, {
      t: 'vault',
      vault,
      rev: result.rev,
      data: result.data && toBase64(result.data),
    });
  }

  function vaultPut(socket, { vault, token, rev, data }) {
    const result = store.putVault(vault, token, rev, Buffer.from(fromBase64(data)));
    if (result.status === 'forbidden') send(socket, { t: 'error', code: 'forbidden', vault });
    else if (result.status === 'stale') {
      send(socket, { t: 'vault', vault, rev: result.rev, data: toBase64(result.data) });
    } else send(socket, { t: 'vault_ok', vault, rev: result.rev });
  }

  // Files belong to a group and are open to whoever is subscribed to it, like its log.
  function filePut(socket, { group, id, data }) {
    if (!socket.groups.has(group)) {
      send(socket, { t: 'error', code: 'notSubscribed', group, file: id });
      return;
    }
    store.putFile(group, id, Buffer.from(fromBase64(data)));
    send(socket, { t: 'file_ok', group, id });
  }

  function fileGet(socket, { group, id }) {
    if (!socket.groups.has(group)) {
      send(socket, { t: 'error', code: 'notSubscribed', group, file: id });
      return;
    }
    const data = store.getFile(group, id);
    send(socket, { t: 'file', group, id, data: data && toBase64(data) });
  }

  const HANDLERS = {
    sub: subscribe,
    push,
    rekey,
    vault_get: vaultGet,
    vault_put: vaultPut,
    file_put: filePut,
    file_get: fileGet,
  };

  wss.on('connection', (socket) => {
    socket.groups = new Set();
    socket.greeted = false;
    socket.alive = true;
    socket.on('pong', () => {
      socket.alive = true;
    });
    socket.on('message', (raw, isBinary) => {
      try {
        if (isBinary) throw new Error('binary');
        const message = parseClientMessage(raw.toString('utf8'));
        if (message.t === 'hello') {
          socket.greeted = true;
          send(socket, { t: 'welcome', v: PROTOCOL_VERSION });
          return;
        }
        if (!socket.greeted) throw new Error('not greeted');
        HANDLERS[message.t](socket, message);
      } catch (error) {
        log('rejected message', error.message);
        send(socket, { t: 'error', code: 'badRequest' });
      }
    });
    socket.on('close', () => {
      for (const group of [...socket.groups]) unsubscribe(socket, group);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  }, HEARTBEAT_MS);

  const ready = new Promise((resolve) => wss.on('listening', resolve));

  return {
    ready,
    get port() {
      return wss.address().port;
    },
    // Drops every connection, as a network cut would.
    disconnectAll() {
      for (const socket of wss.clients) socket.terminate();
    },
    async close() {
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      await new Promise((resolve) => wss.close(resolve));
      store.close();
    },
  };
}
