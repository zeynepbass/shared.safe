import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { saveProfile } from '@/db';
import { useSettings } from '@/features/settings/SettingsProvider';
import { CURRENCIES, CURRENCY_CODES } from '@/shared/lib/money';
import { useTheme, useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  BottomBar,
  Button,
  ColorPicker,
  Screen,
  ScreenHeader,
  SegmentedControl,
  TextField,
} from '@/shared/ui';

const CURRENCY_OPTIONS = CURRENCY_CODES.map((code) => ({
  value: code,
  label: CURRENCIES[code].label,
}));

export default function ProfileScreen({ mode = 'create' }) {
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const { avatarColors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const settings = useSettings();
  const isEdit = mode === 'edit';

  const [name, setName] = useState(settings.profile.name);
  const [color, setColor] = useState(settings.profile.color);
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const error = touched && !trimmed ? t('profile.nameRequired') : null;

  const submit = async () => {
    setTouched(true);
    if (!trimmed) return;
    setSaving(true);
    try {
      await saveProfile(db, { name: trimmed, color, currency, completeOnboarding: !isEdit });
      if (isEdit) router.back();
      else router.replace('/groups');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      keyboard
      header={
        <ScreenHeader
          title={isEdit ? t('profile.editHeader') : t('profile.header')}
          leading={isEdit ? 'close' : 'back'}
        />
      }
      footer={
        <BottomBar>
          <Button
            title={isEdit ? t('common.save') : t('common.continue')}
            onPress={submit}
            loading={saving}
            disabled={touched && !trimmed}
          />
        </BottomBar>
      }
    >
      <View style={styles.intro}>
        <AppText variant="heading">{isEdit ? t('profile.editTitle') : t('profile.title')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('profile.body')}
        </AppText>
      </View>

      <View style={styles.avatarBlock}>
        <Avatar name={trimmed || '?'} color={color} size="lg" />
        <ColorPicker
          colors={avatarColors}
          value={color}
          onChange={setColor}
          accessibilityLabel={t('profile.colorLabel')}
        />
      </View>

      <View style={styles.fields}>
        <TextField
          label={t('profile.nameLabel')}
          placeholder={t('profile.namePlaceholder')}
          value={name}
          onChangeText={setName}
          onBlur={() => setTouched(true)}
          error={error}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="done"
          maxLength={40}
          size="lg"
        />
        <View style={styles.field}>
          <AppText variant="caption" color="textMuted">
            {t('profile.currencyLabel')}
          </AppText>
          <SegmentedControl
            options={CURRENCY_OPTIONS}
            value={currency}
            onChange={setCurrency}
            accessibilityLabel={t('profile.currencyLabel')}
          />
        </View>
      </View>
    </Screen>
  );
}

const createStyles = ({ spacing }) =>
  StyleSheet.create({
    intro: { gap: spacing.sm, paddingTop: spacing.md },
    avatarBlock: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxl },
    fields: { gap: spacing.xl },
    field: { gap: spacing.sm },
  });
