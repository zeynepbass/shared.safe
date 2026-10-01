jest.mock('expo-crypto', () => {
  const crypto = require('crypto');
  return {
    randomUUID: () => crypto.randomUUID(),
    getRandomBytes: (size) => new Uint8Array(crypto.randomBytes(size)),
    getRandomValues: (array) => crypto.getRandomValues(array),
  };
});

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  getItem: () => {
    throw new Error('Tests use the key store attached by createTestDb');
  },
  setItem: () => {
    throw new Error('Tests use the key store attached by createTestDb');
  },
  deleteItemAsync: async () => {},
}));

beforeAll(() =>
  Promise.all([
    require('@ortak-kasa/core/automerge').initAutomerge(),
    require('libsodium-wrappers-sumo').ready,
  ]),
);
