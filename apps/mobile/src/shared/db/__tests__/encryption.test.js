import { eq, sql } from 'drizzle-orm';

import { Automerge } from '@ortak-kasa/core/automerge';
import { envelopeEpoch, toBase64Url } from '@ortak-kasa/core/crypto';
import { secretFromPhrase } from '@ortak-kasa/core/recovery';

import {
  claimMembership,
  confirmRecovery,
  countPendingChanges,
  createExpense,
  createGroup,
  createInvite,
  createSyncStore,
  deleteAllData,
  getAllSettings,
  getRecoveryWords,
  isRemovedFromGroup,
  joinGroupByInvite,
  listExpenses,
  listGroups,
  listMembers,
  listPendingJoins,
  removeMember,
  restoreAccount,
  saveProfile,
  SETTING_KEYS,
  vaultAccess,
} from '../repositories';
import { groupDocs, syncGroups } from '../schema';
import { getIdentity, groupKeys } from '../security/keys';
import { bootstrapSync } from '../sync/bootstrap';
import { forgetGroupDocs, loadGroupDoc } from '../sync/groupDocs';
import { createRelay } from '../testing/createRelay';
import { createTestDb } from '../testing/createTestDb';

function phone(name) {
  const { db, keyStore } = createTestDb();
  saveProfile(db, { name, avatarColor: '#111', defaultCurrency: 'TRY' });
  return Object.assign(db, { keyStore });
}

const input = (groupId, payerId, memberIds, overrides = {}) => ({
  groupId,
  description: 'Market',
  amount: 9000,
  category: 'market',
  payerId,
  spentOn: '2026-09-30',
  splitType: 'equal',
  shares: memberIds.map((memberId) => ({ memberId })),
  ...overrides,
});

const descriptions = (db, groupId) => listExpenses(db, groupId).map((e) => e.description);
const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

// Zeynep's group with Ali and Cem, each on their own phone and each joined as a new member.
function threePhones() {
  const relay = createRelay();
  const zeynep = phone('Zeynep');
  const groupId = createGroup(zeynep, { name: 'Ev Moda', type: 'home', currency: 'TRY' });
  relay.sync(zeynep);
  const others = ['Ali', 'Cem'].map((name) => {
    const db = phone(name);
    joinGroupByInvite(db, createInvite(zeynep, groupId));
    relay.sync(db);
    claimMembership(db, groupId, null);
    relay.sync(db);
    return db;
  });
  relay.sync(zeynep);
  const [ali, cem] = others;
  relay.sync(ali);
  const memberOf = (db) => listMembers(db, groupId).find((m) => m.isLocalUser).id;
  return { relay, zeynep, ali, cem, groupId, memberOf };
}

describe('recovery phrase', () => {
  it('is created with the profile, stays the same and can be confirmed', () => {
    const db = phone('Zeynep');
    const words = getRecoveryWords(db);
    expect(words).toHaveLength(12);
    saveProfile(db, { name: 'Zeynep B', avatarColor: '#222' });
    expect(getRecoveryWords(db)).toEqual(words);
    expect(getAllSettings(db)[SETTING_KEYS.recoveryConfirmed]).toBeUndefined();
    confirmRecovery(db);
    expect(getAllSettings(db)[SETTING_KEYS.recoveryConfirmed]).toBe('1');
  });

  it('lives in the key store, not in the database', () => {
    const db = phone('Zeynep');
    const secretHex = hex(secretFromPhrase(getRecoveryWords(db).join(' ')));
    expect(db.keyStore.items.get('ortakkasa.recovery')).toBe(secretHex);
    const dump = JSON.stringify(db.all(sql`SELECT * FROM settings`));
    expect(dump).not.toContain(secretHex);
  });
});

describe('what leaves the phone', () => {
  it('is sealed with the group key and reveals no content', () => {
    const zeynep = phone('Zeynep');
    const groupId = createGroup(zeynep, { name: 'Ev Moda', type: 'home', currency: 'TRY' });
    const [me] = listMembers(zeynep, groupId).map((m) => m.id);
    createExpense(zeynep, input(groupId, me, [me], { description: 'Kira Eylül' }));

    const outbox = createSyncStore(zeynep).outbox(groupId);
    expect(outbox.length).toBeGreaterThan(0);
    for (const { data } of outbox) {
      expect(envelopeEpoch(data)).toBe(1);
      for (const secret of ['Kira Eylül', 'Ev Moda', 'Zeynep', me]) {
        expect(latin1(data)).not.toContain(secret);
      }
    }
    // A retry sends the very same bytes, so the relay can drop the duplicate.
    const encoded = (entries) => entries.map((e) => toBase64Url(e.data));
    expect(encoded(createSyncStore(zeynep).outbox(groupId))).toEqual(encoded(outbox));
  });

  it('keeps the relay token apart from the key it comes from', () => {
    const zeynep = phone('Zeynep');
    const groupId = createGroup(zeynep, { name: 'Ev', type: 'home', currency: 'TRY' });
    const [{ token }] = createSyncStore(zeynep).groups();
    const [key] = groupKeys(zeynep, groupId);
    expect(token).not.toBe(toBase64Url(key));
    expect(zeynep.keyStore.items.get(`ortakkasa.group.${groupId}`)).toBe(toBase64Url(key));
  });

  it('records every member identity in the group, so rotations can reach them', () => {
    const { zeynep, groupId, memberOf, ali, cem } = threePhones();
    const doc = loadGroupDoc(zeynep, groupId);
    for (const db of [zeynep, ali, cem]) {
      const member = Automerge.toJS(doc).members[memberOf(db)];
      expect(member.publicKey).toBe(toBase64Url(getIdentity(db).publicKey));
    }
  });
});

