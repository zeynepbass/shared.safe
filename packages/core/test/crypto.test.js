import { randomUUID } from 'node:crypto';

import {
  CryptoError,
  decodeKeyring,
  encodeKeyring,
  envelopeEpoch,
  fromBase64Url,
  toBase64Url,
} from '../src/crypto.js';
import { crypto, sodium } from './sodium.js';

const bytes = (text) => new TextEncoder().encode(text);
const text = (data) => new TextDecoder().decode(data);
const identity = () => crypto.identityFromSecret(sodium.randombytes_buf(16));

describe('group envelopes', () => {
  const groupId = randomUUID();

  it('round-trip with the newest key and hide the content', () => {
    const keys = [crypto.newGroupKey()];
    const sealed = crypto.sealChange(groupId, keys, bytes('Market 90 TL'));
    expect(text(sealed)).not.toContain('Market');
    expect(envelopeEpoch(sealed)).toBe(1);
    expect(text(crypto.openChange(groupId, keys, sealed))).toBe('Market 90 TL');
  });

  it('never repeat, even for the same content', () => {
    const keys = [crypto.newGroupKey()];
    const a = crypto.sealChange(groupId, keys, bytes('same'));
    const b = crypto.sealChange(groupId, keys, bytes('same'));
    expect(toBase64Url(a)).not.toBe(toBase64Url(b));
  });

  it('stay readable after a rotation, and new ones need the new key', () => {
    const keys = [crypto.newGroupKey()];
    const before = crypto.sealChange(groupId, keys, bytes('old'));
    keys.push(crypto.newGroupKey());
    const after = crypto.sealChange(groupId, keys, bytes('new'));
    expect(envelopeEpoch(after)).toBe(2);
    expect(text(crypto.openChange(groupId, keys, before))).toBe('old');
    // A removed member only has the first key.
    expect(() => crypto.openChange(groupId, keys.slice(0, 1), after)).toThrow(
      expect.objectContaining({ code: 'unknownKey' }),
    );
  });

  it('reject tampering, the wrong key and another group', () => {
    const keys = [crypto.newGroupKey()];
    const sealed = crypto.sealChange(groupId, keys, bytes('x'));
    const tampered = sealed.slice();
    tampered[tampered.length - 1] ^= 1;
    const corrupt = expect.objectContaining({ code: 'corrupt' });
    expect(() => crypto.openChange(groupId, keys, tampered)).toThrow(corrupt);
    expect(() => crypto.openChange(groupId, [crypto.newGroupKey()], sealed)).toThrow(corrupt);
    expect(() => crypto.openChange(randomUUID(), keys, sealed)).toThrow(corrupt);
    expect(() => crypto.openChange(groupId, keys, bytes('nonsense'))).toThrow(CryptoError);
  });
});

describe('keyrings', () => {
  it('encode compactly and decode to the same keys', () => {
    const keys = [crypto.newGroupKey(), crypto.newGroupKey()];
    const encoded = encodeKeyring(keys);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeKeyring(encoded)).toEqual(keys);
    expect(() => decodeKeyring('')).toThrow(CryptoError);
    expect(() => decodeKeyring(toBase64Url(new Uint8Array(31)))).toThrow(CryptoError);
    expect(() => decodeKeyring('not base64!')).toThrow(CryptoError);
  });

  it('derive a relay token that changes with the key and reveals nothing about it', () => {
    const groupId = randomUUID();
    const key = crypto.newGroupKey();
    const token = crypto.relayToken(groupId, key);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(crypto.relayToken(groupId, key)).toBe(token);
    expect(crypto.relayToken(groupId, crypto.newGroupKey())).not.toBe(token);
    expect(crypto.relayToken(randomUUID(), key)).not.toBe(token);
    expect(fromBase64Url(token)).not.toEqual(key);
  });
});

describe('identities', () => {
  it('are the same for the same recovery secret and differ otherwise', () => {
    const secret = sodium.randombytes_buf(16);
    const a = crypto.identityFromSecret(secret);
    const b = crypto.identityFromSecret(secret.slice());
    expect(b.publicKey).toEqual(a.publicKey);
    expect(b.vault).toEqual(a.vault);
    expect(a.vault.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(identity().publicKey).not.toEqual(a.publicKey);
  });

  it('open only the key envelopes sealed to them', () => {
    const groupId = randomUUID();
    const zeynep = identity();
    const ali = identity();
    const removed = identity();
    const key = crypto.newGroupKey();
    const envelopes = [zeynep, ali].map((who) =>
      crypto.sealKeyEnvelope(who.publicKey, { groupId, epoch: 2, key }),
    );
    expect(crypto.openKeyEnvelopes(ali, groupId, envelopes)).toEqual({ epoch: 2, key });
    expect(crypto.openKeyEnvelopes(removed, groupId, envelopes)).toBeNull();
    // An envelope for another group is not accepted for this one.
    expect(crypto.openKeyEnvelopes(ali, randomUUID(), envelopes)).toBeNull();
  });

  it('keep a vault only they can open', () => {
    const me = identity();
    const sealed = crypto.sealVault(me.vault.key, { groups: [{ id: 'x' }] });
    expect(crypto.openVault(me.vault.key, sealed)).toEqual({ groups: [{ id: 'x' }] });
    expect(() => crypto.openVault(identity().vault.key, sealed)).toThrow(
      expect.objectContaining({ code: 'corrupt' }),
    );
  });
});
