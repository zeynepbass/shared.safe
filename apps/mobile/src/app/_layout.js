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
import { AppLock } from '@/features/security/AppLock';
import { SettingsProvider, useSettings } from '@/features/settings/SettingsProvider';
import { SyncProvider } from '@/features/sync/SyncProvider';
import { fontAssets, ThemeProvider, useTheme } from '@/shared/theme';
import { SnackbarProvider } from '@/shared/ui';

SplashScreen.preventAutoHideAsync();

const MODAL = { presentation: 'modal' };
const FULL_SCREEN = { presentation: 'fullScreenModal', animation: 'fade' };

function AppStack() {
  const { colors, isDark } = useTheme();
  const { loaded, hasProfile, recoveryConfirmed } = useSettings();
  const ready = hasProfile && recoveryConfirmed;

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
      <AppLock>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" />
          {/* Onboarding is two steps (profile, recovery phrase), or restoring from a phrase; once
            done its routes are gone for good. */}
          <Stack.Protected guard={!hasProfile}>
            <Stack.Screen name="onboarding/index" />
            <Stack.Screen name="onboarding/profile" />
            <Stack.Screen name="onboarding/restore" />
          </Stack.Protected>
          <Stack.Protected guard={hasProfile && !recoveryConfirmed}>
            <Stack.Screen name="onboarding/recovery" />
            <Stack.Screen name="onboarding/verify" />
          </Stack.Protected>
          <Stack.Protected guard={ready}>
            <Stack.Screen name="groups/index" />
            <Stack.Screen name="groups/new" options={MODAL} />
            <Stack.Screen name="groups/join" options={MODAL} />
            <Stack.Screen name="groups/scan" options={FULL_SCREEN} />
            <Stack.Screen name="join" />
            <Stack.Screen name="groups/[groupId]/invite" options={MODAL} />
            <Stack.Screen name="groups/[groupId]/index" />
            <Stack.Screen name="groups/[groupId]/balances" />
            <Stack.Screen name="groups/[groupId]/activity" />
            <Stack.Screen name="groups/[groupId]/stats" />
            <Stack.Screen name="groups/[groupId]/members/index" />
            <Stack.Screen name="groups/[groupId]/members/new" options={MODAL} />
            <Stack.Screen name="groups/[groupId]/add-expense" options={MODAL} />
            <Stack.Screen name="groups/[groupId]/expense/[expenseId]/index" />
            <Stack.Screen name="groups/[groupId]/expense/[expenseId]/conflict" />
            <Stack.Screen name="profile/edit" options={MODAL} />
            <Stack.Screen name="settings/index" />
            <Stack.Screen name="settings/recovery" />
            <Stack.Screen name="settings/recovery-verify" />
          </Stack.Protected>
        </Stack>
      </AppLock>
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
              <SyncProvider>
                <AppStack />
              </SyncProvider>
            </SettingsProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
