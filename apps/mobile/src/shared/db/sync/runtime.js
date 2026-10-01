import * as Crypto from 'expo-crypto';

import { initAutomerge } from '@ortak-kasa/core/automerge';

// Minimal UTF-8 decoder for engines without TextDecoder. `fatal` is honoured because Automerge
// relies on invalid input throwing.
class Utf8Decoder {
  constructor(_label, { fatal = false } = {}) {
    this.fatal = fatal;
  }

  decode(input = new Uint8Array()) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input.buffer ?? input);
    let out = '';
    for (let i = 0; i < bytes.length;) {
      const b = bytes[i];
      const size = b < 0x80 ? 1 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 0;
      if (size === 0 || i + size > bytes.length) {
        if (this.fatal) throw new TypeError('Invalid UTF-8');
        out += '�';
        i += 1;
        continue;
      }
      let code = size === 1 ? b : b & (0xff >> (size + 1));
      for (let k = 1; k < size; k += 1) {
        const next = bytes[i + k];
        if ((next & 0xc0) !== 0x80) {
          if (this.fatal) throw new TypeError('Invalid UTF-8');
          code = 0xfffd;
          break;
        }
        code = (code << 6) | (next & 0x3f);
      }
      out += String.fromCodePoint(code);
      i += size;
    }
    return out;
  }
}

let ready = null;

// Hermes has no WebAssembly, so Automerge's core runs on polywasm there (a WebAssembly
// interpreter in plain JS). Everything else in the app talks to Automerge only through core.
export function setupAutomerge() {
  ready ??= (async () => {
    globalThis.crypto ??= {};
    globalThis.crypto.getRandomValues ??= (array) => Crypto.getRandomValues(array);
    globalThis.TextDecoder ??= Utf8Decoder;
    if (typeof globalThis.WebAssembly === 'undefined') {
      const { WebAssembly } = require('polywasm');
      globalThis.WebAssembly = WebAssembly;
    }
    await initAutomerge();
  })();
  return ready;
}
