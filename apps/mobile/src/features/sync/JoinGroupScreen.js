import { router, useLocalSearchParams } from 'expo-router';
import { CloudDownload, KeyRound, ScanQrCode, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { useSettings } from '@/features/settings/SettingsProvider';
import {
  claimMembership,
  joinGroupByInvite,
  listMembers,
  listPendingJoins,
  useDb,
  useDbQuery,
} from '@/shared/db';
import { reportError } from '@/shared/monitoring';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  BottomBar,
  Button,
  EmptyState,
  Header,
  IconBox,
  Input,
  ListItem,
  Screen,
  SectionHeader,
  useSnackbar,
} from '@/shared/ui';

function loadJoin(db, groupId) {
  const pending = listPendingJoins(db).find((p) => p.groupId === groupId) ?? null;
  return { pending, members: pending?.ready ? listMembers(db, groupId) : [] };
}

// Paste (or open) an invite, wait for the group to arrive, then say which member you are.
export default function JoinGroupScreen() {
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const db = useDb();
  const snackbar = useSnackbar();
  const styles = useThemedStyles(createStyles);
  const { profile } = useSettings();
  const [code, setCode] = useState(params.invite ?? '');
  const [error, setError] = useState(null);
  const [groupId, setGroupId] = useState(params.groupId ?? null);
  const { data } = useDbQuery(
    (d) => loadJoin(d, groupId),
    [groupId],
    ['sync_groups', 'groups', 'members'],
  );

  const join = () => {
    try {
      const result = joinGroupByInvite(db, code);
      setError(null);
      if (result.alreadyJoined && !listPendingJoins(db).some((p) => p.groupId === result.groupId)) {
        router.replace(`/groups/${result.groupId}`);
        return;
      }
      setGroupId(result.groupId);
    } catch (e) {
      if (e.code === 'invalidInvite') setError(t('join.invalid'));
      else if (e.code === 'inviteExpired') setError(t('join.expiredBody'));
      else {
        reportError(e);
        Alert.alert(t('common.error'));
      }
    }
  };

  const claim = (memberId) => {
    try {
      claimMembership(db, groupId, memberId);
      snackbar.show({ message: t('join.done', { name: data.pending.name }) });
      router.dismiss();
      router.push(`/groups/${groupId}`);
    } catch (e) {
      reportError(e);
      Alert.alert(t('common.error'));
    }
  };

  const header = <Header title={t('join.header')} leading="close" />;

  if (!groupId || !data?.pending) {
    return (
      <Screen
        keyboard
        header={header}
        footer={
          <BottomBar>
            <Button title={t('join.submit')} onPress={join} disabled={!code.trim()} />
          </BottomBar>
        }
      >
        <View style={styles.form}>
          <Button
            title={t('join.scan')}
            icon={ScanQrCode}
            variant="secondary"
            onPress={() => router.replace('/groups/scan')}
          />
          <Input
            label={t('join.codeLabel')}
            placeholder={t('join.codePlaceholder')}
            value={code}
            onChangeText={(text) => {
              setCode(text);
              setError(null);
            }}
            error={error}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={!code}
            returnKeyType="done"
            onSubmitEditing={join}
          />
        </View>
      </Screen>
    );
  }

  if (data.pending.expired) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={KeyRound}
          title={t('join.expiredTitle')}
          description={t('join.expiredBody')}
        >
          <Button
            title={t('join.scan')}
            icon={ScanQrCode}
            onPress={() => router.replace('/groups/scan')}
          />
        </EmptyState>
      </Screen>
    );
  }

  if (!data.pending.ready) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={CloudDownload}
          title={t('join.waitingTitle')}
          description={t('join.waitingBody')}
        >
          <ActivityIndicator />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen
      padded={false}
      header={<Header title={data.pending.name} subtitle={t('join.header')} leading="close" />}
    >
      <View style={styles.intro}>
        <AppText variant="heading">{t('join.whoTitle')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('join.whoBody')}
        </AppText>
      </View>
      <SectionHeader title={data.pending.name} />
      {data.members.map((member) => (
        <ListItem
          key={member.id}
          onPress={() => claim(member.id)}
          leading={<Avatar name={member.name} color={member.avatarColor} size="md" />}
          title={member.name}
          chevron
        />
      ))}
      <ListItem
        onPress={() => claim(null)}
        leading={<IconBox icon={UserPlus} />}
        title={t('join.asNew', { name: profile.name })}
        chevron
      />
    </Screen>
  );
}

const createStyles = ({ spacing, layout }) =>
  StyleSheet.create({
    form: { gap: spacing.xl, paddingTop: spacing.md },
    intro: { gap: spacing.sm, padding: layout.gutter },
  });