describe('removing a member', () => {
  it('replaces the key so the removed member reads nothing written after', () => {
    const { relay, zeynep, ali, cem, groupId, memberOf } = threePhones();
    const ids = [memberOf(zeynep), memberOf(ali)];
    createExpense(zeynep, input(groupId, ids[0], ids, { description: 'Before' }));
    relay.sync(zeynep);
    relay.sync(cem);
    expect(descriptions(cem, groupId)).toEqual(['Before']);

    removeMember(zeynep, memberOf(cem));
    expect(countPendingChanges(zeynep, groupId)).toBeGreaterThan(0);
    relay.sync(zeynep);
    expect(groupKeys(zeynep, groupId)).toHaveLength(2);
    createExpense(zeynep, input(groupId, ids[0], ids, { description: 'After' }));
    relay.sync(zeynep);

    relay.sync(ali);
    expect(groupKeys(ali, groupId)).toEqual(groupKeys(zeynep, groupId));
    expect(descriptions(ali, groupId).sort()).toEqual(['After', 'Before']);
    expect(listMembers(ali, groupId).map((m) => m.name)).toEqual(['Zeynep', 'Ali']);

    relay.sync(cem);
    expect(isRemovedFromGroup(cem, groupId)).toBe(true);
    expect(groupKeys(cem, groupId)).toHaveLength(1);
    expect(descriptions(cem, groupId)).toEqual(['Before']);
    // Cem's phone stops trying.
    expect(createSyncStore(cem).groups()).toEqual([]);

    // Ali keeps writing with the new key and Zeynep reads it.
    createExpense(ali, input(groupId, ids[1], ids, { description: 'From Ali' }));
    relay.sync(ali);
    relay.sync(zeynep);
    expect(descriptions(zeynep, groupId)).toContain('From Ali');
  });

  it('waits for the connection when done offline, and seals the removal with the new key', () => {
    const { relay, zeynep, ali, cem, groupId, memberOf } = threePhones();
    removeMember(zeynep, memberOf(cem));
    expect(db(zeynep).rekeyPending).toBe(true);
    expect(groupKeys(zeynep, groupId)).toHaveLength(1);

    relay.sync(zeynep);
    expect(db(zeynep).rekeyPending).toBe(false);
    relay.sync(ali);
    relay.sync(cem);
    expect(listMembers(ali, groupId)).toHaveLength(2);
    expect(listMembers(cem, groupId)).toHaveLength(3);
    expect(relay.groups.get(groupId).log.map(envelopeEpoch).at(-1)).toBe(2);

    function db(device) {
      return device.select().from(syncGroups).where(eq(syncGroups.groupId, groupId)).get();
    }
  });

  it('makes invites made before it useless', () => {
    const { relay, zeynep, cem, groupId, memberOf } = threePhones();
    const oldInvite = createInvite(zeynep, groupId);
    removeMember(zeynep, memberOf(cem));
    relay.sync(zeynep);

    const late = phone('Deniz');
    joinGroupByInvite(late, oldInvite);
    relay.sync(late);
    expect(listPendingJoins(late)).toEqual([{ groupId, name: null, ready: false, expired: true }]);

    const fresh = phone('Ece');
    joinGroupByInvite(fresh, createInvite(zeynep, groupId));
    relay.sync(fresh);
    expect(listPendingJoins(fresh)[0]).toMatchObject({ name: 'Ev Moda', ready: true });

    // The old invite again changes nothing; a new one works on the same phone.
    expect(() => joinGroupByInvite(late, oldInvite)).toThrow(
      expect.objectContaining({ code: 'inviteExpired' }),
    );
    joinGroupByInvite(late, createInvite(zeynep, groupId));
    relay.sync(late);
    expect(listPendingJoins(late)[0]).toMatchObject({ name: 'Ev Moda', expired: false });
  });
});

