import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getAllSettings,
  getLocalUser,
  SETTING_KEYS,
  setDefaultCurrency,
  setSetting,
  useDb,
  useDbQuery,
} from '@/shared/db';
import { detectLanguage } from '@/shared/i18n';
import { avatarColors, useThemeContext } from '@/shared/theme';

const SettingsContext = createContext(null);

function loadSettings(db) {
  return { values: getAllSettings(db), user: getLocalUser(db) };
}

export function SettingsProvider({ children }) {
  const db = useDb();
  const { i18n } = useTranslation();
  const { setPreference } = useThemeContext();
  const { data, loading } = useDbQuery(loadSettings, [], ['settings', 'users']);

  const settings = useMemo(() => {
    const values = data?.values ?? {};
    const user = data?.user;
    return {
      loaded: !loading,
      hasProfile: Boolean(user),
      profile: {
        name: user?.name ?? '',
        avatarColor: user?.avatarColor ?? avatarColors[3],
        avatarPath: user?.avatarPath ?? null,
      },
      defaultCurrency: user?.defaultCurrency ?? 'TRY',
      theme: values[SETTING_KEYS.theme] ?? 'system',
      language: values[SETTING_KEYS.language] ?? detectLanguage(),
      recoveryConfirmed: values[SETTING_KEYS.recoveryConfirmed] === '1',
      biometricLock: values[SETTING_KEYS.biometricLock] === '1',
    };
  }, [data, loading]);

  useEffect(() => {
    setPreference(settings.theme);
  }, [settings.theme, setPreference]);

  useEffect(() => {
    if (i18n.language !== settings.language) i18n.changeLanguage(settings.language);
  }, [settings.language, i18n]);

  const update = useCallback(
    (key, value) => {
      if (key === 'defaultCurrency') setDefaultCurrency(db, value);
      else if (typeof value === 'boolean') setSetting(db, SETTING_KEYS[key], value ? 1 : 0);
      else setSetting(db, SETTING_KEYS[key], value);
    },
    [db],
  );

  const value = useMemo(() => ({ ...settings, update }), [settings, update]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
