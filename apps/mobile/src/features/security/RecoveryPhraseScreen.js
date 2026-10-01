import { router } from 'expo-router';
import { Eye, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSettings } from '@/features/settings/SettingsProvider';
import { getRecoveryWords, useDbQuery } from '@/shared/db';
import { useThemedStyles } from '@/shared/theme';
import { AppText, BottomBar, Button, Card, Checkbox, Header, InfoBox, Screen } from '@/shared/ui';

import { authenticate } from './biometrics';

// Shows the 12 words to write down. During onboarding it is the second step and leads to the
// check; from the settings the words stay hidden until the user asks (and, with the app lock on,
// proves it is them).
export default function RecoveryPhraseScreen({ mode = 'onboarding' }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { biometricLock } = useSettings();
  const { data: words } = useDbQuery(getRecoveryWords, [], ['users']);
  const onboarding = mode === 'onboarding';
  const [revealed, setRevealed] = useState(onboarding);
  const [written, setWritten] = useState(false);

  const reveal = async () => {
    const ok =
      !biometricLock ||
      (await authenticate({
        promptMessage: t('recovery.revealPrompt'),
        cancelLabel: t('common.cancel'),
      }));
    if (ok) setRevealed(true);
  };

  const next = () => router.push(onboarding ? '/onboarding/verify' : '/settings/recovery-verify');

  const rows = [];
  for (let i = 0; i < (words?.length ?? 0); i += 2) rows.push([i, i + 1]);

  return (
    <Screen
      header={<Header title={t('recovery.header')} leading={onboarding ? null : 'back'} />}
      footer={
        <BottomBar>
          <View style={styles.confirm}>
            <Checkbox
              checked={written}
              onChange={setWritten}
              accessibilityLabel={t('recovery.written')}
            />
            <Pressable onPress={() => setWritten(!written)} style={styles.flex}>
              <AppText variant="body">{t('recovery.written')}</AppText>
            </Pressable>
          </View>
          <Button title={t('recovery.toVerify')} onPress={next} disabled={!written || !revealed} />
        </BottomBar>
      }
    >
      <View style={styles.intro}>
        {onboarding ? (
          <AppText variant="overline" color="primary">
            {t('onboarding.progress', { current: 2, total: 2 })}
          </AppText>
        ) : null}
        <AppText variant="heading">{t('recovery.title')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('recovery.body')}
        </AppText>
      </View>

      <Card corners padded={false} style={styles.grid}>
        {revealed && words ? (
          rows.map((pair) => (
            <View key={pair[0]} style={styles.row}>
              {pair.map((index) => (
                <View
                  key={index}
                  style={[styles.cell, index % 2 === 0 && styles.cellLeft]}
                  accessible
                  accessibilityLabel={t('recovery.wordLabel', {
                    number: index + 1,
                    word: words[index],
                  })}
                >
                  <AppText variant="mono" color="textMuted" style={styles.number}>
                    {String(index + 1).padStart(2, '0')}
                  </AppText>
                  <AppText variant="bodyStrong" selectable={false}>
                    {words[index]}
                  </AppText>
                </View>
              ))}
            </View>
          ))
        ) : (
          <View style={styles.hidden}>
            <Button
              title={t('recovery.reveal')}
              icon={Eye}
              variant="secondary"
              fullWidth={false}
              onPress={reveal}
            />
          </View>
        )}
      </Card>

      <InfoBox icon={TriangleAlert}>{t('recovery.warning')}</InfoBox>
    </Screen>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    flex: { flex: 1 },
    intro: { gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xl },
    grid: { marginBottom: spacing.xl },
    row: { flexDirection: 'row' },
    cell: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    cellLeft: { borderRightWidth: borderWidth.hairline, borderRightColor: colors.border },
    number: { width: 20 },
    hidden: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.huge },
    confirm: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
  });
