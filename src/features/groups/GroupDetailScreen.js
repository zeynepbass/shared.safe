import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeftRight, Paperclip, Receipt, UserPlus } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getGroupSnapshot, useDbQuery } from '@/db';
import { effectOnMember } from '@/domain/balances';
import { categoryIcon } from '@/features/expenses/categories';
import { currencySymbol } from '@/shared/lib/money';
import { useDateFormat } from '@/shared/lib/useDateFormat';
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
  ListItem,
  Money,
  Header,
  SectionHeader,
  useFormatMoney,
} from '@/shared/ui';

import { memberLabel, useGroupSummary } from './useGroupSummary';

const TABLES = ['groups', 'members', 'expenses', 'settlements', 'settings'];

function buildTimeline(expenses, settlements) {
  const items = [
    ...expenses.map((e) => ({ kind: 'expense', id: e.id, date: e.spentOn, at: e.createdAt, e })),
    ...settlements.map((s) => ({
      kind: 'settlement',
      id: s.id,
      date: s.paidOn,
      at: s.createdAt,
      s,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);

  const sections = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (last?.date === item.date) last.data.push(item);
    else sections.push({ date: item.date, data: [item] });
  }
  return sections;
}

export default function GroupDetailScreen() {
  const { groupId } = useLocalSearchParams();
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const dates = useDateFormat();
  const formatMoney = useFormatMoney();
  const { data: snapshot, loading } = useDbQuery(
    (db) => getGroupSnapshot(db, groupId),
    [groupId],
    TABLES,
  );
  const summary = useGroupSummary(snapshot);

  const sections = useMemo(
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
        <AppText variant="caption" color="textMuted">
          {t('groupDetail.currency', { symbol: currencySymbol(currency) })}
        </AppText>
      </View>
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
            />
            <Button
              title={t('groupDetail.addMember')}
              icon={UserPlus}
              variant="secondary"
              size="md"
              onPress={addMember}
              style={styles.flex}
            />
          </View>
        </Card>
      </View>
    </View>
  );

  const renderExpense = (expense) => {
    const effect = self ? effectOnMember(expense, self.id) : 0;
    const involved =
      expense.payerId === self?.id || expense.shares.some((s) => s.memberId === self?.id);
    const paidBy =
      expense.payerId === self?.id
        ? t('groupDetail.paidBySelf', { amount: formatMoney(expense.amount, currency) })
        : t('groupDetail.paidBy', {
            name: nameOf(expense.payerId),
            amount: formatMoney(expense.amount, currency),
          });

    return (
      <ListItem
        onPress={() => router.push(`/groups/${group.id}/expense/${expense.id}`)}
        leading={<IconBox icon={categoryIcon(expense.category)} />}
        title={expense.title}
        titleAccessory={
          expense.receiptUri ? <Icon icon={Paperclip} size={14} color="textMuted" /> : null
        }
        subtitle={paidBy}
        trailingCaption={
          !involved
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
      <Header
        title={group.name}
        subtitle={t('groupDetail.subtitle', {
          type: t(`groupTypes.${group.type}.title`),
          count: members.length,
        })}
        actions={[{ icon: UserPlus, label: t('groupDetail.addMember'), onPress: addMember }]}
      />
      {sections.length === 0 ? (
        <>
          {header}
          <EmptyState
            icon={Receipt}
            title={t('groupDetail.emptyTitle')}
            description={t('groupDetail.emptyBody')}
          >
            <Button title={t('groupDetail.emptyAction')} corners onPress={addExpense} />
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
          <SectionList
            sections={sections}
            keyExtractor={(item) => `${item.kind}:${item.id}`}
            ListHeaderComponent={header}
            renderSectionHeader={({ section }) => (
              <SectionHeader variant="overline" title={dates.sectionHeader(section.date)} />
            )}
            renderItem={({ item }) =>
              item.kind === 'expense' ? renderExpense(item.e) : renderSettlement(item.s)
            }
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.listContent}
          />
          <Fab title={t('groupDetail.addExpense')} onPress={addExpense} />
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
