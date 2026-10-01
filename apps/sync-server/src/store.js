import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tokenHash = (token) => digest(Buffer.from(token, 'utf8'));

// Append-only log of opaque change blobs per group, plus the vaults (encrypted key backups).
// Nothing here decodes a blob: everything is end-to-end encrypted before it arrives. Duplicate
// changes are recognised by their SHA-256 so a device retrying a push is harmless.
//
// A group's token is replaced when its key is (a member was removed). The replaced token is
// remembered with the key envelopes of that rotation, so a device that was offline can pick up
// the new key; a removed member finds no envelope it can open.
export function openStore(path = ':memory:') {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS changes (
      group_id TEXT NOT NULL REFERENCES groups (id),
      seq INTEGER NOT NULL,
      digest TEXT NOT NULL,
      data BLOB NOT NULL,
      received_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, seq),
      UNIQUE (group_id, digest)
    );
    CREATE TABLE IF NOT EXISTS retired_tokens (
      group_id TEXT NOT NULL REFERENCES groups (id),
      token_hash TEXT NOT NULL,
      envelopes TEXT NOT NULL,
      retired_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, token_hash)
    );
    CREATE TABLE IF NOT EXISTS vaults (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      rev INTEGER NOT NULL,
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const statements = {
    group: db.prepare('SELECT token_hash FROM groups WHERE id = ?'),
    register: db.prepare('INSERT INTO groups (id, token_hash, created_at) VALUES (?, ?, ?)'),
    setToken: db.prepare('UPDATE groups SET token_hash = ? WHERE id = ?'),
    retired: db.prepare(
      'SELECT envelopes FROM retired_tokens WHERE group_id = ? AND token_hash = ?',
    ),
    retire: db.prepare(
      'INSERT OR REPLACE INTO retired_tokens (group_id, token_hash, envelopes, retired_at) VALUES (?, ?, ?, ?)',
    ),
    head: db.prepare('SELECT COALESCE(MAX(seq), 0) AS head FROM changes WHERE group_id = ?'),
    existing: db.prepare('SELECT seq FROM changes WHERE group_id = ? AND digest = ?'),
    insert: db.prepare(
      'INSERT INTO changes (group_id, seq, digest, data, received_at) VALUES (?, ?, ?, ?, ?)',
    ),
    since: db.prepare(
      'SELECT seq, data FROM changes WHERE group_id = ? AND seq > ? ORDER BY seq LIMIT ?',
    ),
    vault: db.prepare('SELECT token_hash, rev, data FROM vaults WHERE id = ?'),
    putVault: db.prepare(
      'INSERT OR REPLACE INTO vaults (id, token_hash, rev, data, updated_at) VALUES (?, ?, ?, ?, ?)',
    ),
  };

  // The first device to subscribe registers the group's token; later ones must present it.
  // Returns { status: 'ok' } | { status: 'rekeyed', envelopes } | { status: 'forbidden' }.
  const authorize = db.transaction((groupId, token) => {
    const hash = tokenHash(token);
    const row = statements.group.get(groupId);
    if (!row) {
      statements.register.run(groupId, hash, Date.now());
      return { status: 'ok' };
    }
    if (row.token_hash === hash) return { status: 'ok' };
    const retired = statements.retired.get(groupId, hash);
    if (retired) return { status: 'rekeyed', envelopes: JSON.parse(retired.envelopes) };
    return { status: 'forbidden' };
  });

  // Replaces the group's token; the old one keeps answering with these envelopes (base64).
  const rekey = db.transaction((groupId, nextToken, envelopes) => {
    const row = statements.group.get(groupId);
    if (!row) return false;
    statements.retire.run(groupId, row.token_hash, JSON.stringify(envelopes), Date.now());
    statements.setToken.run(tokenHash(nextToken), groupId);
    return true;
  });

  // Returns the new rows only (duplicates are skipped) and the head afterwards.
  const append = db.transaction((groupId, blobs) => {
    let head = statements.head.get(groupId).head;
    const added = [];
    for (const data of blobs) {
      const hash = digest(data);
      if (statements.existing.get(groupId, hash)) continue;
      head += 1;
      statements.insert.run(groupId, head, hash, data, Date.now());
      added.push({ seq: head, data });
    }
    return { added, head };
  });

  // Returns { status: 'ok', rev, data } (data null when nothing is stored yet) or
  // { status: 'forbidden' }.
  function getVault(id, token) {
    const row = statements.vault.get(id);
    if (!row) return { status: 'ok', rev: 0, data: null };
    if (row.token_hash !== tokenHash(token)) return { status: 'forbidden' };
    return { status: 'ok', rev: row.rev, data: row.data };
  }

  // Stores `data` only when `rev` is the current revision (0 for a new vault), so two devices
  // cannot overwrite each other's backup. Returns { status: 'ok', rev } with the new revision,
  // { status: 'stale', rev, data } with what is there now, or { status: 'forbidden' }.
  const putVault = db.transaction((id, token, rev, data) => {
    const current = getVault(id, token);
    if (current.status !== 'ok') return current;
    if (current.rev !== rev) return { status: 'stale', rev: current.rev, data: current.data };
    statements.putVault.run(id, tokenHash(token), rev + 1, data, Date.now());
    return { status: 'ok', rev: rev + 1 };
  });

  return {
    authorize,
    rekey,
    append,
    getVault,
    putVault,
    head: (groupId) => statements.head.get(groupId).head,
    since: (groupId, seq, limit) => statements.since.all(groupId, seq, limit),
    close: () => db.close(),
  };
}
