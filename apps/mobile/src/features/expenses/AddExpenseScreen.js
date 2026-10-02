import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, Check, ChevronDown, ChevronRight, Receipt, Split } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  createExpense,
  getExpense,
  getGroupWithMembers,
  updateExpense,
  useDb,
  useDbQuery,
} from '@/shared/db';
import { memberLabel, selfMember } from '@/features/groups/useGroupSummary';
import { todayISO } from '@/shared/lib/dates';
import { applyKeypadInput, formatAmountInput } from '@ortak-kasa/core/money';
import { useDateFormat } from '@/shared/lib/useDateFormat';
import { reportError } from '@/shared/monitoring';
import { useTheme, useThemedStyles } from '@/shared/theme';
import {
  AmountInput,
  AppText,
  Avatar,
  BottomBar,
  Button,
  Chip,
  Icon,
  Numpad,
  OptionSheet,
  Screen,
  Header,
  StatCell,
  Input,
  useSnackbar,
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
import {
  attachReceipt,
  deleteReceipt,
  fillDraftFromReceipt,
  isReceiptOcrAvailable,
  pickReceipt,
  removeReceipt,
} from './receipts';

const TABLES = ['groups', 'members', 'expenses'];

async function loadForm(db, groupId, expenseId) {
  const [snapshot, expense] = await Promise.all([
    getGroupWithMembers(db, groupId),
    expenseId ? getExpense(db, expenseId) : null,
  ]);
  return { snapshot, expense };
}

export default function AddExpenseScreen() {
  const { groupId, expenseId } = useLocalSearchParams();
  const { t, i18n } = useTranslation();
  const db = useDb();
  const snackbar = useSnackbar();
  const dates = useDateFormat();
  const styles = useThemedStyles(createStyles);
  const { iconSize, layout, spacing } = useTheme();
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
      title: expense?.description ?? '',
      category: expense?.category ?? 'market',
      payerId: expense?.payerId ?? selfMember(members)?.id ?? members[0]?.id,
      spentOn: expense?.spentOn ?? todayISO(),
      splitType: expense?.splitType ?? 'equal',
      participants: participantsFromShares(
        members,
        expense?.splitType ?? 'equal',
        expense?.shares ?? [],
      ),
      // The receipt as the expense has it is kept unless the user attaches another photo
      // ('new', at receiptUri) or removes it ('removed'). The expense may have a receipt this
      // device has no copy of: it shows as attached all the same.
      receiptState: 'keep',
      receiptUri: null,
      hadReceipt: Boolean(expense?.receiptId || expense?.receiptPath),
      originalReceiptUri: expense?.receiptPath ?? null,
    });
  }, [members, data, draft?.key, draftKey, groupId, locale]);

  useEffect(() => () => clearDraft(), []);

  if (!draft || draft.key !== draftKey || !group) {
    return <Screen header={<Header leading="close" />} />;
  }

  const currency = group.currency;
  const total = draftTotal(draft, locale);
  const split = draftSplit(draft, locale);
  const includedCount = draft.participants.filter((p) => p.included).length;
  const canSave = total > 0 && split.valid && !saving;
  const payer = members.find((m) => m.id === draft.payerId);

  const onKey = (key) =>
    updateDraft((d) => ({ amountInput: applyKeypadInput(d.amountInput, key, { locale }) }));

  const hasReceipt =
    draft.receiptState === 'new' || (draft.receiptState === 'keep' && draft.hadReceipt);

  const chooseReceipt = async (choice) => {
    setSheet(null);
    if (choice === 'remove') {
      removeReceipt();
      return;
    }
    if (choice === 'scan') {
      router.push(`/groups/${groupId}/add-expense/scan`);
      return;
    }
    try {
      const result = await pickReceipt(choice);
      if (result.status === 'denied') Alert.alert(t('expenseForm.receiptPermission'));
      if (result.status !== 'ok') return;
      attachReceipt(result.uri);
      // A photo from the library is read too, but only fills in what is still empty.
      const found = await fillDraftFromReceipt(result.uri, { locale, mode: 'fill' });
      if (found.length) {
        snackbar.show({
          message: t('expenseForm.receiptRead', {
            fields: found.map((field) => t(`expenseForm.receiptFields.${field}`)).join(', '),
          }),
        });
      }
    } catch (error) {
      reportError(error);
      Alert.alert(t('common.error'));
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const input = {
      groupId,
      description: draft.title.trim() || t(`categories.${draft.category}`),
      amount: total,
      category: draft.category,
      payerId: draft.payerId,
      splitType: draft.splitType,
      spentOn: draft.spentOn,
      shares: split.shares,
      // Left out when the receipt was not touched, so the expense keeps the one it has.
      ...(draft.receiptState === 'new' ? { receiptPath: draft.receiptUri } : null),
      ...(draft.receiptState === 'removed' ? { receiptPath: null } : null),
    };
    try {
      if (draft.expenseId) {
        await updateExpense(db, draft.expenseId, input);
        // This device's copy of a receipt the expense no longer has.
        if (draft.receiptState !== 'keep') deleteReceipt(draft.originalReceiptUri);
      } else {
        await createExpense(db, input);
      }
      snackbar.show({ message: t(draft.expenseId ? 'expenseForm.updated' : 'expenseForm.saved') });
      router.back();
    } catch (error) {
      reportError(error);
      Alert.alert(t('common.error'));
      setSaving(false);
    }
  };

  const close = () => {
    if (draft.receiptState === 'new') deleteReceipt(draft.receiptUri);
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
        <Header
          title={draft.expenseId ? t('expenseForm.editHeader') : t('expenseForm.header')}
          subtitle={group.name}
          leading="close"
          onLeadingPress={close}
        />
      }
      footer={
        <BottomBar>
          <Button
            title={t('common.save')}
            onPress={save}
            disabled={!canSave}
            loading={saving}
            testID="expense-save"
          />
        </BottomBar>
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <AmountInput
          value={draft.amountInput}
          currency={currency}
          label={t('expenseForm.amountLabel')}
          style={styles.padded}
          accessory={
            <Pressable
              onPress={() => setSheet('receipt')}
              accessibilityRole="button"
              accessibilityLabel={
                hasReceipt ? t('expenseForm.receiptAttached') : t('expenseForm.receipt')
              }
              testID="expense-receipt"
              hitSlop={layout.hitSlop + spacing.xs}
              style={styles.receiptButton}
            >
              <Icon icon={hasReceipt ? Check : Receipt} size={iconSize.sm} color="primary" />
              <AppText variant="caption" color="primary">
                {t('expenseForm.receipt')}
              </AppText>
            </Pressable>
          }
        />

        <View style={styles.padded}>
          <Input
            placeholder={t('expenseForm.titlePlaceholder')}
            accessibilityLabel={t('expenseForm.titlePlaceholder')}
            value={draft.title}
            onChangeText={(title) => updateDraft({ title })}
            maxLength={60}
            returnKeyType="done"
            testID="expense-title"
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
                <Avatar
                  name={payer?.name}
                  color={payer?.avatarColor}
                  image={payer?.avatarPath}
                  size="xs"
                />
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
          <Numpad onKey={onKey} onClear={() => updateDraft({ amountInput: '' })} />
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
          leading: <Avatar name={m.name} color={m.avatarColor} image={m.avatarPath} size="sm" />,
        }))}
      />
      <OptionSheet
        visible={sheet === 'receipt'}
        title={t('expenseForm.receipt')}
        onClose={() => setSheet(null)}
        onSelect={chooseReceipt}
        options={[
          // Scanning reads the receipt and fills the form; without the recogniser (the web) the
          // camera only takes the photo.
          isReceiptOcrAvailable
            ? { value: 'scan', label: t('expenseForm.receiptScan') }
            : { value: 'camera', label: t('expenseForm.receiptTake') },
          { value: 'library', label: t('expenseForm.receiptPick') },
          ...(hasReceipt ? [{ value: 'remove', label: t('expenseForm.receiptRemove') }] : []),
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
