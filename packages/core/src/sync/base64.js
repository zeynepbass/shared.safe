// Dependency-free base64 for Uint8Array, identical on Node, Hermes and browsers.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128).fill(255);
for (let i = 0; i < ALPHABET.length; i += 1) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function toBase64(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += `${ALPHABET[n >> 18]}${ALPHABET[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${ALPHABET[n >> 18]}${ALPHABET[(n >> 12) & 63]}${ALPHABET[(n >> 6) & 63]}=`;
  }
  return out;
}

export function fromBase64(text) {
  if (typeof text !== 'string' || text.length % 4 !== 0) throw new Error('Invalid base64');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const chars = [0, 1, 2, 3].map((k) => text.charCodeAt(i + k));
    const values = chars.map((c, k) => {
      if (c === 61 && i + k >= text.length - padding) return 0;
      const v = c < 128 ? LOOKUP[c] : 255;
      if (v === 255) throw new Error('Invalid base64');
      return v;
    });
    const n = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    if (o < out.length) out[o++] = n >> 16;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
