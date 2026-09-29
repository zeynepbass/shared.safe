import { useLocalSearchParams } from 'expo-router';
import { ChartPie, Table } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { categoryIcon } from '@/features/expenses/categories';
import { getGroupStats, useDbQuery } from '@/shared/db';
import { todayISO } from '@/shared/lib/dates';
import { useDateFormat } from '@/shared/lib/useDateFormat';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  EmptyState,
  Header,
  ListItem,
  Money,
  Screen,
  SectionHeader,
  StatGrid,
  useFormatMoney,
} from '@/shared/ui';
import { CategoryBarChart, MonthlyBarChart } from '@/shared/ui/charts';

const TABLES = ['expenses', 'groups'];
const MONTHS = 6;

export default function StatsScreen() {
  const { groupId } = useLocalSearchParams();
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const dates = useDateFormat();
  const formatMoney = useFormatMoney();
  const [asTable, setAsTable] = useState(false);
  const { data: stats } = useDbQuery(
    (db) => getGroupStats(db, groupId, { months: MONTHS, today: todayISO() }),
    [groupId],
    TABLES,
  );

  const header = (
    <Header
      title={t('stats.header')}
      subtitle={stats?.group.name}
      actions={
        stats?.totals.count
          ? [
              {
                icon: asTable ? ChartPie : Table,
                label: asTable ? t('stats.chartView') : t('stats.tableView'),
                onPress: () => setAsTable((value) => !value),
              },
            ]
          : []
      }
    />
  );
  if (!stats) return <Screen header={header} />;

  const currency = stats.group.currency;
  const money = (amount) => formatMoney(amount, currency);
  const categoryLabel = (id) => t(`categories.${id}`);
  const monthlyTotal = stats.byMonth.reduce((sum, m) => sum + m.amount, 0);

  if (stats.totals.count === 0) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={ChartPie}
          title={t('stats.emptyTitle')}
          description={t('stats.emptyBody')}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} header={header}>
      <View style={styles.padded}>
        <StatGrid
          rows={[
            [
              {
                label: t('stats.total'),
                value: (
                  <Money minor={stats.totals.total} currency={currency} variant="bodyStrong" />
                ),
              },
              {
                label: t('stats.count'),
                value: <AppText variant="bodyStrong">{stats.totals.count}</AppText>,
              },
              {
                label: t('stats.monthlyAverage'),
                value: (
                  <Money
                    minor={Math.round(monthlyTotal / MONTHS)}
                    currency={currency}
                    variant="bodyStrong"
                  />
                ),
              },
            ],
          ]}
        />
      </View>

      <SectionHeader title={t('stats.byCategory')} />
      {asTable ? (
        stats.byCategory.map((row) => (
          <ListItem
            key={row.category}
            title={categoryLabel(row.category)}
            subtitle={`${Math.round((row.amount / stats.totals.total) * 100)}%`}
            trailing={<Money minor={row.amount} currency={currency} />}
          />
        ))
      ) : (
        <View style={styles.padded}>
          <CategoryBarChart
            data={stats.byCategory}
            formatValue={money}
            labelOf={categoryLabel}
            iconOf={categoryIcon}
            a11yLabel={(row) =>
              t('stats.categoryA11y', {
                label: categoryLabel(row.category),
                amount: money(row.amount),
                percent: Math.round((row.amount / stats.totals.total) * 100),
              })
            }
          />
        </View>
      )}

      <SectionHeader title={t('stats.byMonth')} />
      {asTable ? (
        stats.byMonth.map((row) => (
          <ListItem
            key={row.month}
            title={dates.monthShort(row.month)}
            subtitle={row.month.slice(0, 4)}
            trailing={<Money minor={row.amount} currency={currency} />}
          />
        ))
      ) : (
        <View style={[styles.padded, styles.chart]}>
          <MonthlyBarChart
            data={stats.byMonth}
            formatValue={money}
            formatLabel={dates.monthShort}
            a11yLabel={(row) =>
              t('stats.barA11y', { label: dates.monthShort(row.month), amount: money(row.amount) })
            }
          />
        </View>
      )}
    </Screen>
  );
}

const createStyles = ({ spacing, layout }) =>
  StyleSheet.create({
    padded: { paddingHorizontal: layout.gutter },
    chart: { paddingBottom: spacing.xxl },
  });
