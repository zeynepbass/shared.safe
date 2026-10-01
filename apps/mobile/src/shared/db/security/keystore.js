import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Where keys are kept: the iOS Keychain / Android Keystore through expo-secure-store, readable
// only by this app on this device (never included in backups; the recovery phrase is how keys
// move to a new phone). All access is synchronous so repositories can use it inside a
// transaction.
//
//   get(name) → string | null      set(name, value)      remove(name)

const OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

const secureKeyStore = {
  get: (name) => SecureStore.getItem(name, OPTIONS),
  set: (name, value) => SecureStore.setItem(name, value, OPTIONS),
  remove: (name) => {
    SecureStore.deleteItemAsync(name, OPTIONS).catch((error) =>
      console.warn('Key could not be deleted', error?.message ?? error),
    );
  },
};

// Browsers have no keychain; the web build is for development only.
const webKeyStore = {
  get: (name) => globalThis.localStorage?.getItem(name) ?? null,
  set: (name, value) => globalThis.localStorage?.setItem(name, value),
  remove: (name) => globalThis.localStorage?.removeItem(name),
};

export function createMemoryKeyStore() {
  const items = new Map();
  return {
    get: (name) => items.get(name) ?? null,
    set: (name, value) => items.set(name, value),
    remove: (name) => items.delete(name),
    items,
  };
}

// Tests give every database (every simulated phone) a store of its own.
const attached = new WeakMap();

export function attachKeyStore(db, store) {
  attached.set(db, store);
}

export function keyStoreOf(db) {
  return attached.get(db) ?? (Platform.OS === 'web' ? webKeyStore : secureKeyStore);
}
