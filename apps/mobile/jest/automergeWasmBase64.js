// Jest does not transform node_modules ESM; this gives tests the same export from the .wasm file.
const fs = require('fs');

module.exports = {
  automergeWasmBase64: fs
    .readFileSync(require.resolve('@automerge/automerge/automerge.wasm'))
    .toString('base64'),
};
