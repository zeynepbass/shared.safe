import { router, useLocalSearchParams } from 'expo-router';
import { CheckCheck, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { memberLabel } from '@/features/groups/useGroupSummary';
import {
  getExpenseConflict,
  getGroup,
  listMembers,
  resolveConflict,
  useDb,
  useDbQuery,
} from '@/shared/db';
import { useDateFormat } from '@/shared/lib/useDateFormat';
import { reportError } from '@/shared/monitoring';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  Money,
  Screen,
  useSnackbar,
} from '@/shared/ui';

const COMPARED = ['description', 'amount', 'payerId', 'spentOn', 'category', 'splitType', 'shares'];

function loadConflict(db, expenseId) {
  const conflict = getExpenseConflict(db, expenseId);
  if (!conflict) return { conflict: null };
  return {
    conflict,
    group: getGroup(db, conflict.groupId),
    members: listMembers(db, conflict.groupId),
  };
}

// Fields whose value is not the same in every version, so they can be pointed out.
function differingFields(versions) {
  return new Set(
    COMPARED.filter((field) => new Set(versions.map((v) => JSON.stringify(v[field]))).size > 1),
  );
}

function Field({ changed, children }) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.field, changed && styles.changed]}>{children}</View>;
}

export default function ConflictScreen() {
  const { expenseId } = useLocalSearchParams();
  const { t } = useTranslation();
  const db = useDb();
  const snackbar = useSnackbar();
  const dates = useDateFormat();
  const styles = useThemedStyles(createStyles);
  const { data, loading } = useDbQuery(
    (d) => loadConflict(d, expenseId),
    [expenseId],
    ['expenses', 'members'],
  );

  const header = <Header title={t('conflict.header')} subtitle={data?.group?.name} />;
  if (loading) return <Screen header={header} />;
  if (!data.conflict) {
    return (
      <Screen header={header}>
        <EmptyState icon={CheckCheck} title={t('conflict.none')} />
      </Screen>
    );
  }

  const { versions } = data.conflict;
  const differs = differingFields(versions);
  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const nameOf = (id) => memberLabel(memberById.get(id), t);
  const currency = data.group.currency;

  const keep = (index) => {
    try {
      resolveConflict(db, expenseId, index);
      snackbar.show({ message: t('conflict.resolved') });
      router.back();
    } catch (error) {
      reportError(error);
      Alert.alert(t('common.error'));
    }
  };

  return (
    <Screen header={header}>
      <View style={styles.intro}>
        <AppText variant="heading">{t('conflict.title')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('conflict.body')}
        </AppText>
      </View>

      {versions.map((version, index) => (
        <Card key={index} corners style={styles.card}>
          <View style={styles.cardHeader}>
            <AppText variant="overline" color="primary">
              {t('conflict.version', { index: index + 1 })}
            </AppText>
            {index === 0 ? <Badge label={t('conflict.shownNow')} /> : null}
          </View>

          {version.deletedAt ? (
            <View style={styles.deleted}>
              <Icon icon={Trash2} size={18} color="danger" />
              <AppText variant="bodyStrong" color="danger">
                {t('conflict.deleted')}
              </AppText>
            </View>
          ) : null}

          <Field changed={differs.has('description')}>
            <AppText variant="bodyLg">{version.description}</AppText>
          </Field>
          <Field changed={differs.has('amount')}>
            <Money minor={version.amount} currency={currency} variant="amount" />
          </Field>
          <Field changed={differs.has('payerId')}>
            <AppText variant="body">
              {t('conflict.paidBy', { name: nameOf(version.payerId) })}
            </AppText>
          </Field>
          <Field changed={differs.has('spentOn')}>
            <AppText variant="body" color="textMuted">
              {dates.full(version.spentOn)} · {t(`categories.${version.category}`)}
            </AppText>
          </Field>
          <Field changed={differs.has('shares')}>
            <AppText variant="caption" color="textMuted">
              {t('conflict.split', {
                type: t(`splitTypes.${version.splitType}`),
                count: version.shares.length,
              })}
            </AppText>
            {version.shares.map((share) => (
              <View key={share.memberId} style={styles.share}>
                <AppText variant="body">{nameOf(share.memberId)}</AppText>
                <Money minor={share.amount} currency={currency} />
              </View>
            ))}
          </Field>

          <Button
            title={version.deletedAt ? t('conflict.keepDeleted') : t('conflict.keep')}
            variant={index === 0 ? 'primary' : 'secondary'}
            onPress={() => keep(index)}
            style={styles.keep}
          />
        </Card>
      ))}
    </Screen>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    intro: { gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.lg },
    card: { gap: spacing.sm, marginBottom: spacing.lg },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    deleted: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    field: {
      gap: spacing.xxs,
      paddingLeft: spacing.sm,
      borderLeftWidth: borderWidth.thick,
      borderLeftColor: 'transparent',
    },
    // Marks what differs between the versions without relying on colour alone: a bar beside it.
    changed: { borderLeftColor: colors.primary },
    share: { flexDirection: 'row', justifyContent: 'space-between' },
    keep: { marginTop: spacing.sm },
  });
