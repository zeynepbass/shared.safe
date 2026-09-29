import '@/shared/i18n';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from '@/db';
import { SettingsProvider, useSettings } from '@/features/settings/SettingsProvider';
import { fontAssets, ThemeProvider, useTheme } from '@/shared/theme';
import { SnackbarProvider } from '@/shared/ui';

SplashScreen.preventAutoHideAsync();

const MODAL = { presentation: 'modal' };

function AppStack() {
  const { colors, isDark } = useTheme();
  const { loaded } = useSettings();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg);
  }, [colors.bg]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SnackbarProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="groups/new" options={MODAL} />
        <Stack.Screen name="groups/[groupId]/members/new" options={MODAL} />
        <Stack.Screen name="groups/[groupId]/add-expense" options={MODAL} />
        <Stack.Screen name="profile/edit" options={MODAL} />
      </Stack>
    </SnackbarProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <DatabaseProvider>
          <SettingsProvider>
            <AppStack />
          </SettingsProvider>
        </DatabaseProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
