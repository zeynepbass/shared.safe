import { router, useLocalSearchParams } from 'expo-router';
import { Trash2, UserPlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet } from 'react-native';

import {
  getGroup,
  isRemovedFromGroup,
  listMembers,
  removeMember,
  useDb,
  useDbQuery,
} from '@/shared/db';
import { useThemedStyles } from '@/shared/theme';
import {
  Avatar,
  BottomBar,
  Button,
  Header,
  IconButton,
  InfoBox,
  ListItem,
  Screen,
  useSnackbar,
} from '@/shared/ui';

function loadMembers(db, groupId) {
  const group = getGroup(db, groupId);
  return group
    ? { group, members: listMembers(db, groupId), removed: isRemovedFromGroup(db, groupId) }
    : null;
}

// Who is in the group. Removing someone also replaces the group's encryption key, so they cannot
// read anything added afterwards.
export default function MembersScreen() {
  const { groupId } = useLocalSearchParams();
  const { t } = useTranslation();
  const db = useDb();
  const snackbar = useSnackbar();
  const styles = useThemedStyles(createStyles);
  const { data } = useDbQuery(
    (d) => loadMembers(d, groupId),
    [groupId],
    ['groups', 'members', 'sync_groups'],
  );

  const header = <Header title={t('members.header')} subtitle={data?.group.name} />;
  if (!data) return <Screen header={header} />;

  const remove = (member) => {
    try {
      removeMember(db, member.id);
      snackbar.show({ message: t('members.removed', { name: member.name }) });
    } catch (error) {
      if (error.code === 'memberInUse')
        Alert.alert(t('members.inUseTitle'), t('members.inUseBody'));
      else {
        console.error(error);
        Alert.alert(t('common.error'));
      }
    }
  };

  const confirmRemove = (member) =>
    Alert.alert(
      t('members.removeTitle', { name: member.name }),
      t('members.removeBody', { name: member.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('members.removeConfirm'), style: 'destructive', onPress: () => remove(member) },
      ],
    );

  return (
    <Screen
      padded={false}
      header={header}
      footer={
        data.removed ? null : (
          <BottomBar>
            <Button
              title={t('groupDetail.addMember')}
              icon={UserPlus}
              variant="secondary"
              onPress={() => router.push(`/groups/${groupId}/members/new`)}
            />
          </BottomBar>
        )
      }
    >
      {data.members.map((member) => (
        <ListItem
          key={member.id}
          leading={
            <Avatar
              name={member.name}
              color={member.avatarColor}
              image={member.avatarPath}
              size="md"
            />
          }
          title={member.isLocalUser ? t('members.you', { name: member.name }) : member.name}
          trailing={
            member.isLocalUser || data.removed ? null : (
              <IconButton
                icon={Trash2}
                color="danger"
                onPress={() => confirmRemove(member)}
                accessibilityLabel={t('members.removeLabel', { name: member.name })}
              />
            )
          }
        />
      ))}
      {data.removed ? null : <InfoBox style={styles.info}>{t('members.keyNote')}</InfoBox>}
    </Screen>
  );
}

const createStyles = ({ spacing, layout }) =>
  StyleSheet.create({
    info: { marginHorizontal: layout.gutter, marginTop: spacing.lg },
  });