describe('restoring on a new phone', () => {
  function restore(relay, words) {
    const secret = secretFromPhrase(words.join(' '));
    const { db, keyStore } = createTestDb();
    restoreAccount(db, secret, relay.fetchVault(vaultAccess(secret)));
    relay.sync(db);
    return Object.assign(db, { keyStore });
  }

  it('brings back the profile and every group from the 12 words', () => {
    const { relay, zeynep, groupId, memberOf, ali } = threePhones();
    const ids = [memberOf(zeynep), memberOf(ali)];
    createExpense(zeynep, input(groupId, ids[0], ids, { description: 'Kira' }));
    relay.sync(zeynep);

    const lost = getRecoveryWords(zeynep);
    const newPhone = restore(relay, lost);
    expect(getRecoveryWords(newPhone)).toEqual(lost);
    expect(getAllSettings(newPhone)[SETTING_KEYS.recoveryConfirmed]).toBe('1');
    expect(listGroups(newPhone).map((g) => g.name)).toEqual(['Ev Moda']);
    expect(descriptions(newPhone, groupId)).toEqual(['Kira']);
    expect(listMembers(newPhone, groupId).find((m) => m.isLocalUser).name).toBe('Zeynep');
    expect(listPendingJoins(newPhone)).toEqual([]);

    createExpense(newPhone, input(groupId, ids[0], ids, { description: 'From the new phone' }));
    relay.sync(newPhone);
    relay.sync(ali);
    expect(descriptions(ali, groupId)).toContain('From the new phone');
  });

  it('keeps up with key rotations that happened in the meantime', () => {
    const { relay, zeynep, ali, cem, groupId, memberOf } = threePhones();
    removeMember(ali, memberOf(cem));
    relay.sync(ali);
    // Zeynep's backup still has the old keyring when her phone is lost.
    const newPhone = restore(relay, getRecoveryWords(zeynep));
    expect(groupKeys(newPhone, groupId)).toEqual(groupKeys(ali, groupId));
    expect(isRemovedFromGroup(newPhone, groupId)).toBe(false);
    expect(listMembers(newPhone, groupId)).toHaveLength(2);
  });

  it('refuses a phrase whose backup does not open', () => {
    const { relay, zeynep } = threePhones();
    const secret = secretFromPhrase(getRecoveryWords(zeynep).join(' '));
    const backup = relay.fetchVault(vaultAccess(secret));
    const wrong = secretFromPhrase(getRecoveryWords(phone('Other')).join(' '));
    const { db } = createTestDb();
    expect(() => restoreAccount(db, wrong, backup)).toThrow(
      expect.objectContaining({ code: 'corrupt' }),
    );
    expect(listGroups(db)).toEqual([]);
  });

  it('merges the backups of two phones of the same user', () => {
    const relay = createRelay();
    const first = phone('Zeynep');
    relay.sync(first);
    const second = restore(relay, getRecoveryWords(first));
    const a = createGroup(first, { name: 'A', type: 'home', currency: 'TRY' });
    const b = createGroup(second, { name: 'B', type: 'trip', currency: 'TRY' });
    relay.sync(first);
    relay.sync(second);

    const third = restore(relay, getRecoveryWords(first));
    expect(
      listGroups(third)
        .map((g) => g.id)
        .sort(),
    ).toEqual([a, b].sort());
  });
});

describe('data from before encryption', () => {
  it('gets a key and is sent again sealed; unarrived joins are dropped', () => {
    const { relay, zeynep, groupId } = threePhones();
    const pending = phone('Deniz');
    joinGroupByInvite(pending, createInvite(zeynep, groupId));
    // Simulate the previous version: no keys, nothing sealed.
    for (const db of [zeynep, pending]) {
      db.keyStore.items.clear();
      db.run(sql`UPDATE sync_outbox SET sealed = NULL, sealed_epoch = NULL`);
      forgetGroupDocs(db);
    }
    const tokenBefore = createSyncStore(zeynep).groups()[0].token;

    bootstrapSync(zeynep);
    expect(groupKeys(zeynep, groupId)).toHaveLength(1);
    expect(getRecoveryWords(zeynep)).toHaveLength(12);
    const [upgraded] = createSyncStore(zeynep).groups();
    expect(upgraded.token).not.toBe(tokenBefore);
    expect(upgraded.cursor).toBe(0);
    expect(countPendingChanges(zeynep, groupId)).toBeGreaterThan(0);

    bootstrapSync(pending);
    expect(listPendingJoins(pending)).toEqual([]);
    expect(pending.select().from(groupDocs).all()).toEqual([]);

    relay.groups.clear();
    relay.sync(zeynep);
    const fresh = phone('Ece');
    joinGroupByInvite(fresh, createInvite(zeynep, groupId));
    relay.sync(fresh);
    expect(listPendingJoins(fresh)[0]).toMatchObject({ name: 'Ev Moda', ready: true });
  });
});

describe('deleting everything', () => {
  it('removes the keys along with the data', () => {
    const { zeynep } = threePhones();
    expect(zeynep.keyStore.items.size).toBeGreaterThan(0);
    deleteAllData(zeynep);
    expect(zeynep.keyStore.items.size).toBe(0);
    expect(getIdentity(zeynep)).toBeNull();
  });
});
