import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  Cloud,
  Coins,
  Download,
  KeyRound,
  Languages,
  Palette,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { authenticate, biometricSupport } from '@/features/security/biometrics';
import { useSync } from '@/features/sync/SyncProvider';
import { useDb } from '@/shared/db';
import { isoFromTimestamp } from '@/shared/lib/dates';
import { useDateFormat } from '@/shared/lib/useDateFormat';
import { SUPPORTED_LANGUAGES } from '@/shared/i18n';
import { CURRENCIES, CURRENCY_CODES } from '@ortak-kasa/core/money';
import { reportError } from '@/shared/monitoring';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  Icon,
  ListItem,
  OptionSheet,
  Screen,
  Header,
  SectionHeader,
  SegmentedControl,
  Switch,
  SyncBadge,
  useSnackbar,
} from '@/shared/ui';

import { exportCsv, wipeDevice } from './dataActions';
import { useSettings } from './SettingsProvider';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const db = useDb();
  const snackbar = useSnackbar();
  const settings = useSettings();
  const sync = useSync();
  const dates = useDateFormat();
  const lastSynced = sync.lastSyncedAt
    ? t('settings.lastSynced', {
        time: `${dates.short(isoFromTimestamp(sync.lastSyncedAt))} ${dates.time(sync.lastSyncedAt)}`,
      })
    : t('settings.neverSynced');
  const [sheet, setSheet] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [biometrics, setBiometrics] = useState({ available: false, method: 'biometric' });

  useEffect(() => {
    biometricSupport().then(setBiometrics);
  }, []);

  // Turning the lock on or off both need a successful check, so nobody else can change it.
  const toggleLock = async (enabled) => {
    if (enabled && !biometrics.available) {
      Alert.alert(t('settings.lockUnavailableTitle'), t('settings.lockUnavailableBody'));
      return;
    }
    const ok = await authenticate({
      promptMessage: enabled ? t('settings.lockEnablePrompt') : t('settings.lockDisablePrompt'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) settings.update('biometricLock', enabled);
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const result = await exportCsv(db, t);
      if (result === 'empty') snackbar.show({ message: t('settings.exportEmpty') });
      if (result === 'unavailable') snackbar.show({ message: t('settings.exportUnavailable') });
    } catch (error) {
      reportError(error);
      Alert.alert(t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  // Once the profile is gone the onboarding routes open up and the router moves there.
  const confirmDeleteAll = () =>
    Alert.alert(t('settings.deleteAllTitle'), t('settings.deleteAllBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAllConfirm'),
        style: 'destructive',
        onPress: () => {
          try {
            wipeDevice(db);
          } catch (error) {
            reportError(error);
            Alert.alert(t('common.error'));
          }
        },
      },
    ]);

  return (
    <Screen padded={false} header={<Header title={t('settings.header')} />}>
      <View style={styles.profileWrap}>
        <Card corners style={styles.profile}>
          <Avatar
            name={settings.profile.name}
            color={settings.profile.avatarColor}
            image={settings.profile.avatarPath}
            size="md"
          />
          <View style={styles.flex}>
            <AppText variant="headerTitle">{settings.profile.name}</AppText>
            <AppText variant="caption" color="textMuted">
              {t('settings.localProfile')}
            </AppText>
          </View>
          <Button
            title={t('common.edit')}
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => router.push('/profile/edit')}
          />
        </Card>
      </View>

      <SectionHeader title={t('settings.appearance')} />
      <ListItem
        leading={<Icon icon={Palette} size={20} color="textMuted" />}
        title={t('settings.theme')}
        trailing={
          <SegmentedControl
            size="sm"
            style={styles.themeToggle}
            accessibilityLabel={t('settings.theme')}
            value={settings.theme}
            onChange={(value) => settings.update('theme', value)}
            options={[
              { value: 'light', label: t('theme.light') },
              { value: 'dark', label: t('theme.dark') },
              { value: 'system', label: t('theme.system') },
            ]}
          />
        }
      />
      <ListItem
        onPress={() => setSheet('currency')}
        leading={<Icon icon={Coins} size={20} color="textMuted" />}
        title={t('settings.defaultCurrency')}
        value={CURRENCIES[settings.defaultCurrency]?.label}
        chevron
      />
      <ListItem
        onPress={() => setSheet('language')}
        leading={<Icon icon={Languages} size={20} color="textMuted" />}
        title={t('settings.language')}
        value={t(`language.${settings.language}`)}
        chevron
      />

      <SectionHeader title={t('settings.security')} />
      <ListItem
        onPress={() => router.push('/settings/recovery')}
        leading={<Icon icon={KeyRound} size={20} color="textMuted" />}
        title={t('settings.recoveryKey')}
        value={t('settings.recoveryWords')}
        chevron
      />
      <ListItem
        leading={<Icon icon={ScanFace} size={20} color="textMuted" />}
        title={t('settings.appLock')}
        subtitle={t('settings.appLockHint', { method: t(`biometric.${biometrics.method}`) })}
        trailing={
          <Switch
            value={settings.biometricLock}
            onChange={toggleLock}
            accessibilityLabel={t('settings.appLock')}
          />
        }
      />
      <ListItem
        leading={<Icon icon={ShieldCheck} size={20} color="textMuted" />}
        title={t('settings.e2e')}
        subtitle={t('settings.e2eHint')}
        trailing={<Badge label={t('settings.e2eOn')} tone="primary" />}
      />

      <SectionHeader title={t('settings.sync')} />
      <ListItem
        leading={<Icon icon={Cloud} size={20} color="textMuted" />}
        title={t(`settings.syncStatus.${sync.connection}`)}
        subtitle={lastSynced}
        trailing={
          <SyncBadge
            status={
              sync.pendingTotal
                ? sync.connected
                  ? 'pending'
                  : 'offline'
                : sync.connected
                  ? 'synced'
                  : 'offline'
            }
            showLabel
            label={
              sync.pendingTotal ? t('settings.pending', { count: sync.pendingTotal }) : undefined
            }
          />
        }
      />
      <ListItem
        onPress={sync.syncNow}
        disabled={!sync.online}
        leading={<Icon icon={RefreshCw} size={20} color="textMuted" />}
        title={t('settings.syncNow')}
      />

      <SectionHeader title={t('settings.data')} />
      <ListItem
        onPress={exporting ? undefined : runExport}
        disabled={exporting}
        leading={<Icon icon={Download} size={20} color="textMuted" />}
        title={t('settings.export')}
        subtitle={t('settings.exportHint')}
        chevron
      />
      <ListItem
        onPress={confirmDeleteAll}
        leading={<Icon icon={Trash2} size={20} color="danger" />}
        title={
          <AppText variant="bodyLg" color="danger">
            {t('settings.deleteAll')}
          </AppText>
        }
        subtitle={t('settings.deleteAllHint')}
      />

      <SectionHeader title={t('settings.about')} />
      <AppText variant="caption" color="textMuted" style={styles.version}>
        {t('settings.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
      </AppText>

      <OptionSheet
        visible={sheet === 'currency'}
        title={t('settings.defaultCurrency')}
        value={settings.defaultCurrency}
        onClose={() => setSheet(null)}
        onSelect={(value) => {
          settings.update('defaultCurrency', value);
          setSheet(null);
        }}
        options={CURRENCY_CODES.map((code) => ({ value: code, label: CURRENCIES[code].label }))}
      />
      <OptionSheet
        visible={sheet === 'language'}
        title={t('settings.language')}
        value={settings.language}
        onClose={() => setSheet(null)}
        onSelect={(value) => {
          settings.update('language', value);
          setSheet(null);
        }}
        options={SUPPORTED_LANGUAGES.map((code) => ({ value: code, label: t(`language.${code}`) }))}
      />
    </Screen>
  );
}

const createStyles = ({ spacing, layout }) =>
  StyleSheet.create({
    flex: { flex: 1 },
    profileWrap: { paddingHorizontal: layout.gutter, paddingTop: spacing.md },
    profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    themeToggle: { width: 192 },
    version: { paddingHorizontal: layout.gutter },
  });
