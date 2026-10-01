import { recoveryWords } from '../security/keys';
import { crypto } from '../security/sodium';
import { SETTING_KEYS, setSetting } from './settingsRepository';

// The 12 words of the user's recovery phrase, or null before a profile exists.
export function getRecoveryWords(db) {
  return recoveryWords(db);
}

// The user has written the phrase down and picked the right words back.
export function confirmRecovery(db) {
  setSetting(db, SETTING_KEYS.recoveryConfirmed, 1);
}

// What the relay needs to hand over the backup that belongs to a recovery secret.
export function vaultAccess(secret) {
  const { vault } = crypto.identityFromSecret(secret);
  return { vault: vault.id, token: vault.token };
}
