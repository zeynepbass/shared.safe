import { asc, count, eq } from 'drizzle-orm';

import { Automerge } from '@ortak-kasa/core/automerge';
import { toBase64Url } from '@ortak-kasa/core/crypto';
import { setMemberKey } from '@ortak-kasa/core/groupDoc';
import { readAt } from '@ortak-kasa/core/canonical';
import { touchedRecords } from '@ortak-kasa/core/readGroupDoc';

import { notifyChange } from '../changes';
import { newId, now } from '../ids';
import { groupDocChanges, groupDocs, syncGroups, syncOutbox } from '../schema';
import { createGroupKeys, getIdentity, groupKeys } from '../security/keys';
import { crypto } from '../security/sodium';
import { projectGroup } from './projection';
import { markVaultChanged } from './vault';

// Every table a group change can touch, for useDbQuery subscribers.
export const GROUP_TABLES = [
  'groups',
  'members',
  'expenses',
  'expense_shares',
  'settlements',
  'activity_log',
  'sync_groups',
  'sync_outbox',
];

// Fold the change log into a fresh snapshot once it grows past this.
const COMPACT_AFTER = 200;

// Loaded documents, per database (tests open many).
const caches = new WeakMap();

function cacheOf(db) {
  if (!caches.has(db)) caches.set(db, new Map());
  return caches.get(db);
}

export function forgetGroupDocs(db) {
  caches.delete(db);
}

export function loadGroupDoc(db, groupId) {
  const cache = cacheOf(db);
  if (cache.has(groupId)) return cache.get(groupId);
  const row = db.select().from(groupDocs).where(eq(groupDocs.groupId, groupId)).get();
  let doc = row ? Automerge.load(row.snapshot) : Automerge.init();
  const changes = db
    .select({ data: groupDocChanges.data })
    .from(groupDocChanges)
    .where(eq(groupDocChanges.groupId, groupId))
    .orderBy(asc(groupDocChanges.id))
    .all();
  if (changes.length)
    doc = Automerge.applyChanges(
      doc,
      changes.map((c) => c.data),
    )[0];
  cache.set(groupId, doc);
  return doc;
}

export function getSyncGroup(db, groupId) {
  return db.select().from(syncGroups).where(eq(syncGroups.groupId, groupId)).get() ?? null;
}

function storeChanges(tx, groupId, changes) {
  for (const data of changes) tx.insert(groupDocChanges).values({ groupId, data }).run();
}

const hashOf = (change) => Automerge.decodeChange(change).hash;
const hasChange = (doc, change) =>
  Automerge.getBackend(doc).getChangeByHash(hashOf(change)) !== null;

// The snapshot only holds changes the document has applied, so changes still waiting for their
// dependencies are carried over instead of being dropped.
function compactIfLarge(tx, groupId, doc) {
  const { n } = tx
    .select({ n: count() })
    .from(groupDocChanges)
    .where(eq(groupDocChanges.groupId, groupId))
    .get();
  if (n < COMPACT_AFTER) return;
  const waiting = tx
    .select({ data: groupDocChanges.data })
    .from(groupDocChanges)
    .where(eq(groupDocChanges.groupId, groupId))
    .orderBy(asc(groupDocChanges.id))
    .all()
    .filter((c) => !hasChange(doc, c.data));
  const snapshot = Automerge.save(doc);
  tx.insert(groupDocs)
    .values({ groupId, snapshot, updatedAt: now() })
    .onConflictDoUpdate({ target: groupDocs.groupId, set: { snapshot, updatedAt: now() } })
    .run();
  tx.delete(groupDocChanges).where(eq(groupDocChanges.groupId, groupId)).run();
  storeChanges(
    tx,
    groupId,
    waiting.map((c) => c.data),
  );
}

function enqueue(tx, groupId, changes) {
  const createdAt = now();
  for (const data of changes) {
    tx.insert(syncOutbox)
      .values({ groupId, changeHash: hashOf(data), data, createdAt })
      .onConflictDoNothing()
      .run();
  }
}

// Applies a local edit: `mutate(doc, ctx)` returns the new document (core throws a
// ValidationError for anything invalid, before anything is written). The change is stored,
// queued for the relay and projected into the read tables in one transaction; only the records
// it touched are projected.
export function commitGroupChange(db, groupId, mutate, { afterProject } = {}) {
  const before = loadGroupDoc(db, groupId);
  const identity = getSyncGroup(db, groupId);
  const patches = [];
  const ctx = {
    now: now(),
    newId,
    actorMemberId: identity?.localMemberId ?? null,
    onPatches: (made) => patches.push(...made),
  };
  const after = mutate(before, ctx);
  const changes = Automerge.getChanges(before, after);
  // A change that reported no patches was not made through core; rebuild to be safe.
  const touched = patches.length ? touchedRecords(patches) : undefined;
  db.transaction((tx) => {
    storeChanges(tx, groupId, changes);
    enqueue(tx, groupId, changes);
    projectGroup(tx, groupId, after, touched);
    afterProject?.(tx);
    compactIfLarge(tx, groupId, after);
  });
  cacheOf(db).set(groupId, after);
  notifyChange(GROUP_TABLES);
  return after;
}

