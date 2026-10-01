import { fromBase64, toBase64 } from './sync/base64.js';

// End-to-end encryption for group data. Everything that leaves a device for the relay goes
// through here; the relay only ever stores and forwards the resulting envelopes.
//
// Each group has a keyring: 32-byte keys numbered from epoch 1. New data is sealed with the
// newest key; older keys are kept so history stays readable. Removing a member adds a key, which
// is handed only to the remaining members (sealed to their identity keys), so the removed member
// cannot read anything written afterwards.
//
// The relay token that lets a device read and write a group's log is derived from the newest
// key, so a key rotation also locks anyone without the new key out of the relay.
//
// Every user has an identity derived from their recovery phrase: an X25519 key pair (the target
// of key envelopes) and the id, token and key of their vault, an encrypted backup of their
// keyrings kept on the relay for restoring on a new device.
//
// libsodium is passed in (react-native-libsodium on devices, libsodium-wrappers in Node), so
// this module runs the same everywhere.

export const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const ENVELOPE_VERSION = 1;
const HEADER_BYTES = 5; // version (1) + epoch (4, big endian)
const RECOVERY_CONTEXT = 'okrecovr'; // crypto_kdf contexts are exactly 8 characters
const SUBKEY = { identity: 1, vaultKey: 2, vaultToken: 3, vaultId: 4 };

export class CryptoError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CryptoError';
    this.code = code;
  }
}

const utf8 = (text) => new TextEncoder().encode(text);
const fromUtf8 = (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

export const toBase64Url = (bytes) =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function fromBase64Url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) {
    throw new CryptoError('malformed');
  }
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function header(epoch) {
  const bytes = new Uint8Array(HEADER_BYTES);
  bytes[0] = ENVELOPE_VERSION;
  new DataView(bytes.buffer).setUint32(1, epoch);
  return bytes;
}

function uuidFrom(bytes) {
  const hex = Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// A keyring travels (in invites and backups) as one base64url string: the keys in epoch order.
export function encodeKeyring(keys) {
  return toBase64Url(concat(...keys));
}

export function decodeKeyring(text) {
  let bytes;
  try {
    bytes = fromBase64Url(text);
  } catch {
    throw new CryptoError('malformed');
  }
  if (bytes.length === 0 || bytes.length % KEY_BYTES !== 0) throw new CryptoError('malformed');
  const keys = [];
  for (let i = 0; i < bytes.length; i += KEY_BYTES) keys.push(bytes.slice(i, i + KEY_BYTES));
  return keys;
}

// The epoch an envelope was sealed with, without opening it.
export function envelopeEpoch(envelope) {
  if (!(envelope instanceof Uint8Array) || envelope.length < HEADER_BYTES) return null;
  if (envelope[0] !== ENVELOPE_VERSION) return null;
  return new DataView(envelope.buffer, envelope.byteOffset).getUint32(1);
}

export function createCrypto(sodium) {
  const aeadSeal = (plaintext, ad, key) => {
    const nonce = sodium.randombytes_buf(NONCE_BYTES);
    return concat(
      nonce,
      sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, ad, null, nonce, key),
    );
  };

  const aeadOpen = (sealed, ad, key) => {
    if (sealed.length <= NONCE_BYTES) throw new CryptoError('corrupt');
    try {
      return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        sealed.slice(NONCE_BYTES),
        ad,
        sealed.slice(0, NONCE_BYTES),
        key,
      );
    } catch {
      throw new CryptoError('corrupt');
    }
  };

  // Binds an envelope to its group and epoch, so it cannot be replayed into another group.
  const changeAd = (groupId, epoch) => concat(header(epoch), utf8(`ortakkasa/change/${groupId}`));

  return {
    newGroupKey: () => sodium.randombytes_buf(KEY_BYTES),

    relayToken: (groupId, key) =>
      toBase64Url(sodium.crypto_generichash(32, utf8(`ortakkasa/relay/${groupId}`), key)),

    // Seals one change (or any group payload) with the newest key in `keys`.
    sealChange(groupId, keys, plaintext) {
      const epoch = keys.length;
      if (epoch === 0) throw new CryptoError('noKey');
      return concat(header(epoch), aeadSeal(plaintext, changeAd(groupId, epoch), keys[epoch - 1]));
    },

    openChange(groupId, keys, envelope) {
      const epoch = envelopeEpoch(envelope);
      if (epoch === null) throw new CryptoError('corrupt');
      const key = keys[epoch - 1];
      if (!key) throw new CryptoError('unknownKey');
      return aeadOpen(envelope.slice(HEADER_BYTES), changeAd(groupId, epoch), key);
    },

    // Everything a recovery secret (the 16 bytes behind the 12 words) stands for.
    identityFromSecret(secret) {
      const root = sodium.crypto_generichash(32, secret, utf8('ortakkasa/recovery'));
      const derive = (id, length = 32) =>
        sodium.crypto_kdf_derive_from_key(length, id, RECOVERY_CONTEXT, root);
      const pair = sodium.crypto_box_seed_keypair(derive(SUBKEY.identity));
      return {
        publicKey: pair.publicKey,
        privateKey: pair.privateKey,
        vault: {
          id: uuidFrom(derive(SUBKEY.vaultId, 16)),
          token: toBase64Url(derive(SUBKEY.vaultToken)),
          key: derive(SUBKEY.vaultKey),
        },
      };
    },

    // A new group key for one member, readable only with their identity's private key.
    sealKeyEnvelope(recipientPublicKey, { groupId, epoch, key }) {
      const body = JSON.stringify({ g: groupId, e: epoch, k: toBase64Url(key) });
      return sodium.crypto_box_seal(utf8(body), recipientPublicKey);
    },

    // Returns { epoch, key } from the first envelope meant for `identity` and this group, or null
    // when none is (the user is no longer in the group).
    openKeyEnvelopes(identity, groupId, envelopes) {
      for (const envelope of envelopes) {
        let body;
        try {
          body = JSON.parse(
            fromUtf8(
              sodium.crypto_box_seal_open(envelope, identity.publicKey, identity.privateKey),
            ),
          );
        } catch {
          continue;
        }
        if (body?.g !== groupId || !Number.isSafeInteger(body.e) || body.e < 1) continue;
        const key = fromBase64Url(body.k);
        if (key.length === KEY_BYTES) return { epoch: body.e, key };
      }
      return null;
    },

    sealVault(vaultKey, value) {
      return aeadSeal(utf8(JSON.stringify(value)), utf8('ortakkasa/vault'), vaultKey);
    },

    openVault(vaultKey, sealed) {
      const plaintext = aeadOpen(sealed, utf8('ortakkasa/vault'), vaultKey);
      try {
        return JSON.parse(fromUtf8(plaintext));
      } catch {
        throw new CryptoError('corrupt');
      }
    },
  };
}
