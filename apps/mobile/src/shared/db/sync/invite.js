import { decodeKeyring, encodeKeyring } from '@ortak-kasa/core/crypto';

// An invite is a link carrying the group id and the group's keys (all of them, so the history
// sealed before the newest key stays readable); the QR code holds the same text. The relay
// token is derived from the keys. Anyone with the invite can read and join the group, so it is
// only ever shown to the user, never logged or sent anywhere by the app.
const PREFIX = 'ortakkasa://join';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeInvite({ groupId, keys }) {
  return `${PREFIX}?g=${groupId}&k=${encodeKeyring(keys)}`;
}

// Accepts the link itself or text around it (e.g. a pasted message). Returns null if invalid.
export function parseInvite(text) {
  const match = /ortakkasa:\/\/join\?([^\s]+)/.exec(text?.trim() ?? '');
  if (!match) return null;
  const params = Object.fromEntries(
    match[1].split('&').map((pair) => {
      const [key, ...rest] = pair.split('=');
      return [key, rest.join('=')];
    }),
  );
  if (!UUID.test(params.g ?? '')) return null;
  try {
    return { groupId: params.g.toLowerCase(), keys: decodeKeyring(params.k ?? '') };
  } catch {
    return null;
  }
}
