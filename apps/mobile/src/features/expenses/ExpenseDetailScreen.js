import { router, useLocalSearchParams } from 'expo-router';
import { GitMerge, Pencil, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import {
  getExpense,
  getGroupWithMembers,
  restoreExpense,
  softDeleteExpense,
  useDb,
  useDbQuery,
} from '@/shared/db';
import { memberLabel } from '@/features/groups/useGroupSummary';
import { useSync } from '@/features/sync/SyncProvider';
import { formatAmountInput } from '@ortak-kasa/core/money';
import { useDateFormat } from '@/shared/lib/useDateFormat';
import { reportError } from '@/shared/monitoring';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  Button,
  InfoBox,
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
    getGroupWithMembers(db, groupId),
    getExpense(db, expenseId),
  ]);
  return { snapshot, expense };
}

export default function ExpenseDetailScreen() {
  const { groupId, expenseId } = useLocalSearchParams();
  const { t, i18n } = useTranslation();
  const db = useDb();
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
      {expense.hasConflict ? (
        <View style={styles.conflict}>
          <InfoBox icon={GitMerge}>{t('conflict.banner')}</InfoBox>
          <Button
            title={t('conflict.bannerAction')}
            variant="secondary"
            size="sm"
            onPress={() =>
              router.push({
                pathname: '/groups/[groupId]/expense/[expenseId]/conflict',
                params: { groupId, expenseId: expense.id },
              })
            }
          />
        </View>
      ) : null}
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
              {expense.description}
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
                    <Avatar
                      name={payer?.name}
                      color={payer?.avatarColor}
                      image={payer?.avatarPath}
                      size="xs"
                    />
                    <AppText variant="bodyStrong">{memberLabel(payer, t)}</AppText>
                  </View>
                ),
              },
              { label: t('expenseDetail.date'), value: dates.full(expense.spentOn) },
            ],
          ]}
        />
      </View>

      <Receipt expense={expense} />

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
            leading={
              <Avatar
                name={member?.name}
                color={member?.avatarColor}
                image={member?.avatarPath}
                size="md"
              />
            }
            title={memberLabel(member, t)}
            subtitle={weightCaption(share)}
            trailing={<Money minor={share.amount} currency={currency} />}
          />
        );
      })}
    </Screen>
  );
}

// The receipt photo: this device's copy if it has one; otherwise the photo is fetched from the
// relay (where it lies sealed) when the expense is opened, and kept from then on.
function Receipt({ expense }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { connected, fetchReceipt } = useSync();
  // The fetch that did not bring the photo, if the last one did not: which receipt, which try.
  const [failed, setFailed] = useState(null);
  const [tries, setTries] = useState(0);
  const wanted = Boolean(expense.receiptId) && !expense.receiptPath;

  // Tried when the expense is opened, when the connection comes back and when asked again.
  useEffect(() => {
    if (!wanted || !connected) return undefined;
    let current = true;
    const giveUp = () => current && setFailed({ receiptId: expense.receiptId, tries });
    fetchReceipt(expense.id).then(
      (result) => {
        if (result === 'missing') giveUp();
      },
      (error) => {
        // Offline is the ordinary case; anything else (a file that does not open) is worth
        // knowing about.
        if (!['offline', 'timeout', 'closed'].includes(error?.message)) {
          reportError(error, 'receipt-fetch');
        }
        giveUp();
      },
    );
    return () => {
      current = false;
    };
    // fetchReceipt changes with every sync status update; the fetch should not restart then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, connected, expense.id, expense.receiptId, tries]);

  const unavailable =
    !connected || (failed?.receiptId === expense.receiptId && failed.tries === tries);

  if (!expense.receiptId && !expense.receiptPath) return null;

  return (
    <View style={styles.receipt}>
      <BlueprintGrid cell={20} style={styles.receiptFrame}>
        {expense.receiptPath ? (
          <Image
            source={{ uri: expense.receiptPath }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            accessibilityLabel={t('expenseDetail.receipt')}
          />
        ) : unavailable ? (
          <View style={styles.receiptStatus}>
            <AppText variant="caption" color="textMuted" align="center">
              {t('expenseDetail.receiptUnavailable')}
            </AppText>
            <Button
              title={t('expenseDetail.receiptRetry')}
              variant="ghost"
              onPress={() => setTries((n) => n + 1)}
              disabled={!connected}
            />
          </View>
        ) : (
          <View
            style={styles.receiptStatus}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('expenseDetail.receiptLoading')}
          >
            <ActivityIndicator />
            <AppText variant="caption" color="textMuted">
              {t('expenseDetail.receiptLoading')}
            </AppText>
          </View>
        )}
      </BlueprintGrid>
      <AppText variant="caption" color="textMuted">
        {t('expenseDetail.receiptCaption')}
      </AppText>
    </View>
  );
}

const createStyles = ({ spacing, layout }) =>
  StyleSheet.create({
    conflict: { gap: spacing.sm, paddingHorizontal: layout.gutter, paddingTop: spacing.md },
    flex: { flex: 1 },
    top: { paddingHorizontal: layout.gutter, gap: spacing.lg, paddingTop: spacing.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    title: { fontSize: 22, lineHeight: 26 },
    inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    receipt: { paddingHorizontal: layout.gutter, paddingTop: spacing.xl, gap: spacing.sm },
    receiptFrame: { height: 200 },
    receiptStatus: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
  });
