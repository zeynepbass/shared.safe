import { useLocalSearchParams } from 'expo-router';
import { ArrowRight, Check, CheckCheck } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  getGroupSnapshot,
  recordSettlement,
  softDeleteSettlement,
  useDb,
  useDbQuery,
} from '@/shared/db';
import { simplifyDebts } from '@ortak-kasa/core/simplify';
import { memberLabel, useGroupSummary } from '@/features/groups/useGroupSummary';
import { todayISO } from '@/shared/lib/dates';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  BalanceBar,
  Button,
  EmptyState,
  Icon,
  Money,
  Screen,
  Header,
  SectionHeader,
  useFormatMoney,
  useSnackbar,
} from '@/shared/ui';

const TABLES = ['members', 'expenses', 'settlements', 'groups'];

export default function BalancesScreen() {
  const { groupId } = useLocalSearchParams();
  const { t } = useTranslation();
  const db = useDb();
  const snackbar = useSnackbar();
  const formatMoney = useFormatMoney();
  const styles = useThemedStyles(createStyles);
  const { data: snapshot } = useDbQuery((d) => getGroupSnapshot(d, groupId), [groupId], TABLES);
  const summary = useGroupSummary(snapshot);

  const transfers = useMemo(
    () =>
      summary ? simplifyDebts(summary.balances, { order: summary.members.map((m) => m.id) }) : [],
    [summary],
  );

  if (!summary) return <Screen header={<Header title={t('balances.header')} />} />;

  const { group, members, balances } = summary;
  const currency = group.currency;
  const memberById = new Map(members.map((m) => [m.id, m]));
  const maxAbs = Math.max(0, ...[...balances.values()].map(Math.abs));

  const markPaid = async (transfer) => {
    const id = await recordSettlement(db, {
      groupId,
      fromMemberId: transfer.from,
      toMemberId: transfer.to,
      amount: transfer.amount,
      paidOn: todayISO(),
    });
    snackbar.show({
      message: t('balances.recorded'),
      onUndo: () => softDeleteSettlement(db, id),
    });
  };

  return (
    <Screen padded={false} header={<Header title={t('balances.header')} subtitle={group.name} />}>
      <SectionHeader title={t('balances.members')} />
      {members.map((member) => {
        const value = balances.get(member.id) ?? 0;
        const label = memberLabel(member, t);
        return (
          <View
            key={member.id}
            style={styles.memberRow}
            accessible
            accessibilityLabel={t('balances.memberA11y', {
              name: label,
              amount: formatMoney(value, currency, { signed: true }),
            })}
          >
            <Avatar
              name={member.name}
              color={member.avatarColor}
              image={member.avatarPath}
              size="md"
            />
            <View style={styles.memberBody}>
              <AppText variant="bodyLg">{label}</AppText>
              <BalanceBar value={value} max={maxAbs} />
            </View>
            <Money minor={value} currency={currency} tone="auto" signed style={styles.amount} />
          </View>
        );
      })}

      <SectionHeader title={t('balances.suggested')} trailing={t('balances.fewest')} />
      {transfers.length === 0 ? (
        <EmptyState icon={CheckCheck} title={t('balances.allSettled')} />
      ) : (
        transfers.map((transfer) => {
          const from = memberById.get(transfer.from);
          const to = memberById.get(transfer.to);
          const fromLabel = memberLabel(from, t);
          const toLabel = memberLabel(to, t);
          return (
            <View key={`${transfer.from}-${transfer.to}`} style={styles.transferRow}>
              <View
                style={styles.transferInfo}
                accessible
                accessibilityLabel={t('balances.transferA11y', {
                  from: fromLabel,
                  to: toLabel,
                  amount: formatMoney(transfer.amount, currency),
                })}
              >
                <View style={styles.pair}>
                  <Avatar
                    name={from?.name}
                    color={from?.avatarColor}
                    image={from?.avatarPath}
                    size="md"
                  />
                  <Icon icon={ArrowRight} size={14} color="textSubtle" />
                  <Avatar
                    name={to?.name}
                    color={to?.avatarColor}
                    image={to?.avatarPath}
                    size="md"
                  />
                </View>
                <View>
                  <AppText variant="caption" color="textMuted">
                    {t('balances.transfer', { from: fromLabel, to: toLabel })}
                  </AppText>
                  <Money minor={transfer.amount} currency={currency} variant="amount" />
                </View>
              </View>
              <Button
                title={t('balances.paid')}
                icon={Check}
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={() => markPaid(transfer)}
              />
            </View>
          );
        })
      )}

      <AppText variant="caption" color="textMuted" style={styles.footnote}>
        {t('balances.footnote')}
      </AppText>
    </Screen>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth }) =>
  StyleSheet.create({
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: layout.gutter,
      paddingVertical: spacing.md,
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.divider,
    },
    memberBody: { flex: 1, gap: spacing.sm },
    amount: { minWidth: 96, textAlign: 'right' },
    transferRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: layout.gutter,
      paddingVertical: spacing.lg,
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.divider,
    },
    transferInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
    pair: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    footnote: { paddingHorizontal: layout.gutter, paddingTop: spacing.xl },
  });
