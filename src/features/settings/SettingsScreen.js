import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Coins, Languages, Palette } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SUPPORTED_LANGUAGES } from '@/shared/i18n';
import { CURRENCIES, CURRENCY_CODES } from '@/shared/lib/money';
import { useTheme, useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  Button,
  Card,
  Icon,
  ListRow,
  OptionSheet,
  Screen,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
} from '@/shared/ui';

import { useSettings } from './SettingsProvider';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { scheme } = useTheme();
  const settings = useSettings();
  const [sheet, setSheet] = useState(null);

  return (
    <Screen padded={false} header={<ScreenHeader title={t('settings.header')} />}>
      <View style={styles.profileWrap}>
        <Card corners style={styles.profile}>
          <Avatar name={settings.profile.name} color={settings.profile.color} size="md" />
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
      <ListRow
        leading={<Icon icon={Palette} size={20} color="textMuted" />}
        title={t('settings.theme')}
        trailing={
          <SegmentedControl
            size="sm"
            style={styles.themeToggle}
            accessibilityLabel={t('settings.theme')}
            value={scheme}
            onChange={(value) => settings.update('theme', value)}
            options={[
              { value: 'light', label: t('theme.light') },
              { value: 'dark', label: t('theme.dark') },
            ]}
          />
        }
      />
      <ListRow
        onPress={() => setSheet('currency')}
        leading={<Icon icon={Coins} size={20} color="textMuted" />}
        title={t('settings.defaultCurrency')}
        value={CURRENCIES[settings.defaultCurrency]?.label}
        chevron
      />
      <ListRow
        onPress={() => setSheet('language')}
        leading={<Icon icon={Languages} size={20} color="textMuted" />}
        title={t('settings.language')}
        value={t(`language.${settings.language}`)}
        chevron
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
    themeToggle: { width: 128 },
    version: { paddingHorizontal: layout.gutter },
  });
