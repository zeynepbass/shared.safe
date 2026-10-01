import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useSync } from '@/features/sync/SyncProvider';
import { normalizePhrase, RECOVERY_WORD_COUNT, secretFromPhrase } from '@ortak-kasa/core/recovery';
import { restoreAccount, useDb, vaultAccess } from '@/shared/db';
import { useThemedStyles } from '@/shared/theme';
import { AppText, BottomBar, Button, Header, InfoBox, Input, Screen } from '@/shared/ui';

// A new phone: the 12 words open the backup kept on the relay, which brings back the profile and
// every group. Once the profile exists the app moves on by itself.
export default function RestoreScreen() {
  const { t } = useTranslation();
  const db = useDb();
  const sync = useSync();
  const styles = useThemedStyles(createStyles);
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const count = normalizePhrase(phrase).split(' ').filter(Boolean).length;

  const restore = async () => {
    const secret = secretFromPhrase(phrase);
    if (!secret) {
      setError(t('restore.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const backup = await sync.fetchVault(vaultAccess(secret));
      if (!backup.data) {
        setError(t('restore.notFound'));
        return;
      }
      restoreAccount(db, secret, backup);
    } catch (e) {
      if (e.code === 'corrupt' || e.code === 'unsupportedBackup') setError(t('restore.unreadable'));
      else if (e.message === 'offline' || e.message === 'timeout' || e.message === 'closed') {
        setError(t('restore.offline'));
      } else {
        console.error(e);
        setError(t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      keyboard
      header={<Header title={t('restore.header')} />}
      footer={
        <BottomBar>
          <Button
            title={t('restore.submit')}
            onPress={restore}
            loading={busy}
            disabled={count !== RECOVERY_WORD_COUNT}
          />
        </BottomBar>
      }
    >
      <View style={styles.intro}>
        <AppText variant="heading">{t('restore.title')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('restore.body')}
        </AppText>
      </View>
      <View style={styles.form}>
        <Input
          label={t('restore.label')}
          placeholder={t('restore.placeholder')}
          value={phrase}
          onChangeText={(text) => {
            setPhrase(text);
            setError(null);
          }}
          error={error}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          importantForAutofill="no"
          textContentType="none"
          inputStyle={styles.input}
        />
        <AppText variant="caption" color="textMuted">
          {t('restore.count', { count, total: RECOVERY_WORD_COUNT })}
        </AppText>
        <InfoBox>{t('restore.hint')}</InfoBox>
      </View>
    </Screen>
  );
}

const createStyles = ({ spacing }) =>
  StyleSheet.create({
    intro: { gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xl },
    form: { gap: spacing.md },
    input: { minHeight: 120, alignSelf: 'stretch', textAlignVertical: 'top' },
  });
