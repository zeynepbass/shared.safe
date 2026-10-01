import sodium from 'react-native-libsodium';

import { createCrypto } from '@ortak-kasa/core/crypto';

// libsodium runs natively on iOS and Android; the web build loads its WebAssembly version, which
// must finish loading (setupSodium) before first use.
export const crypto = createCrypto(sodium);

export const randomBytes = (length) => sodium.randombytes_buf(length);

export const setupSodium = () => sodium.ready;
