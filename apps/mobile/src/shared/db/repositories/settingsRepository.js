import { eq } from 'drizzle-orm';

import { notifyChange } from '../changes';
import { now } from '../ids';
import { settings } from '../schema';

export const SETTING_KEYS = {
  theme: 'app.theme',
  language: 'app.language',
  deviceId: 'device.id',
  // Set once the user has written down and checked their recovery phrase.
  recoveryConfirmed: 'recovery.confirmed',
  biometricLock: 'security.biometricLock',
  // Backup bookkeeping (see sync/vault.js).
  vaultVersion: 'vault.version',
  vaultSaved: 'vault.saved',
  vaultRev: 'vault.rev',
};

export function getAllSettings(db) {
  const rows = db.select().from(settings).all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function getSetting(db, key) {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function upsertSetting(executor, key, value) {
  const updatedAt = now();
  const stored = value == null ? null : String(value);
  executor
    .insert(settings)
    .values({ key, value: stored, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value: stored, updatedAt } })
    .run();
}

export function setSetting(db, key, value) {
  upsertSetting(db, key, value);
  notifyChange(['settings']);
}

export function setSettings(db, entries) {
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(entries)) upsertSetting(tx, key, value);
  });
  notifyChange(['settings']);
}
