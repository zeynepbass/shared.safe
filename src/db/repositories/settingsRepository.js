import { notifyChange } from '../changes';

export const SETTING_KEYS = {
  profileName: 'profile.name',
  profileColor: 'profile.color',
  defaultCurrency: 'profile.currency',
  theme: 'app.theme',
  language: 'app.language',
  onboarded: 'app.onboarded',
};

export async function getAllSettings(db) {
  const rows = await db.getAllAsync('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function getSetting(db, key) {
  const row = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

async function upsert(executor, key, value) {
  await executor.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value == null ? null : String(value)],
  );
}

export async function setSetting(db, key, value) {
  await upsert(db, key, value);
  notifyChange(['settings']);
}

export async function setSettings(db, entries) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const [key, value] of Object.entries(entries)) {
      await upsert(txn, key, value);
    }
  });
  notifyChange(['settings']);
}

export async function saveProfile(db, { name, color, currency, completeOnboarding = false }) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await upsert(txn, SETTING_KEYS.profileName, name);
    await upsert(txn, SETTING_KEYS.profileColor, color);
    if (currency) await upsert(txn, SETTING_KEYS.defaultCurrency, currency);
    if (completeOnboarding) await upsert(txn, SETTING_KEYS.onboarded, '1');
    await txn.runAsync('UPDATE members SET name = ?, color = ? WHERE is_self = 1', [name, color]);
  });
  notifyChange(['settings', 'members']);
}
