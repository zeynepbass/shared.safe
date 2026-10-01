import { Lock } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings } from '@/features/settings/SettingsProvider';
import { useThemedStyles } from '@/shared/theme';
import { AppText, BrandBar, Button, FigureBox, Icon } from '@/shared/ui';

import { authenticate } from './biometrics';

// How long the app may sit in the background before it asks again.
const GRACE_MS = 30_000;

// With the lock on, the app starts locked and locks again after a while in the background. While
// it is not in the foreground its content is covered, so the app switcher shows nothing either.
// The screens stay mounted underneath, so unlocking returns to where the user was.
export function AppLock({ children }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { biometricLock } = useSettings();
  const [lockedState, setLocked] = useState(biometricLock);
  const [active, setActive] = useState(AppState.currentState === 'active');
  // Bumped when the app comes back from the background: the moment to ask again.
  const [wake, setWake] = useState(0);
  const prompting = useRef(false);
  const leftAt = useRef(null);
  // Turning the lock off unlocks; turning it on does not lock the user out mid-use.
  const locked = biometricLock && lockedState;

  // One system prompt at a time; the lock lifts only when it succeeds.
  const unlock = useCallback(() => {
    if (prompting.current) return;
    prompting.current = true;
    authenticate({ promptMessage: t('lock.prompt'), cancelLabel: t('common.cancel') }).then(
      (ok) => {
        prompting.current = false;
        if (ok) setLocked(false);
      },
    );
  }, [t]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
      if (state === 'background') leftAt.current = Date.now();
      if (state === 'active' && leftAt.current !== null) {
        if (Date.now() - leftAt.current >= GRACE_MS) setLocked(true);
        leftAt.current = null;
        setWake((n) => n + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  // Ask right away on launch and on return from the background. Not on every return to 'active':
  // the system prompt itself makes the app inactive for a moment, so a cancelled prompt would
  // reopen forever. After a cancel the button asks again.
  useEffect(() => {
    if (locked) unlock();
  }, [locked, wake, unlock]);

  const covered = biometricLock && (locked || !active);

  return (
    <View style={styles.flex}>
      {children}
      {covered ? (
        <SafeAreaView style={styles.cover} accessibilityViewIsModal>
          <BrandBar />
          <View style={styles.content}>
            <FigureBox size={96}>
              <Icon icon={Lock} size={36} color="primary" strokeWidth={1.5} />
            </FigureBox>
            <AppText variant="heading" style={styles.center}>
              {t('lock.title')}
            </AppText>
            <AppText variant="body" color="textMuted" style={styles.center}>
              {t('lock.body')}
            </AppText>
          </View>
          {locked ? (
            <View style={styles.footer}>
              <Button title={t('lock.unlock')} onPress={unlock} />
            </View>
          ) : null}
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const createStyles = ({ colors, spacing, layout }) =>
  StyleSheet.create({
    flex: { flex: 1 },
    cover: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
      paddingHorizontal: layout.gutter,
    },
    center: { textAlign: 'center', maxWidth: layout.readableWidth },
    footer: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xl },
  });
