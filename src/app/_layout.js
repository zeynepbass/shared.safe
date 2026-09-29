import '@/shared/i18n';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from '@/shared/db';
import { SettingsProvider, useSettings } from '@/features/settings/SettingsProvider';
import { fontAssets, ThemeProvider, useTheme } from '@/shared/theme';
import { SnackbarProvider } from '@/shared/ui';

SplashScreen.preventAutoHideAsync();

const MODAL = { presentation: 'modal' };

function AppStack() {
  const { colors, isDark } = useTheme();
  const { loaded, hasProfile } = useSettings();

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
        <Stack.Screen name="index" />
        {/* Once a profile exists the onboarding routes are gone for good. */}
        <Stack.Protected guard={!hasProfile}>
          <Stack.Screen name="onboarding/index" />
          <Stack.Screen name="onboarding/profile" />
        </Stack.Protected>
        <Stack.Protected guard={hasProfile}>
          <Stack.Screen name="groups/index" />
          <Stack.Screen name="groups/new" options={MODAL} />
          <Stack.Screen name="groups/[groupId]/index" />
          <Stack.Screen name="groups/[groupId]/balances" />
          <Stack.Screen name="groups/[groupId]/activity" />
          <Stack.Screen name="groups/[groupId]/stats" />
          <Stack.Screen name="groups/[groupId]/members/new" options={MODAL} />
          <Stack.Screen name="groups/[groupId]/add-expense" options={MODAL} />
          <Stack.Screen name="groups/[groupId]/expense/[expenseId]" />
          <Stack.Screen name="profile/edit" options={MODAL} />
          <Stack.Screen name="settings" />
        </Stack.Protected>
      </Stack>
    </SnackbarProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <DatabaseProvider>
            <SettingsProvider>
              <AppStack />
            </SettingsProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
