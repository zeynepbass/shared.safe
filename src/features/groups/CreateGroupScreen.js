import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { createGroup, useDb } from '@/shared/db';
import { useSettings } from '@/features/settings/SettingsProvider';
import { CURRENCIES, CURRENCY_CODES } from '@/shared/lib/money';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  BottomBar,
  Button,
  InfoBox,
  Screen,
  Header,
  SegmentedControl,
  SelectCard,
  Input,
} from '@/shared/ui';

import { GROUP_TYPES } from './groupTypes';

const CURRENCY_OPTIONS = CURRENCY_CODES.map((code) => ({
  value: code,
  label: CURRENCIES[code].label,
}));

export default function CreateGroupScreen() {
  const { t } = useTranslation();
  const db = useDb();
  const styles = useThemedStyles(createStyles);
  const { profile, defaultCurrency } = useSettings();

  const [name, setName] = useState('');
  const [type, setType] = useState('home');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const error = touched && !trimmed ? t('groupForm.nameRequired') : null;

  const submit = async () => {
    setTouched(true);
    if (!trimmed) return;
    setSaving(true);
    try {
      const id = await createGroup(db, { name: trimmed, type, currency, self: profile });
      router.dismiss();
      router.push(`/groups/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const rows = [GROUP_TYPES.slice(0, 2), GROUP_TYPES.slice(2, 4)];

  return (
    <Screen
      keyboard
      header={<Header title={t('groupForm.header')} leading="close" />}
      footer={
        <BottomBar>
          <Button
            title={t('groupForm.submit')}
            onPress={submit}
            loading={saving}
            disabled={touched && !trimmed}
          />
        </BottomBar>
      }
    >
      <View style={styles.form}>
        <Input
          label={t('groupForm.nameLabel')}
          placeholder={t('groupForm.namePlaceholder')}
          value={name}
          onChangeText={setName}
          onBlur={() => setTouched(true)}
          error={error}
          autoFocus
          maxLength={40}
          returnKeyType="done"
          size="lg"
        />

        <View style={styles.field}>
          <AppText variant="caption" color="textMuted">
            {t('groupForm.typeLabel')}
          </AppText>
          <View style={styles.grid} accessibilityRole="radiogroup">
            {rows.map((row) => (
              <View key={row[0].id} style={styles.gridRow}>
                {row.map((option) => (
                  <SelectCard
                    key={option.id}
                    icon={option.icon}
                    title={t(`groupTypes.${option.id}.title`)}
                    subtitle={t(`groupTypes.${option.id}.subtitle`)}
                    selected={type === option.id}
                    onPress={() => setType(option.id)}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <AppText variant="caption" color="textMuted">
            {t('groupForm.currencyLabel')}
          </AppText>
          <SegmentedControl
            options={CURRENCY_OPTIONS}
            value={currency}
            onChange={setCurrency}
            accessibilityLabel={t('groupForm.currencyLabel')}
          />
        </View>

        <InfoBox>{t('groupForm.info')}</InfoBox>
      </View>
    </Screen>
  );
}

const createStyles = ({ spacing }) =>
  StyleSheet.create({
    form: { gap: spacing.xl, paddingTop: spacing.md },
    field: { gap: spacing.sm },
    grid: { gap: spacing.sm },
    gridRow: { flexDirection: 'row', gap: spacing.sm },
  });
