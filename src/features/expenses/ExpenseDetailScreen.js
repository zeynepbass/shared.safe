import { useSQLiteContext } from 'expo-sqlite';
import { router, useLocalSearchParams } from 'expo-router';
import { Pencil, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { getExpense, getGroupSnapshot, restoreExpense, softDeleteExpense, useDbQuery } from '@/db';
import { memberLabel } from '@/features/groups/useGroupSummary';
import { formatAmountInput } from '@/shared/lib/money';
import { useDateFormat } from '@/shared/lib/useDateFormat';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  BlueprintGrid,
  EmptyState,
  IconBox,
  ListItem,
  Money,
  Screen,
  Header,
  SectionHeader,
  StatGrid,
  useSnackbar,
} from '@/shared/ui';

import { categoryIcon } from './categories';

async function loadDetail(db, groupId, expenseId) {
  const [snapshot, expense] = await Promise.all([
    getGroupSnapshot(db, groupId),
    getExpense(db, expenseId),
  ]);
  return { snapshot, expense };
}

export default function ExpenseDetailScreen() {
  const { groupId, expenseId } = useLocalSearchParams();
  const { t, i18n } = useTranslation();
  const db = useSQLiteContext();
  const snackbar = useSnackbar();
  const dates = useDateFormat();
  const styles = useThemedStyles(createStyles);
  const { data, loading } = useDbQuery(
    (d) => loadDetail(d, groupId, expenseId),
    [groupId, expenseId],
    ['expenses', 'members', 'groups'],
  );

  if (loading) return <Screen header={<Header title={t('expenseDetail.header')} />} />;

  const expense = data?.expense;
  const snapshot = data?.snapshot;

  if (!expense || expense.deletedAt || !snapshot) {
    return (
      <Screen header={<Header title={t('expenseDetail.header')} />}>
        <EmptyState icon={Trash2} title={t('expenseDetail.notFound')} />
      </Screen>
    );
  }

  const { group, members } = snapshot;
  const currency = group.currency;
  const memberById = new Map(members.map((m) => [m.id, m]));
  const payer = memberById.get(expense.payerId);

  const remove = async () => {
    await softDeleteExpense(db, expense.id);
    router.back();
    snackbar.show({
      message: t('expenseDetail.deleted'),
      onUndo: () => restoreExpense(db, expense.id),
    });
  };

  const weightCaption = (share) => {
    if (expense.splitType === 'percent') {
      return t('split.percentOf', {
        value: formatAmountInput(share.weight ?? 0, { locale: i18n.language }),
      });
    }
    if (expense.splitType === 'shares') return t('split.sharesUnit', { count: share.weight ?? 0 });
    return null;
  };

  return (
    <Screen
      padded={false}
      header={
        <Header
          title={t('expenseDetail.header')}
          actions={[
            {
              icon: Pencil,
              label: t('common.edit'),
              onPress: () =>
                router.push({
                  pathname: '/groups/[groupId]/add-expense',
                  params: { groupId, expenseId: expense.id },
                }),
            },
            { icon: Trash2, label: t('common.delete'), onPress: remove },
          ]}
        />
      }
    >
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <IconBox icon={categoryIcon(expense.category)} size={44} iconSize={20} />
          <View style={styles.flex}>
            <AppText variant="overline" color="primary" numberOfLines={1}>
              {t('expenseDetail.eyebrow', {
                category: t(`categories.${expense.category}`),
                group: group.name,
              })}
            </AppText>
            <AppText variant="headerTitle" style={styles.title}>
              {expense.title}
            </AppText>
          </View>
        </View>
        <Money minor={expense.amount} currency={currency} variant="amountLg" />
        <StatGrid
          rows={[
            [
              {
                label: t('expenseDetail.payer'),
                value: (
                  <View style={styles.inline}>
                    <Avatar name={payer?.name} color={payer?.color} size="xs" />
                    <AppText variant="bodyStrong">{memberLabel(payer, t)}</AppText>
                  </View>
                ),
              },
              { label: t('expenseDetail.date'), value: dates.full(expense.spentOn) },
            ],
          ]}
        />
      </View>

      {expense.receiptUri ? (
        <View style={styles.receipt}>
          <BlueprintGrid cell={20} style={styles.receiptFrame}>
            <Image
              source={{ uri: expense.receiptUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              accessibilityLabel={t('expenseDetail.receipt')}
            />
          </BlueprintGrid>
          <AppText variant="caption" color="textMuted">
            {t('expenseDetail.receiptCaption')}
          </AppText>
        </View>
      ) : null}

      <SectionHeader
        title={t('expenseDetail.split')}
        trailing={
          <AppText variant="overline" color="primary">
            {t(`splitTypes.${expense.splitType}`)}
          </AppText>
        }
      />
      {expense.shares.map((share) => {
        const member = memberById.get(share.memberId);
        return (
          <ListItem
            key={share.memberId}
            leading={<Avatar name={member?.name} color={member?.color} size="md" />}
            title={memberLabel(member, t)}
            subtitle={weightCaption(share)}
            trailing={<Money minor={share.amount} currency={currency} />}
          />
        );
      })}
    </Screen>
  );
}

const createStyles = ({ spacing, layout }) =>
  StyleSheet.create({
    flex: { flex: 1 },
    top: { paddingHorizontal: layout.gutter, gap: spacing.lg, paddingTop: spacing.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    title: { fontSize: 22, lineHeight: 26 },
    inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    receipt: { paddingHorizontal: layout.gutter, paddingTop: spacing.xl, gap: spacing.sm },
    receiptFrame: { height: 200 },
  });
