import { useSQLiteContext } from 'expo-sqlite';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { addMember, getGroup, useDbQuery } from '@/db';
import { useTheme, useThemedStyles } from '@/shared/theme';
import {
  Avatar,
  BottomBar,
  Button,
  ColorPicker,
  Screen,
  Header,
  Input,
  useSnackbar,
} from '@/shared/ui';

export default function AddMemberScreen() {
  const { groupId } = useLocalSearchParams();
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const snackbar = useSnackbar();
  const { avatarColors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data: group } = useDbQuery((d) => getGroup(d, groupId), [groupId], ['groups']);

  const [name, setName] = useState('');
  const [color, setColor] = useState(avatarColors[1]);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const error = touched && !trimmed ? t('member.nameRequired') : null;

  const submit = async () => {
    setTouched(true);
    if (!trimmed) return;
    setSaving(true);
    try {
      await addMember(db, groupId, { name: trimmed, color });
      snackbar.show({ message: t('member.added', { name: trimmed }) });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      keyboard
      header={<Header title={t('member.header')} subtitle={group?.name} leading="close" />}
      footer={
        <BottomBar>
          <Button
            title={t('member.submit')}
            onPress={submit}
            loading={saving}
            disabled={touched && !trimmed}
          />
        </BottomBar>
      }
    >
      <View style={styles.avatarBlock}>
        <Avatar name={trimmed || '?'} color={color} size="lg" />
        <ColorPicker
          colors={avatarColors}
          value={color}
          onChange={setColor}
          accessibilityLabel={t('member.colorLabel')}
        />
      </View>
      <Input
        label={t('member.nameLabel')}
        placeholder={t('member.namePlaceholder')}
        value={name}
        onChangeText={setName}
        onBlur={() => setTouched(true)}
        onSubmitEditing={submit}
        error={error}
        autoFocus
        autoCapitalize="words"
        maxLength={40}
        returnKeyType="done"
        size="lg"
      />
    </Screen>
  );
}

const createStyles = ({ spacing }) =>
  StyleSheet.create({
    avatarBlock: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxl },
  });
