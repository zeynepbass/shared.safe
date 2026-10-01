import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftRight,
  ChartPie,
  GitMerge,
  History,
  Paperclip,
  QrCode,
  Receipt,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getGroupOverview,
  isRemovedFromGroup,
  restoreExpense,
  softDeleteExpense,
  useDb,
  useDbQuery,
} from '@/shared/db';
import { categoryIcon } from '@/features/expenses/categories';
import { useSync } from '@/features/sync/SyncProvider';
import { currencySymbol } from '@ortak-kasa/core/money';
import { useDateFormat } from '@/shared/lib/useDateFormat';
import { reportError } from '@/shared/monitoring';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  AvatarGroup,
  Button,
  Card,
  EmptyState,
  Fab,
  Icon,
  IconBox,
  InfoBox,
  ListItem,
  Money,
  Header,
  OfflineBanner,
  SectionHeader,
  SwipeableRow,
  SyncBadge,
  useFormatMoney,
  useSnackbar,
} from '@/shared/ui';

import { buildTimeline } from './timeline';
import { memberLabel } from './useGroupSummary';

const TABLES = ['groups', 'members', 'expenses', 'expense_shares', 'settlements'];
const PAGE = 200;

export default function GroupDetailScreen() {
  const { groupId } = useLocalSearchParams();
  const { t } = useTranslation();
  const db = useDb();
  const sync = useSync();
  const snackbar = useSnackbar();
  const styles = useThemedStyles(createStyles);
  const dates = useDateFormat();
  const formatMoney = useFormatMoney();
  // The list starts with the newest expenses and reads further back as it is scrolled.
  const [limit, setLimit] = useState(PAGE);
  const { data: summary, loading } = useDbQuery(
    (db) => getGroupOverview(db, groupId, { limit }),
    [groupId, limit],
    TABLES,
  );
  const { data: removed } = useDbQuery(
    (d) => isRemovedFromGroup(d, groupId),
    [groupId],
    ['sync_groups'],
  );

  const rows = useMemo(
    () => (summary ? buildTimeline(summary.expenses, summary.settlements) : []),
    [summary],
  );

  if (loading || !summary) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header />
      </SafeAreaView>
    );
  }

  const { group, members, self, selfBalance } = summary;
  const currency = group.currency;
  const memberById = new Map(members.map((m) => [m.id, m]));
  const nameOf = (id) => memberLabel(memberById.get(id), t);
  const addMember = () => router.push(`/groups/${group.id}/members/new`);
  const addExpense = () => router.push(`/groups/${group.id}/add-expense`);

  const deleteExpense = (expense) => {
    try {
      softDeleteExpense(db, expense.id);
    } catch (error) {
      reportError(error);
      return;
    }
    snackbar.show({
      message: t('expenseDetail.deleted'),
      onUndo: () => restoreExpense(db, expense.id),
    });
  };

  const balanceLine =
    selfBalance > 0
      ? t('groupDetail.owedToYou', { amount: formatMoney(selfBalance, currency) })
      : selfBalance < 0
        ? t('groupDetail.youOwe', { amount: formatMoney(-selfBalance, currency) })
        : t('groupDetail.settled');

  const header = (
    <View>
      <View style={styles.membersRow}>
        <AvatarGroup members={members} />
        <SyncBadge status={sync.stateOf(group.id)} />
        <AppText variant="caption" color="textMuted">
          {t('groupDetail.currency', { symbol: currencySymbol(currency) })}
        </AppText>
      </View>
      {removed ? (
        <View style={styles.cardWrap}>
          <InfoBox icon={UserMinus}>{t('groupDetail.removed')}</InfoBox>
        </View>
      ) : null}
      <View style={styles.cardWrap}>
        <Card corners style={styles.card}>
          <AppText variant="overline" color="primary">
            {t('groupDetail.netBalance')}
          </AppText>
          <Money minor={selfBalance} currency={currency} tone="auto" signed variant="amountXl" />
          <AppText variant="caption" color="textMuted">
            {balanceLine}
          </AppText>
          <View style={styles.cardActions}>
            <Button
              title={t('groupDetail.settleUp')}
              icon={ArrowLeftRight}
              variant="secondary"
              size="md"
              onPress={() => router.push(`/groups/${group.id}/balances`)}
              style={styles.flex}
              testID="group-settle"
            />
            {removed ? null : (
              <Button
                title={t('groupDetail.invite')}
                icon={QrCode}
                variant="secondary"
                size="md"
                onPress={() => router.push(`/groups/${group.id}/invite`)}
                style={styles.flex}
              />
            )}
          </View>
        </Card>
      </View>
      <ListItem
        onPress={() => router.push(`/groups/${group.id}/members`)}
        leading={<IconBox icon={Users} />}
        title={t('members.header')}
        value={String(members.length)}
        chevron
      />
      <ListItem
        onPress={() => router.push(`/groups/${group.id}/activity`)}
        leading={<IconBox icon={History} />}
        title={t('activity.header')}
        chevron
      />
      <ListItem
        onPress={() => router.push(`/groups/${group.id}/stats`)}
        leading={<IconBox icon={ChartPie} />}
        title={t('stats.header')}
        chevron
      />
    </View>
  );

  const renderExpense = (expense) => {
    // What the expense did to the user's balance: what they paid less their share of it.
    const paid = expense.payerId === self?.id ? expense.amount : 0;
    const effect = paid - (expense.selfShare ?? 0);
    const involved = expense.payerId === self?.id || expense.selfShare != null;
    const paidBy =
      expense.payerId === self?.id
        ? t('groupDetail.paidBySelf', { amount: formatMoney(expense.amount, currency) })
        : t('groupDetail.paidBy', {
            name: nameOf(expense.payerId),
            amount: formatMoney(expense.amount, currency),
          });

    return (
      <SwipeableRow onDelete={() => deleteExpense(expense)} deleteLabel={t('common.delete')}>
        <ListItem
          onPress={() => router.push(`/groups/${group.id}/expense/${expense.id}`)}
          accessibilityActions={[{ name: 'delete', label: t('common.delete') }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'delete') deleteExpense(expense);
          }}
          leading={<IconBox icon={categoryIcon(expense.category)} />}
          title={expense.description}
          titleAccessory={
            expense.hasConflict ? (
              <Icon icon={GitMerge} size={14} color="danger" />
            ) : expense.receiptPath ? (
              <Icon icon={Paperclip} size={14} color="textMuted" />
            ) : null
          }
          subtitle={paidBy}
          trailingCaption={
            expense.hasConflict
              ? t('conflict.badge')
              : !involved
                ? t('groupDetail.notInvolved')
                : effect < 0
                  ? t('groupDetail.owe')
                  : effect > 0
                    ? t('groupDetail.lent')
                    : null
          }
          trailing={
            involved && effect !== 0 ? (
              <Money minor={effect} currency={currency} tone="auto" absolute />
            ) : null
          }
        />
      </SwipeableRow>
    );
  };

  const renderSettlement = (settlement) => {
    const effect =
      settlement.fromMemberId === self?.id
        ? settlement.amount
        : settlement.toMemberId === self?.id
          ? -settlement.amount
          : 0;
    return (
      <ListItem
        leading={<IconBox icon={ArrowLeftRight} color="textMuted" />}
        title={t('groupDetail.settlementTitle', {
          from: nameOf(settlement.fromMemberId),
          to: nameOf(settlement.toMemberId),
        })}
        subtitle={t('groupDetail.settlement')}
        trailing={
          <Money
            minor={effect === 0 ? settlement.amount : effect}
            currency={currency}
            tone={effect === 0 ? 'textMuted' : 'auto'}
            absolute
          />
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {sync.online ? null : <OfflineBanner pendingCount={sync.pendingOf(group.id)} />}
      <Header
        title={group.name}
        subtitle={t('groupDetail.subtitle', {
          type: t(`groupTypes.${group.type}.title`),
          count: members.length,
        })}
        actions={[{ icon: UserPlus, label: t('groupDetail.addMember'), onPress: addMember }]}
      />
      {rows.length === 0 ? (
        <>
          {header}
          <EmptyState
            icon={Receipt}
            title={t('groupDetail.emptyTitle')}
            description={t('groupDetail.emptyBody')}
          >
            <Button
              title={t('groupDetail.emptyAction')}
              corners
              onPress={addExpense}
              testID="expense-add"
            />
            <Button
              title={t('groupDetail.addMember')}
              icon={UserPlus}
              variant="secondary"
              onPress={addMember}
            />
          </EmptyState>
        </>
      ) : (
        <>
          <FlashList
            data={rows}
            keyExtractor={(item) => `${item.kind}:${item.id}`}
            getItemType={(item) => item.kind}
            ListHeaderComponent={header}
            renderItem={({ item }) => {
              if (item.kind === 'day') {
                return <SectionHeader variant="overline" title={dates.sectionHeader(item.date)} />;
              }
              return item.kind === 'expense' ? renderExpense(item.e) : renderSettlement(item.s);
            }}
            onEndReached={() => {
              if (summary.hasMore) setLimit(summary.expenses.length + PAGE);
            }}
            onEndReachedThreshold={0.5}
            contentContainerStyle={styles.listContent}
          />
          <Fab title={t('groupDetail.addExpense')} onPress={addExpense} testID="expense-add" />
        </>
      )}
    </SafeAreaView>
  );
}

const createStyles = ({ colors, spacing, layout }) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    membersRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: layout.gutter,
      paddingBottom: spacing.md,
    },
    cardWrap: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xl },
    card: { gap: spacing.xs },
    cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    listContent: { paddingBottom: 120 },
  });
