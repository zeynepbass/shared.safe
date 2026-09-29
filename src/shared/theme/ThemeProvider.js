import { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  avatarColors,
  borderWidth,
  fontFamily,
  layout,
  palette,
  radius,
  spacing,
  typography,
} from './tokens';

const ThemeContext = createContext(null);

export function buildTheme(scheme) {
  return {
    scheme,
    isDark: scheme === 'dark',
    colors: palette[scheme],
    avatarColors,
    spacing,
    layout,
    radius,
    borderWidth,
    fontFamily,
    typography,
  };
}

export function ThemeProvider({ initialPreference = 'system', children }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState(initialPreference);

  const scheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ theme: buildTheme(scheme), preference, setPreference }),
    [scheme, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeContext must be used inside ThemeProvider');
  }
  return ctx;
}

export function useTheme() {
  return useThemeContext().theme;
}

export function useThemedStyles(factory) {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
