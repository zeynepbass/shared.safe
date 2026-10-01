import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { recoveryChallenge } from '@ortak-kasa/core/recovery';
import { confirmRecovery, getRecoveryWords, useDb } from '@/shared/db';
import { reportError } from '@/shared/monitoring';
import { useThemedStyles } from '@/shared/theme';
import { AppText, BottomBar, Button, Header, Screen, useSnackbar } from '@/shared/ui';

// Three random positions of the phrase, each picked from three words. Once all three are right
// the phrase counts as written down: onboarding ends, or the user returns to the settings.
export default function RecoveryVerifyScreen({ mode = 'onboarding' }) {
  const { t } = useTranslation();
  const db = useDb();
  const snackbar = useSnackbar();
  const styles = useThemedStyles(createStyles);
  const onboarding = mode === 'onboarding';
  const challenge = useMemo(() => {
    const words = getRecoveryWords(db);
    return words ? recoveryChallenge(words) : [];
  }, [db]);
  const [picked, setPicked] = useState({});
  const allRight = challenge.length > 0 && challenge.every((c) => picked[c.index] === c.word);

  // Onboarding ends by itself: once the phrase is confirmed the app's main routes open up.
  const finish = () => {
    try {
      confirmRecovery(db);
    } catch (error) {
      reportError(error);
      return;
    }
    if (!onboarding) {
      snackbar.show({ message: t('recovery.verified') });
      router.dismissTo('/settings');
    }
  };

  return (
    <Screen
      header={<Header title={t('recovery.verifyHeader')} />}
      footer={
        <BottomBar>
          <Button
            title={onboarding ? t('recovery.finish') : t('common.done')}
            onPress={finish}
            disabled={!allRight}
            testID="recovery-finish"
          />
        </BottomBar>
      }
    >
      <View style={styles.intro}>
        <AppText variant="heading">{t('recovery.verifyTitle')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('recovery.verifyBody')}
        </AppText>
      </View>

      {challenge.map(({ index, word, choices }, question) => {
        const choice = picked[index];
        const status = choice == null ? null : choice === word ? 'right' : 'wrong';
        return (
          <View key={index} style={styles.question}>
            <View style={styles.questionHead}>
              <AppText variant="overline" color="primary">
                {t('recovery.wordNumber', { number: index + 1 })}
              </AppText>
              {status ? (
                <AppText
                  variant="captionStrong"
                  color={status === 'right' ? 'success' : 'danger'}
                  accessibilityLiveRegion="polite"
                  testID={`recovery-${status}-${question}`}
                >
                  {status === 'right' ? t('recovery.right') : t('recovery.wrong')}
                </AppText>
              ) : null}
            </View>
            <View style={styles.choices} accessibilityRole="radiogroup">
              {choices.map((option, position) => {
                const selected = choice === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setPicked({ ...picked, [index]: option })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    testID={`recovery-choice-${question}-${position}`}
                    accessibilityLabel={t('recovery.choiceLabel', {
                      number: index + 1,
                      word: option,
                    })}
                    style={[
                      styles.choice,
                      selected && (option === word ? styles.right : styles.wrong),
                    ]}
                  >
                    <AppText
                      variant="body"
                      color={selected ? (option === word ? 'success' : 'danger') : 'text'}
                    >
                      {option}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth }) =>
  StyleSheet.create({
    intro: { gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xl },
    question: { gap: spacing.sm, paddingBottom: spacing.xl },
    questionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    choices: { flexDirection: 'row', gap: spacing.sm },
    choice: {
      flex: 1,
      minHeight: layout.inputHeight,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: borderWidth.hairline,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    right: { borderColor: colors.success, backgroundColor: colors.successSoft },
    wrong: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  });
