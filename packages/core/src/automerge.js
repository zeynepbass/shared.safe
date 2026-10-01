import * as Automerge from '@automerge/automerge/slim';
import { automergeWasmBase64 } from '@automerge/automerge/automerge.wasm.base64.js';

export { Automerge };

let ready = null;

// Loads Automerge's WebAssembly core once. Environments without WebAssembly (Hermes) must
// install a polyfill on globalThis before calling this.
export function initAutomerge() {
  ready ??= Automerge.initializeBase64Wasm(automergeWasmBase64);
  return ready;
}
