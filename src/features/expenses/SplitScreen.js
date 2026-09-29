import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { getGroupSnapshot, useDbQuery } from '@/shared/db';
import { allocateProportionally, computeSplit, FULL_PERCENT } from '@/domain/split';
import { memberLabel } from '@/features/groups/useGroupSummary';
import { currencySymbol, formatAmountInput, parseAmountInput } from '@/shared/lib/money';
import { useTheme, useThemedStyles } from '@/shared/theme';
import {
  AppText,
  Avatar,
  BottomBar,
  Button,
  Checkbox,
  Money,
  Screen,
  Header,
  SectionHeader,
  SegmentedControl,
  useFormatMoney,
} from '@/shared/ui';

import { draftTotal, updateDraft, useDraft } from './draftStore';

const TYPES = ['equal', 'amount', 'percent', 'shares'];

function defaultWeights(type, total, participants) {
  const included = participants.filter((p) => p.included);
  const equal = (sum) =>
    allocateProportionally(
      sum,
      included.map(() => 1),
      included.map((p) => p.memberId),
    );
  const values =
    type === 'amount'
      ? equal(total)
      : type === 'percent'
        ? equal(FULL_PERCENT)
        : type === 'shares'
          ? included.map(() => 1)
          : included.map(() => null);
  const byId = new Map(included.map((p, i) => [p.memberId, values[i]]));
  return participants.map((p) => ({ ...p, weight: byId.get(p.memberId) ?? null }));
}

function toInput(type, weight, locale) {
  if (weight == null) return '';
  if (type === 'shares') return String(weight);
  return formatAmountInput(weight, { locale });
}

function fromInput(type, text, locale) {
  if (type === 'shares') {
    const n = parseInt(text.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return parseAmountInput(text, { locale });
}

export default function SplitScreen() {
  const { groupId } = useLocalSearchParams();
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const styles = useThemedStyles(createStyles);
  const formatMoney = useFormatMoney();
  const draft = useDraft();
  const { data: snapshot } = useDbQuery(
    (db) => getGroupSnapshot(db, groupId),
    [groupId],
    ['members'],
  );
  const [inputs, setInputs] = useState({});

  if (!draft || !snapshot) return <Screen header={<Header />} />;

  const { group, members } = snapshot;
  const currency = group.currency;
  const total = draftTotal(draft, locale);
  const type = draft.splitType;
  const split = computeSplit({ total, type, participants: draft.participants });
  const shareById = new Map(split.shares.map((s) => [s.memberId, s]));
  const allIncluded = draft.participants.every((p) => p.included);

  const setType = (next) => {
    setInputs({});
    updateDraft((d) => ({
      splitType: next,
      participants: defaultWeights(next, total, d.participants),
    }));
  };

  const setIncluded = (memberId, included) => {
    setInputs({});
    updateDraft((d) => ({
      participants: defaultWeights(
        type,
        total,
        d.participants.map((p) => (p.memberId === memberId ? { ...p, included } : p)),
      ),
    }));
  };

  const toggleAll = () => {
    setInputs({});
    updateDraft((d) => ({
      participants: defaultWeights(
        type,
        total,
        d.participants.map((p) => ({ ...p, included: !allIncluded })),
      ),
    }));
  };

  const setWeight = (memberId, text) => {
    setInputs((prev) => ({ ...prev, [memberId]: text }));
    const weight = fromInput(type, text, locale);
    updateDraft((d) => ({
      participants: d.participants.map((p) => (p.memberId === memberId ? { ...p, weight } : p)),
    }));
  };

  const remainingLabel =
    type === 'percent'
      ? t('split.percentOf', { value: formatAmountInput(split.remaining, { locale }) || '0' })
      : null;

  return (
    <Screen
      scroll={false}
      padded={false}
      keyboard
      header={
        <Header
          title={t('split.header')}
          subtitle={t('split.subtitle', {
            amount: formatMoney(total, currency),
            title: draft.title.trim() || t(`categories.${draft.category}`),
          })}
        />
      }
      footer={
        <BottomBar style={styles.footer}>
          <View style={styles.remaining}>
            <AppText variant="caption" color="textMuted">
              {t('split.remaining')}
            </AppText>
            {remainingLabel ? (
              <AppText variant="amount" color={split.remaining === 0 ? 'text' : 'danger'}>
                {remainingLabel}
              </AppText>
            ) : (
              <Money
                minor={split.remaining}
                currency={currency}
                tone={split.remaining === 0 ? 'neutral' : 'danger'}
                variant="amount"
              />
            )}
          </View>
          <Button
            title={t('common.done')}
            onPress={() => router.back()}
            disabled={!split.valid}
            fullWidth={false}
            corners
            style={styles.done}
          />
        </BottomBar>
      }
    >
      <View style={styles.segment}>
        <SegmentedControl
          options={TYPES.map((value) => ({ value, label: t(`splitTypes.${value}`) }))}
          value={type}
          onChange={setType}
          accessibilityLabel={t('split.header')}
        />
      </View>
      <SectionHeader
        title={t('split.included')}
        trailing={
          <Button
            variant="ghost"
            title={allIncluded ? t('common.none') : t('common.all')}
            onPress={toggleAll}
          />
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        {members.map((member) => {
          const participant = draft.participants.find((p) => p.memberId === member.id);
          const included = participant?.included ?? false;
          const share = shareById.get(member.id);
          const label = memberLabel(member, t);
          return (
            <View key={member.id} style={styles.row}>
              <Checkbox
                checked={included}
                onChange={(value) => setIncluded(member.id, value)}
                accessibilityLabel={label}
              />
              <Avatar name={member.name} color={member.avatarColor} size="md" />
              <View style={styles.flex}>
                <AppText variant="bodyLg">{label}</AppText>
                <AppText variant="caption" color="textMuted">
                  {included ? formatMoney(share?.amount ?? 0, currency) : '—'}
                </AppText>
              </View>
              {type !== 'equal' && included ? (
                <WeightInput
                  type={type}
                  currency={currency}
                  value={inputs[member.id] ?? toInput(type, participant.weight, locale)}
                  onChange={(text) => setWeight(member.id, text)}
                  accessibilityLabel={t('split.inputLabel', { name: label })}
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

function WeightInput({ type, currency, value, onChange, accessibilityLabel }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const prefix = type === 'amount' ? currencySymbol(currency) : type === 'percent' ? '%' : '×';
  return (
    <View style={styles.input}>
      <AppText variant="caption" color="textMuted">
        {prefix}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={type === 'shares' ? 'number-pad' : 'decimal-pad'}
        selectTextOnFocus
        accessibilityLabel={accessibilityLabel}
        placeholder="0"
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.primary}
        style={styles.inputText}
      />
    </View>
  );
}

const createStyles = ({ colors, spacing, layout, typography, borderWidth }) =>
  StyleSheet.create({
    flex: { flex: 1 },
    segment: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
    row: {
      minHeight: layout.rowHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: layout.gutter,
      paddingVertical: spacing.md,
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.divider,
    },
    input: {
      width: 116,
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
    },
    inputText: { ...typography.amount, flex: 1, textAlign: 'right', color: colors.text },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    remaining: { gap: spacing.xxs },
    done: { minWidth: 140 },
  });
