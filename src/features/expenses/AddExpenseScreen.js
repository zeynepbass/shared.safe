import { useSQLiteContext } from 'expo-sqlite';
import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, Check, ChevronDown, ChevronRight, Receipt, Split } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { createExpense, getExpense, getGroupSnapshot, updateExpense, useDbQuery } from '@/db';
import { memberLabel, selfMember } from '@/features/groups/useGroupSummary';
import { todayISO } from '@/shared/lib/dates';
import {
  applyKeypadInput,
  currencySymbol,
  formatAmountInput,
  formatKeypadDisplay,
} from '@/shared/lib/money';
import { useDateFormat } from '@/shared/lib/useDateFormat';
import { useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  BottomBar,
  Button,
  Chip,
  Icon,
  Keypad,
  OptionSheet,
  Screen,
  ScreenHeader,
  StatCell,
  TextField,
  useToast,
} from '@/shared/ui';

import { CATEGORIES } from './categories';
import { DateSheet } from './DateSheet';
import {
  clearDraft,
  draftSplit,
  draftTotal,
  participantsFromShares,
  startDraft,
  updateDraft,
  useDraft,
} from './draftStore';
import { deleteReceipt, pickReceipt } from './receipts';

const TABLES = ['groups', 'members', 'expenses'];

async function loadForm(db, groupId, expenseId) {
  const [snapshot, expense] = await Promise.all([
    getGroupSnapshot(db, groupId),
    expenseId ? getExpense(db, expenseId) : null,
  ]);
  return { snapshot, expense };
}