// The identity key (base64url) to record on the member, or null if it is already there, there
// is no identity yet or the member is gone. Only reads: calling Automerge.change on a document
// makes it stale, so the check must not touch it.
function missingMemberKey(db, doc, memberId) {
  const identity = getIdentity(db);
  const member = memberId && readAt(doc, ['members', memberId]);
  if (!identity || !member || member.deletedAt) return null;
  const publicKey = toBase64Url(identity.publicKey);
  return member.publicKey === publicKey ? null : publicKey;
}

// Records the user's identity on their member, so later key rotations include them: after
// joining, restoring on a new phone, or for groups that predate encryption.
export function ensureMemberKey(db, groupId) {
  const sync = getSyncGroup(db, groupId);
  const memberId = sync?.localMemberId;
  if (!memberId || sync.removedAt) return;
  const publicKey = missingMemberKey(db, loadGroupDoc(db, groupId), memberId);
  if (!publicKey) return;
  commitGroupChange(db, groupId, (doc, ctx) => setMemberKey(doc, memberId, publicKey, ctx));
}

// Starts syncing a group this device has just created (or imported from before sync), with a
// new key.
export function startGroupSync(db, groupId, created, { localMemberId }) {
  const publicKey = missingMemberKey(db, created, localMemberId);
  const ctx = { now: now(), newId, actorMemberId: localMemberId };
  const doc = publicKey ? setMemberKey(created, localMemberId, publicKey, ctx) : created;
  const token = createGroupKeys(db, groupId);
  db.transaction((tx) => {
    tx.insert(syncGroups)
      .values({ groupId, token, cursor: 0, localMemberId, joinedAt: now() })
      .run();
    const changes = Automerge.getAllChanges(doc);
    storeChanges(tx, groupId, changes);
    enqueue(tx, groupId, changes);
    projectGroup(tx, groupId, doc);
    markVaultChanged(tx);
  });
  cacheOf(db).set(groupId, doc);
  notifyChange(GROUP_TABLES);
}

// Queues a group's whole history again under a new key and token: for groups that synced
// before encryption, whose relay log could not be read by anyone joining now.
export function resyncGroupEncrypted(db, groupId) {
  const doc = loadGroupDoc(db, groupId);
  const token = createGroupKeys(db, groupId);
  db.transaction((tx) => {
    tx.update(syncGroups).set({ token, cursor: 0 }).where(eq(syncGroups.groupId, groupId)).run();
    tx.delete(syncOutbox).where(eq(syncOutbox.groupId, groupId)).run();
    enqueue(tx, groupId, Automerge.getAllChanges(doc));
    markVaultChanged(tx);
  });
  notifyChange(GROUP_TABLES);
  ensureMemberKey(db, groupId);
}

// Opens what the relay sent. Anything that does not open with the group's keys (damaged, or not
// from a member) is dropped; the cursor still moves past it.
function openAll(db, groupId, items) {
  const keys = groupKeys(db, groupId);
  const opened = [];
  for (const item of items) {
    try {
      opened.push(crypto.openChange(groupId, keys, item.data));
    } catch (error) {
      console.warn(`Dropped a change that could not be decrypted (${error.code ?? error.message})`);
    }
  }
  return opened;
}

// Applies changes that arrived from the relay. Duplicates and changes whose dependencies are
// still missing are fine: Automerge ignores the first and holds the second back.
export function receiveGroupChanges(db, groupId, items) {
  if (!getSyncGroup(db, groupId)) return;
  const before = loadGroupDoc(db, groupId);
  const incoming = openAll(db, groupId, items).filter((data) => !hasChange(before, data));
  const patches = [];
  const [after] = Automerge.applyChanges(before, incoming, {
    patchCallback: (made) => patches.push(...made),
  });
  const cursor = Math.max(...items.map((i) => i.seq));
  db.transaction((tx) => {
    storeChanges(tx, groupId, incoming);
    tx.update(syncGroups).set({ cursor }).where(eq(syncGroups.groupId, groupId)).run();
    projectGroup(tx, groupId, after, touchedRecords(patches));
    compactIfLarge(tx, groupId, after);
  });
  cacheOf(db).set(groupId, after);
  notifyChange(GROUP_TABLES);
  ensureMemberKey(db, groupId);
}
