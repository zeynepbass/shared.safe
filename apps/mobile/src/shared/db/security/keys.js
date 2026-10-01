import { decodeKeyring, encodeKeyring } from '@ortak-kasa/core/crypto';
import { phraseFromSecret, RECOVERY_SECRET_BYTES } from '@ortak-kasa/core/recovery';

import { keyStoreOf } from './keystore';
import { crypto, randomBytes } from './sodium';

// Secure store entries (names may only use letters, digits, '.', '-' and '_').
const RECOVERY_ITEM = 'ortakkasa.recovery';
const groupItem = (groupId) => `ortakkasa.group.${groupId}`;
// Groups known only from another device's backup (see sync/vault.js); they include keys.
export const VAULT_EXTRA_ITEM = 'ortakkasa.vault.extra';

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

// --- Group keyrings -------------------------------------------------------------------------

// The group's keys in epoch order; empty if this device has none.
export function groupKeys(db, groupId) {
  const stored = keyStoreOf(db).get(groupItem(groupId));
  return stored ? decodeKeyring(stored) : [];
}

export function saveGroupKeys(db, groupId, keys) {
  keyStoreOf(db).set(groupItem(groupId), encodeKeyring(keys));
}

export function forgetGroupKeys(db, groupId) {
  keyStoreOf(db).remove(groupItem(groupId));
}

// A first key for a group this device creates; returns the relay token that goes with it.
export function createGroupKeys(db, groupId) {
  const key = crypto.newGroupKey();
  saveGroupKeys(db, groupId, [key]);
  return crypto.relayToken(groupId, key);
}

export const relayTokenFor = (groupId, keys) => crypto.relayToken(groupId, keys.at(-1));

// --- Identity -------------------------------------------------------------------------------

// Derived keys are cached per database; the secret itself is read from the secure store.
const identities = new WeakMap();

export function getRecoverySecret(db) {
  const stored = keyStoreOf(db).get(RECOVERY_ITEM);
  return stored ? fromHex(stored) : null;
}

export function setRecoverySecret(db, secret) {
  keyStoreOf(db).set(RECOVERY_ITEM, toHex(secret));
  identities.delete(db);
}

// Creates the user's recovery secret the first time; later calls keep the existing one.
export function ensureRecoverySecret(db) {
  if (!getRecoverySecret(db)) setRecoverySecret(db, randomBytes(RECOVERY_SECRET_BYTES));
}

export function getIdentity(db) {
  if (identities.has(db)) return identities.get(db);
  const secret = getRecoverySecret(db);
  const identity = secret ? crypto.identityFromSecret(secret) : null;
  if (identity) identities.set(db, identity);
  return identity;
}

export function recoveryWords(db) {
  const secret = getRecoverySecret(db);
  return secret ? phraseFromSecret(secret) : null;
}

// Removes every key this device holds (factory reset).
export function forgetAllKeys(db, groupIds) {
  const store = keyStoreOf(db);
  for (const groupId of groupIds) store.remove(groupItem(groupId));
  store.remove(RECOVERY_ITEM);
  store.remove(VAULT_EXTRA_ITEM);
  identities.delete(db);
}