export default function AddExpenseScreen() {
  const { groupId, expenseId } = useLocalSearchParams();
  const { t, i18n } = useTranslation();
  const db = useSQLiteContext();
  const toast = useToast();
  const dates = useDateFormat();
  const styles = useThemedStyles(createStyles);
  const draft = useDraft();
  const [sheet, setSheet] = useState(null);
  const [saving, setSaving] = useState(false);
  const locale = i18n.language;
  const draftKey = `${groupId}:${expenseId ?? 'new'}`;

  const { data } = useDbQuery((d) => loadForm(d, groupId, expenseId), [groupId, expenseId], TABLES);
  const members = data?.snapshot?.members;
  const group = data?.snapshot?.group;

  useEffect(() => {
    if (!members || draft?.key === draftKey) return;
    const expense = data.expense;
    startDraft({
      key: draftKey,
      groupId,
      expenseId: expense?.id ?? null,
      amountInput: expense ? formatAmountInput(expense.amount, { locale }) : '',
      title: expense?.title ?? '',
      category: expense?.category ?? 'market',
      payerId: expense?.payerId ?? selfMember(members)?.id ?? members[0]?.id,
      spentOn: expense?.spentOn ?? todayISO(),
      splitType: expense?.splitType ?? 'equal',
      participants: participantsFromShares(
        members,
        expense?.splitType ?? 'equal',
        expense?.shares ?? [],
      ),
      receiptUri: expense?.receiptUri ?? null,
      originalReceiptUri: expense?.receiptUri ?? null,
    });
  }, [members, data, draft?.key, draftKey, groupId, locale]);

  useEffect(() => () => clearDraft(), []);

  if (!draft || draft.key !== draftKey || !group) {
    return <Screen header={<ScreenHeader leading="close" />} />;
  }

  const currency = group.currency;
  const total = draftTotal(draft, locale);
  const split = draftSplit(draft, locale);
  const includedCount = draft.participants.filter((p) => p.included).length;
  const canSave = total > 0 && split.valid && !saving;
  const payer = members.find((m) => m.id === draft.payerId);

  const onKey = (key) =>
    updateDraft((d) => ({ amountInput: applyKeypadInput(d.amountInput, key, { locale }) }));

  const chooseReceipt = async (choice) => {
    setSheet(null);
    if (choice === 'remove') {
      if (draft.receiptUri !== draft.originalReceiptUri) deleteReceipt(draft.receiptUri);
      updateDraft({ receiptUri: null });
      return;
    }
    try {
      const result = await pickReceipt(choice);
      if (result.status === 'denied') Alert.alert(t('expenseForm.receiptPermission'));
      if (result.status === 'ok') {
        if (draft.receiptUri && draft.receiptUri !== draft.originalReceiptUri) {
          deleteReceipt(draft.receiptUri);
        }
        updateDraft({ receiptUri: result.uri });
      }
    } catch (error) {
      console.error(error);
      Alert.alert(t('common.error'));
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const input = {
      groupId,
      title: draft.title.trim() || t(`categories.${draft.category}`),
      amount: total,
      category: draft.category,
      payerId: draft.payerId,
      splitType: draft.splitType,
      spentOn: draft.spentOn,
      receiptUri: draft.receiptUri,
      shares: split.shares,
    };
    try {
      if (draft.expenseId) {
        await updateExpense(db, draft.expenseId, input);
        if (draft.originalReceiptUri && draft.originalReceiptUri !== draft.receiptUri) {
          deleteReceipt(draft.originalReceiptUri);
        }
      } else {
        await createExpense(db, input);
      }
      toast.show({ message: t(draft.expenseId ? 'expenseForm.updated' : 'expenseForm.saved') });
      router.back();
    } catch (error) {
      console.error(error);
      Alert.alert(t('common.error'));
      setSaving(false);
    }
  };

  const close = () => {
    if (draft.receiptUri && draft.receiptUri !== draft.originalReceiptUri) {
      deleteReceipt(draft.receiptUri);
    }
    router.back();
  };

  const splitLabel = split.valid
    ? t('expenseForm.splitSummary', {
        type: t(`splitTypes.${draft.splitType}`),
        count: includedCount,
      })
    : t('expenseForm.splitInvalid');

  return (
    <Screen
      scroll={false}
      padded={false}
      header={
        <ScreenHeader
          title={draft.expenseId ? t('expenseForm.editHeader') : t('expenseForm.header')}
          subtitle={group.name}
          leading="close"
          onLeadingPress={close}
        />
      }
      footer={
        <BottomBar>
          <Button title={t('common.save')} onPress={save} disabled={!canSave} loading={saving} />
        </BottomBar>
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.amountRow}>
          <View
            style={styles.amount}
            accessible
            accessibilityLabel={`${t('expenseForm.amountLabel')}: ${formatKeypadDisplay(draft.amountInput, { locale })} ${currencySymbol(currency)}`}
          >
            <AppText variant="heading" color="primary" style={styles.currency}>
              {currencySymbol(currency)}
            </AppText>
            <AppText variant="amountXl" tabular numberOfLines={1} adjustsFontSizeToFit>
              {formatKeypadDisplay(draft.amountInput, { locale })}
            </AppText>
          </View>
          <Pressable
            onPress={() => setSheet('receipt')}
            accessibilityRole="button"
            accessibilityLabel={
              draft.receiptUri ? t('expenseForm.receiptAttached') : t('expenseForm.receipt')
            }
            style={styles.receiptButton}
          >
            <Icon icon={draft.receiptUri ? Check : Receipt} size={14} color="primary" />
            <AppText variant="caption" color="primary">
              {t('expenseForm.receipt')}
            </AppText>
          </Pressable>
        </View>

        <View style={styles.padded}>
          <TextField
            placeholder={t('expenseForm.titlePlaceholder')}
            accessibilityLabel={t('expenseForm.titlePlaceholder')}
            value={draft.title}
            onChangeText={(title) => updateDraft({ title })}
            maxLength={60}
            returnKeyType="done"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityRole="radiogroup"
        >
          {CATEGORIES.map((category) => (
            <Chip
              key={category.id}
              icon={category.icon}
              label={t(`categories.${category.id}`)}
              selected={draft.category === category.id}
              onPress={() => updateDraft({ category: category.id })}
            />
          ))}
        </ScrollView>

        <View style={[styles.grid, styles.gridMargin]}>
          <View style={styles.gridRow}>
            <StatCell
              label={t('expenseForm.payer')}
              onPress={() => setSheet('payer')}
              accessibilityLabel={`${t('expenseForm.payer')}: ${memberLabel(payer, t)}`}
            >
              <View style={styles.cellValue}>
                <Avatar name={payer?.name} color={payer?.color} size="xs" />
                <AppText variant="bodyStrong">{memberLabel(payer, t)}</AppText>
                <Icon icon={ChevronDown} size={14} color="textMuted" />
              </View>
            </StatCell>
            <StatCell
              label={t('expenseForm.date')}
              onPress={() => setSheet('date')}
              divider
              accessibilityLabel={`${t('expenseForm.date')}: ${dates.short(draft.spentOn)}`}
            >
              <View style={styles.cellValue}>
                <Icon icon={Calendar} size={14} />
                <AppText variant="bodyStrong">{dates.short(draft.spentOn)}</AppText>
                <Icon icon={ChevronDown} size={14} color="textMuted" />
              </View>
            </StatCell>
          </View>
          <StatCell
            label={t('expenseForm.split')}
            onPress={() => router.push(`/groups/${groupId}/add-expense/split`)}
            accessibilityLabel={`${t('expenseForm.split')}: ${splitLabel}`}
          >
            <View style={styles.cellValue}>
              <Icon icon={Split} size={14} color={split.valid ? 'text' : 'danger'} />
              <AppText
                variant="bodyStrong"
                color={split.valid || total === 0 ? 'text' : 'danger'}
                style={styles.flex}
              >
                {splitLabel}
              </AppText>
              <Icon icon={ChevronRight} size={14} color="textMuted" />
            </View>
          </StatCell>
        </View>

        <View style={styles.keypad}>
          <Keypad onKey={onKey} decimalSeparator={locale === 'tr' ? ',' : '.'} />
        </View>
      </ScrollView>

      <OptionSheet
        visible={sheet === 'payer'}
        title={t('expenseForm.choosePayer')}
        value={draft.payerId}
        onClose={() => setSheet(null)}
        onSelect={(payerId) => {
          updateDraft({ payerId });
          setSheet(null);
        }}
        options={members.map((m) => ({
          value: m.id,
          label: memberLabel(m, t),
          leading: <Avatar name={m.name} color={m.color} size="sm" />,
        }))}
      />
      <OptionSheet
        visible={sheet === 'receipt'}
        title={t('expenseForm.receipt')}
        onClose={() => setSheet(null)}
        onSelect={chooseReceipt}
        options={[
          { value: 'camera', label: t('expenseForm.receiptTake') },
          { value: 'library', label: t('expenseForm.receiptPick') },
          ...(draft.receiptUri ? [{ value: 'remove', label: t('expenseForm.receiptRemove') }] : []),
        ]}
      />
      <DateSheet
        visible={sheet === 'date'}
        value={draft.spentOn}
        onChange={(spentOn) => updateDraft({ spentOn })}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth }) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: { gap: spacing.md, paddingBottom: spacing.md },
    padded: { paddingHorizontal: layout.gutter },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginHorizontal: layout.gutter,
      paddingVertical: spacing.sm,
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.border,
    },
    amount: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
    currency: { marginBottom: spacing.xs },
    receiptButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: colors.primarySoft,
    },
    chips: { gap: spacing.sm, paddingHorizontal: layout.gutter },
    grid: { borderWidth: borderWidth.hairline, borderColor: colors.border },
    gridMargin: { marginHorizontal: layout.gutter },
    gridRow: {
      flexDirection: 'row',
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.border,
    },
    cellValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    keypad: { paddingHorizontal: layout.gutter, marginTop: spacing.sm },
  });
