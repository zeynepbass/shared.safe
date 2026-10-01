import sodium from 'libsodium-wrappers-sumo';

import { createCrypto } from '../src/crypto.js';

await sodium.ready;

// The same libsodium API the app gets from react-native-libsodium.
export { sodium };
export const crypto = createCrypto(sodium);
