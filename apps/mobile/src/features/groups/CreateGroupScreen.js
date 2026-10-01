import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { useSettings } from '@/features/settings/SettingsProvider';
import { createGroup, useDb } from '@/shared/db';
import { CURRENCIES, CURRENCY_CODES } from '@ortak-kasa/core/money';
import { useTheme, useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  BottomBar,
  Button,
  Header,
  IconButton,
  InfoBox,
  Input,
  ListItem,
  Screen,
  SegmentedControl,
  SelectCard,
} from '@/shared/ui';

import { groupFormSchema, NAME_MAX, validateNewMember } from './groupFormSchema';
import { GROUP_TYPES } from './groupTypes';

const CURRENCY_OPTIONS = CURRENCY_CODES.map((code) => ({
  value: code,
  label: CURRENCIES[code].label,
}));

const TYPE_ROWS = [GROUP_TYPES.slice(0, 2), GROUP_TYPES.slice(2, 4)];

export default function CreateGroupScreen() {
  const { t } = useTranslation();
  const db = useDb();
  const styles = useThemedStyles(createStyles);
  const { avatarColors } = useTheme();
  const { profile, defaultCurrency } = useSettings();

  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm({
    resolver: zodResolver(groupFormSchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      type: 'home',
      currency: defaultCurrency,
      selfName: profile.name,
      members: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'members' });

  const [draftName, setDraftName] = useState('');
  const [draftError, setDraftError] = useState(null);

  const addMember = () => {
    const result = validateNewMember(draftName, getValues());
    if (result.error) {
      setDraftError(result.error);
      return;
    }
    // Profile colour is taken by the local user; others cycle through the rest of the palette.
    const palette = avatarColors.filter((c) => c !== profile.avatarColor);
    append({ name: result.name, avatarColor: palette[fields.length % palette.length] });
    setDraftName('');
    setDraftError(null);
  };

  const submit = handleSubmit(({ name, type, currency, members }) => {
    let id;
    try {
      id = createGroup(db, { name, type, currency, members });
    } catch (error) {
      console.error(error);
      Alert.alert(t('common.error'));
      return;
    }
    router.dismiss();
    router.push(`/groups/${id}`);
  });

  const membersError = errors.members?.message ?? errors.members?.root?.message;

  return (
    <Screen
      keyboard
      header={<Header title={t('groupForm.header')} leading="close" />}
      footer={
        <BottomBar>
          <Button
            title={t('groupForm.submit')}
            onPress={submit}
            loading={isSubmitting}
            disabled={isSubmitted && Object.keys(errors).length > 0}
          />
        </BottomBar>
      }
    >
      <View style={styles.form}>
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value, ref } }) => (
            <Input
              ref={ref}
              label={t('groupForm.nameLabel')}
              placeholder={t('groupForm.namePlaceholder')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.name ? t(errors.name.message) : null}
              autoFocus
              maxLength={NAME_MAX}
              returnKeyType="done"
              size="lg"
            />
          )}
        />

        <View style={styles.field}>
          <AppText variant="caption" color="textMuted">
            {t('groupForm.typeLabel')}
          </AppText>
          <Controller
            control={control}
            name="type"
            render={({ field: { onChange, value } }) => (
              <View style={styles.grid} accessibilityRole="radiogroup">
                {TYPE_ROWS.map((row) => (
                  <View key={row[0].id} style={styles.gridRow}>
                    {row.map((option) => (
                      <SelectCard
                        key={option.id}
                        icon={option.icon}
                        title={t(`groupTypes.${option.id}.title`)}
                        subtitle={t(`groupTypes.${option.id}.subtitle`)}
                        selected={value === option.id}
                        onPress={() => onChange(option.id)}
                      />
                    ))}
                  </View>
                ))}
              </View>
            )}
          />
        </View>

        <View style={styles.field}>
          <AppText variant="caption" color="textMuted">
            {t('groupForm.currencyLabel')}
          </AppText>
          <Controller
            control={control}
            name="currency"
            render={({ field: { onChange, value } }) => (
              <SegmentedControl
                options={CURRENCY_OPTIONS}
                value={value}
                onChange={onChange}
                accessibilityLabel={t('groupForm.currencyLabel')}
              />
            )}
          />
        </View>

        <View style={styles.field}>
          <AppText variant="caption" color="textMuted">
            {t('groupForm.membersLabel')}
          </AppText>
          <View style={styles.members}>
            <ListItem
              leading={
                <Avatar
                  name={profile.name}
                  color={profile.avatarColor}
                  image={profile.avatarPath}
                  size="sm"
                />
              }
              title={t('common.you')}
              subtitle={fields.length === 0 ? t('groupForm.onlyYou') : profile.name}
            />
            {fields.map((field, index) => (
              <ListItem
                key={field.id}
                leading={<Avatar name={field.name} color={field.avatarColor} size="sm" />}
                title={field.name}
                subtitle={
                  errors.members?.[index]?.name ? t(errors.members[index].name.message) : null
                }
                trailing={
                  <IconButton
                    icon={X}
                    size={18}
                    onPress={() => remove(index)}
                    accessibilityLabel={t('groupForm.removeMember', { name: field.name })}
                  />
                }
              />
            ))}
          </View>
          <View style={styles.addRow}>
            <Input
              placeholder={t('groupForm.memberPlaceholder')}
              accessibilityLabel={t('groupForm.memberPlaceholder')}
              value={draftName}
              onChangeText={(text) => {
                setDraftName(text);
                if (draftError) setDraftError(null);
              }}
              onSubmitEditing={addMember}
              submitBehavior="submit"
              error={draftError ? t(draftError) : membersError ? t(membersError) : null}
              autoCapitalize="words"
              maxLength={NAME_MAX}
              returnKeyType="done"
              style={styles.addInput}
            />
            <IconButton
              icon={Plus}
              onPress={addMember}
              accessibilityLabel={t('groupForm.addMember')}
              style={styles.addButton}
            />
          </View>
        </View>

        <InfoBox>{t('groupForm.info')}</InfoBox>
      </View>
    </Screen>
  );
}

const createStyles = ({ colors, spacing, borderWidth, layout, radius }) =>
  StyleSheet.create({
    form: { gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl },
    field: { gap: spacing.sm },
    grid: { gap: spacing.sm },
    gridRow: { flexDirection: 'row', gap: spacing.sm },
    members: {
      borderTopWidth: borderWidth.hairline,
      borderTopColor: colors.border,
      marginHorizontal: -layout.gutter,
    },
    addRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    addInput: { flex: 1 },
    addButton: {
      width: layout.inputHeight,
      height: layout.inputHeight,
      backgroundColor: colors.surface,
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
      borderRadius: radius.control,
    },
  });
