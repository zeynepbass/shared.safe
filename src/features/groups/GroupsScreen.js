import { router } from 'expo-router';
import { Plus, Settings, Users } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listGroupSnapshots, useDbQuery } from '@/db';
import { useSettings } from '@/features/settings/SettingsProvider';
import { currencySymbol } from '@/shared/lib/money';
import { useDateFormat } from '@/shared/lib/useDateFormat';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  BrandBar,
  Button,
  Card,
  EmptyState,
  Fab,
  IconBox,
  ListRow,
  Money,
  SectionHeader,
  Skeleton,
  StatGrid,
} from '@/shared/ui';

import { groupTypeIcon } from './groupTypes';
import { memberLabel, summarizeGroup } from './useGroupSummary';

const TABLES = ['groups', 'members', 'expenses', 'settlements', 'settings'];

function statusKey(balance) {
  if (balance > 0) return 'groups.statusCreditor';
  if (balance < 0) return 'groups.statusDebtor';
  return 'groups.statusSettled';
}

export default function GroupsScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { defaultCurrency } = useSettings();
  const dates = useDateFormat();
  const { data, loading } = useDbQuery(listGroupSnapshots, [], TABLES);

  const groups = useMemo(() => (data ?? []).map(summarizeGroup), [data]);

  const totals = useMemo(() => {
    const inCurrency = groups.filter((g) => g.group.currency === defaultCurrency);
    const receivable = inCurrency.reduce((s, g) => s + Math.max(g.selfBalance, 0), 0);
    const payable = inCurrency.reduce((s, g) => s + Math.min(g.selfBalance, 0), 0);
    return {
      net: receivable + payable,
      receivable,
      payable,
      debtCount: groups.filter((g) => g.selfBalance < 0).length,
      mixed: inCurrency.length !== groups.length,
    };
  }, [groups, defaultCurrency]);

  const brandActions = [
    { icon: Settings, label: t('groups.settings'), onPress: () => router.push('/settings') },
  ];

  if (loading) return <LoadingState actions={brandActions} />;

  if (groups.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <BrandBar actions={brandActions} />
        <AppText variant="title" style={styles.title} accessibilityRole="header">
          {t('groups.title')}
        </AppText>
        <EmptyState icon={Users} title={t('groups.emptyTitle')} description={t('groups.emptyBody')}>
          <Button
            title={t('groups.createGroup')}
            icon={Plus}
            corners
            onPress={() => router.push('/groups/new')}
          />
        </EmptyState>
      </SafeAreaView>
    );
  }

  const lastExpenseLine = (group) => {
    const last = group.expenses[0];
    if (!last) return t('groups.noExpenses');
    const payer = group.members.find((m) => m.id === last.payerId);
    return t('groups.lastExpense', {
      payer: memberLabel(payer, t),
      title: last.title,
      date: dates.short(last.spentOn),
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <BrandBar actions={brandActions} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title" style={styles.title} accessibilityRole="header">
          {t('groups.title')}
        </AppText>

        <View style={styles.summaryWrap}>
          <Card corners padded={false}>
            <View style={styles.summary}>
              <AppText variant="overline" color="primary">
                {t('groups.totalNet')}
              </AppText>
              <Money minor={totals.net} currency={defaultCurrency} tone="auto" variant="amountXl" />
              <AppText variant="caption" color="textMuted">
                {totals.debtCount > 0
                  ? t('groups.summary', { count: groups.length, debtCount: totals.debtCount })
                  : t('groups.summaryNoDebt', { count: groups.length })}
                {totals.mixed
                  ? `\n${t('groups.summaryOtherCurrency', { currency: currencySymbol(defaultCurrency) })}`
                  : ''}
              </AppText>
            </View>
            <StatGrid
              style={styles.statGrid}
              rows={[
                [
                  {
                    label: t('groups.receivable'),
                    value: (
                      <Money
                        minor={totals.receivable}
                        currency={defaultCurrency}
                        tone={totals.receivable > 0 ? 'success' : 'neutral'}
                        variant="bodyStrong"
                      />
                    ),
                  },
                  {
                    label: t('groups.payable'),
                    value: (
                      <Money
                        minor={totals.payable}
                        currency={defaultCurrency}
                        tone={totals.payable < 0 ? 'danger' : 'neutral'}
                        absolute
                        variant="bodyStrong"
                      />
                    ),
                  },
                ],
              ]}
            />
          </Card>
        </View>

        <SectionHeader title={t('groups.mine')} />
        {groups.map((g) => (
          <ListRow
            key={g.group.id}
            onPress={() => router.push(`/groups/${g.group.id}`)}
            leading={<IconBox icon={groupTypeIcon(g.group.type)} />}
            title={g.group.name}
            subtitle={lastExpenseLine(g)}
            trailing={
              <>
                <Money minor={g.selfBalance} currency={g.group.currency} tone="auto" absolute />
                <AppText variant="caption" color="textMuted">
                  {t(statusKey(g.selfBalance))}
                </AppText>
              </>
            }
          />
        ))}
      </ScrollView>
      <Fab title={t('groups.newGroup')} onPress={() => router.push('/groups/new')} />
    </SafeAreaView>
  );
}

function LoadingState({ actions }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  return (
    <SafeAreaView style={styles.safe}>
      <BrandBar actions={actions} />
      <AppText variant="title" style={styles.title}>
        {t('groups.title')}
      </AppText>
      <View style={styles.skeleton} accessibilityLabel={t('groups.title')} accessible>
        <Skeleton height={148} />
        <Skeleton width={80} height={10} style={styles.skeletonLabel} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonRow}>
            <Skeleton width={36} height={36} />
            <View style={styles.skeletonLines}>
              <Skeleton width="60%" height={10} />
              <Skeleton width="85%" height={8} />
            </View>
            <Skeleton width={56} height={10} />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const createStyles = ({ colors, spacing, layout }) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: { paddingBottom: 120 },
    title: {
      paddingHorizontal: layout.gutter,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    },
    summaryWrap: { paddingHorizontal: layout.gutter },
    summary: { padding: spacing.lg, gap: spacing.xs },
    statGrid: { borderLeftWidth: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    skeleton: { paddingHorizontal: layout.gutter, gap: spacing.md },
    skeletonLabel: { marginTop: spacing.lg },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 56 },
    skeletonLines: { flex: 1, gap: spacing.sm },
  });
