import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftRight,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { memberLabel } from '@/features/groups/useGroupSummary';
import { getGroup, getGroupActivity, useDbQuery } from '@/shared/db';
import { isoFromTimestamp } from '@/shared/lib/dates';
import { useDateFormat } from '@/shared/lib/useDateFormat';
import { useThemedStyles } from '@/shared/theme';
import { EmptyState, Header, IconBox, ListItem, Money, SectionHeader } from '@/shared/ui';

const TABLES = ['activity_log', 'members', 'groups'];

const ICONS = {
  group_created: Users,
  group_updated: Pencil,
  group_deleted: Trash2,
  member_added: UserPlus,
  member_updated: Pencil,
  member_removed: UserMinus,
  expense_created: Plus,
  expense_updated: Pencil,
  expense_deleted: Trash2,
  expense_restored: RotateCcw,
  settlement_created: ArrowLeftRight,
  settlement_deleted: Trash2,
  settlement_restored: RotateCcw,
};

function loadActivity(db, groupId) {
  const group = getGroup(db, groupId);
  return group ? { group, ...getGroupActivity(db, groupId) } : null;
}

export default function ActivityScreen() {
  const { groupId } = useLocalSearchParams();
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const dates = useDateFormat();
  const { data, loading } = useDbQuery((db) => loadActivity(db, groupId), [groupId], TABLES);

  const rows = useMemo(() => {
    const result = [];
    for (const entry of data?.entries ?? []) {
      const day = isoFromTimestamp(entry.occurredAt);
      if (result[result.length - 1]?.day !== day) result.push({ kind: 'day', id: day, day });
      result.push({ kind: 'entry', id: entry.id, day, entry });
    }
    return result;
  }, [data]);

  const header = <Header title={t('activity.header')} subtitle={data?.group.name} />;
  if (loading || !data) return <SafeAreaView style={styles.safe}>{header}</SafeAreaView>;

  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const nameOf = (id) => memberLabel(memberById.get(id), t);

  const describe = ({ type, payload, entityId }) => {
    const values = payload ?? {};
    if (type.startsWith('member_')) {
      const member = memberById.get(entityId);
      return t(`activity.types.${type}`, { name: member ? memberLabel(member, t) : values.name });
    }
    if (type.startsWith('settlement_')) {
      return t(`activity.types.${type}`, {
        from: nameOf(values.fromMemberId),
        to: nameOf(values.toMemberId),
      });
    }
    return t(`activity.types.${type}`, values);
  };

  const renderItem = ({ item }) => {
    if (item.kind === 'day') {
      return <SectionHeader variant="overline" title={dates.sectionHeader(item.day)} />;
    }
    const { entry } = item;
    const payload = entry.payload ?? {};
    const removed = entry.type.endsWith('_deleted');
    return (
      <ListItem
        leading={
          <IconBox icon={ICONS[entry.type] ?? History} color={removed ? 'textMuted' : undefined} />
        }
        title={describe(entry)}
        subtitle={dates.time(entry.occurredAt)}
        trailing={
          payload.amount ? (
            <Money
              minor={payload.amount}
              currency={payload.currency ?? data.group.currency}
              tone={removed ? 'textMuted' : 'neutral'}
            />
          ) : null
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {header}
      {rows.length === 0 ? (
        <EmptyState icon={History} title={t('activity.empty')} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          getItemType={(item) => item.kind}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = ({ colors, spacing }) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    list: { paddingBottom: spacing.xxxl },
  });
