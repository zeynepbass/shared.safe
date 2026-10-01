import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { useSettings } from '@/features/settings/SettingsProvider';
import { saveProfile, useDb } from '@/shared/db';
import { deleteImage, pickImage } from '@/shared/lib/images';
import { CURRENCIES, CURRENCY_CODES } from '@ortak-kasa/core/money';
import { reportError } from '@/shared/monitoring';
import { useTheme, useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  BottomBar,
  Button,
  ColorPicker,
  Header,
  Input,
  OptionSheet,
  Screen,
  SegmentedControl,
} from '@/shared/ui';

import { NAME_MAX, profileSchema } from './profileSchema';

const CURRENCY_OPTIONS = CURRENCY_CODES.map((code) => ({
  value: code,
  label: CURRENCIES[code].label,
}));

const PHOTO_OPTIONS = { folder: 'avatars', quality: 0.7, allowsEditing: true, aspect: [1, 1] };

export default function ProfileScreen({ mode = 'create' }) {
  const { t } = useTranslation();
  const db = useDb();
  const { avatarColors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const settings = useSettings();
  const isEdit = mode === 'edit';
  const [photoSheet, setPhotoSheet] = useState(false);

  const originalPhoto = settings.profile.avatarPath;
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm({
    resolver: zodResolver(profileSchema),
    mode: 'onTouched',
    defaultValues: {
      name: settings.profile.name,
      avatarColor: settings.profile.avatarColor,
      avatarPath: originalPhoto,
      defaultCurrency: settings.defaultCurrency,
    },
  });
  const [name, avatarColor, avatarPath] = useWatch({
    control,
    name: ['name', 'avatarColor', 'avatarPath'],
  });

  // A photo picked here is only kept if the profile is saved with it.
  const unsavedPhoto = useRef(null);
  useEffect(() => {
    unsavedPhoto.current = avatarPath !== originalPhoto ? avatarPath : null;
  }, [avatarPath, originalPhoto]);
  useEffect(() => () => deleteImage(unsavedPhoto.current), []);

  const replacePhoto = (next) => {
    if (avatarPath && avatarPath !== originalPhoto) deleteImage(avatarPath);
    setValue('avatarPath', next);
  };

  const choosePhoto = async (choice) => {
    setPhotoSheet(false);
    if (choice === 'remove') {
      replacePhoto(null);
      return;
    }
    try {
      const result = await pickImage(choice, PHOTO_OPTIONS);
      if (result.status === 'denied') Alert.alert(t('profile.photoPermission'));
      if (result.status === 'ok') replacePhoto(result.uri);
    } catch (error) {
      reportError(error);
      Alert.alert(t('common.error'));
    }
  };

  const chooseColor = (color) => {
    setValue('avatarColor', color);
    replacePhoto(null);
  };

  const save = (values) => {
    try {
      saveProfile(db, values);
    } catch (error) {
      reportError(error);
      Alert.alert(t('common.error'));
      return;
    }
    unsavedPhoto.current = null;
    if (originalPhoto && originalPhoto !== values.avatarPath) deleteImage(originalPhoto);
    // On first run the saved profile closes the onboarding routes and the router moves on by
    // itself; editing just closes the modal.
    if (isEdit) router.back();
  };
  const submit = () => handleSubmit(save)();

  return (
    <Screen
      keyboard
      header={
        <Header
          title={isEdit ? t('profile.editHeader') : t('profile.header')}
          leading={isEdit ? 'close' : 'back'}
        />
      }
      footer={
        <BottomBar>
          <Button
            title={isEdit ? t('common.save') : t('common.continue')}
            onPress={submit}
            loading={isSubmitting}
            disabled={isSubmitted && Object.keys(errors).length > 0}
            testID="profile-submit"
          />
        </BottomBar>
      }
    >
      <View style={styles.intro}>
        {isEdit ? null : (
          <AppText variant="overline" color="primary">
            {t('onboarding.progress', { current: 1, total: 2 })}
          </AppText>
        )}
        <AppText variant="heading">{isEdit ? t('profile.editTitle') : t('profile.title')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('profile.body')}
        </AppText>
      </View>

      <View style={styles.avatarBlock}>
        <Avatar name={name.trim() || '?'} color={avatarColor} image={avatarPath} size="lg" />
        <ColorPicker
          colors={avatarColors}
          value={avatarColor}
          onChange={chooseColor}
          accessibilityLabel={t('profile.colorLabel')}
          onPhotoPress={() => setPhotoSheet(true)}
          photoSelected={Boolean(avatarPath)}
          photoLabel={t('profile.photo')}
        />
      </View>

      <View style={styles.fields}>
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value, ref } }) => (
            <Input
              ref={ref}
              label={t('profile.nameLabel')}
              placeholder={t('profile.namePlaceholder')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              onSubmitEditing={submit}
              error={errors.name ? t(errors.name.message) : null}
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              returnKeyType="done"
              maxLength={NAME_MAX}
              size="lg"
              testID="profile-name"
            />
          )}
        />
        <View style={styles.field}>
          <AppText variant="caption" color="textMuted">
            {t('profile.currencyLabel')}
          </AppText>
          <Controller
            control={control}
            name="defaultCurrency"
            render={({ field: { onChange, value } }) => (
              <SegmentedControl
                options={CURRENCY_OPTIONS}
                value={value}
                onChange={onChange}
                accessibilityLabel={t('profile.currencyLabel')}
              />
            )}
          />
        </View>
      </View>

      <OptionSheet
        visible={photoSheet}
        title={t('profile.photo')}
        onClose={() => setPhotoSheet(false)}
        onSelect={choosePhoto}
        options={[
          { value: 'camera', label: t('profile.photoTake') },
          { value: 'library', label: t('profile.photoPick') },
          ...(avatarPath ? [{ value: 'remove', label: t('profile.photoRemove') }] : []),
        ]}
      />
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
