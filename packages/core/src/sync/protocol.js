// Wire format between devices and the relay: JSON text frames, binary payloads as base64.
// The relay only ever sees group and vault ids, access tokens, sequence numbers and opaque,
// end-to-end encrypted `data` blobs (see crypto.js).
//
// device → relay
//   { t: 'hello', v, device }
//   { t: 'sub',  group, token, since }         since = highest seq already applied
//   { t: 'push', group, items: [{ id, data }] } id = the device's own id for the change
//   { t: 'rekey', group, next, envelopes }      replace the group's token with `next`; envelopes
//                                               carry the new key to the remaining members
//   { t: 'vault_get', vault, token }
//   { t: 'vault_put', vault, token, rev, data } stored only if `rev` is the current revision
//   { t: 'file_put', group, id, data }          a sealed file of a subscribed group (a receipt
//                                               photo); the id is chosen by the device and the
//                                               first file stored under it stays
//   { t: 'file_get', group, id }
// relay → device
//   { t: 'welcome', v }
//   { t: 'changes', group, items: [{ seq, data }] }   catch-up pages, then live updates
//   { t: 'sub_ok', group, head }                      sent after the catch-up pages
//   { t: 'ack', group, ids, seq }                     push stored; seq = head after storing
//   { t: 'rekey_ok', group }
//   { t: 'rekeyed', group, envelopes }  the token this device used was replaced; the new key is
//                                       in one of the envelopes if the device is still a member
//   { t: 'vault', vault, rev, data }    current contents (data null if never stored); also the
//                                       answer to a vault_put whose rev was stale
//   { t: 'vault_ok', vault, rev }
//   { t: 'file_ok', group, id }
//   { t: 'file', group, id, data }      data null if the relay has no such file (yet)
//   { t: 'error', code, group?, vault?, file? }

export const PROTOCOL_VERSION = 2;
export const MAX_FRAME_BYTES = 1024 * 1024;
export const MAX_PUSH_BYTES = 512 * 1024;
export const PAGE_SIZE = 200;
export const MAX_ENVELOPES = 256;
export const MAX_VAULT_BYTES = 256 * 1024;
// A file travels in one frame. This is the limit on its base64 form; MAX_FILE_PLAIN_BYTES is
// what a device may seal so that the result fits.
export const MAX_FILE_BYTES = 900 * 1024;
export const MAX_FILE_PLAIN_BYTES = 640 * 1024;

export class ProtocolError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

const isGroup = (v) => typeof v === 'string' && UUID.test(v);
const isSeq = (v) => Number.isSafeInteger(v) && v >= 0;
const isData = (v) => typeof v === 'string' && v.length > 0 && v.length % 4 === 0 && B64.test(v);
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 128;
const isToken = (v) => typeof v === 'string' && TOKEN.test(v);
const isEnvelopes = (v) => Array.isArray(v) && v.length <= MAX_ENVELOPES && v.every(isData);

const CLIENT_MESSAGES = {
  hello: (m) => m.v === PROTOCOL_VERSION && isId(m.device),
  sub: (m) => isGroup(m.group) && isToken(m.token) && isSeq(m.since),
  push: (m) =>
    isGroup(m.group) &&
    Array.isArray(m.items) &&
    m.items.length > 0 &&
    m.items.every((i) => isId(i?.id) && isData(i?.data)),
  rekey: (m) => isGroup(m.group) && isToken(m.next) && isEnvelopes(m.envelopes),
  vault_get: (m) => isGroup(m.vault) && isToken(m.token),
  vault_put: (m) =>
    isGroup(m.vault) &&
    isToken(m.token) &&
    isSeq(m.rev) &&
    isData(m.data) &&
    m.data.length <= MAX_VAULT_BYTES,
  file_put: (m) =>
    isGroup(m.group) && isGroup(m.id) && isData(m.data) && m.data.length <= MAX_FILE_BYTES,
  file_get: (m) => isGroup(m.group) && isGroup(m.id),
};

const SERVER_MESSAGES = {
  welcome: (m) => m.v === PROTOCOL_VERSION,
  changes: (m) =>
    isGroup(m.group) &&
    Array.isArray(m.items) &&
    m.items.every((i) => isSeq(i?.seq) && isData(i?.data)),
  sub_ok: (m) => isGroup(m.group) && isSeq(m.head),
  ack: (m) => isGroup(m.group) && Array.isArray(m.ids) && isSeq(m.seq),
  rekey_ok: (m) => isGroup(m.group),
  rekeyed: (m) => isGroup(m.group) && isEnvelopes(m.envelopes),
  vault: (m) => isGroup(m.vault) && isSeq(m.rev) && (m.data === null || isData(m.data)),
  vault_ok: (m) => isGroup(m.vault) && isSeq(m.rev),
  file_ok: (m) => isGroup(m.group) && isGroup(m.id),
  file: (m) => isGroup(m.group) && isGroup(m.id) && (m.data === null || isData(m.data)),
  error: (m) => typeof m.code === 'string',
};

function parseWith(schemas, text) {
  if (typeof text !== 'string' || text.length > MAX_FRAME_BYTES)
    throw new ProtocolError('tooLarge');
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    throw new ProtocolError('malformed');
  }
  const check = schemas[message?.t];
  if (!check || !check(message)) throw new ProtocolError('malformed');
  return message;
}

export const parseClientMessage = (text) => parseWith(CLIENT_MESSAGES, text);
export const parseServerMessage = (text) => parseWith(SERVER_MESSAGES, text);
export const encodeMessage = (message) => JSON.stringify(message);
