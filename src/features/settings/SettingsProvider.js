import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getAllSettings, SETTING_KEYS, setSetting, useDbQuery } from '@/db';
import { detectLanguage } from '@/shared/i18n';
import { avatarColors, useThemeContext } from '@/shared/theme';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const db = useSQLiteContext();
  const { i18n } = useTranslation();
  const { setPreference } = useThemeContext();
  const { data: raw, loading } = useDbQuery(getAllSettings, [], ['settings']);

  const settings = useMemo(() => {
    const values = raw ?? {};
    return {
      loaded: !loading,
      onboarded: values[SETTING_KEYS.onboarded] === '1',
      profile: {
        name: values[SETTING_KEYS.profileName] ?? '',
        color: values[SETTING_KEYS.profileColor] ?? avatarColors[3],
      },
      defaultCurrency: values[SETTING_KEYS.defaultCurrency] ?? 'TRY',
      theme: values[SETTING_KEYS.theme] ?? 'system',
      language: values[SETTING_KEYS.language] ?? detectLanguage(),
    };
  }, [raw, loading]);

  useEffect(() => {
    setPreference(settings.theme);
  }, [settings.theme, setPreference]);

  useEffect(() => {
    if (i18n.language !== settings.language) i18n.changeLanguage(settings.language);
  }, [settings.language, i18n]);

  const update = useCallback((key, value) => setSetting(db, SETTING_KEYS[key], value), [db]);

  const value = useMemo(() => ({ ...settings, update }), [settings, update]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
