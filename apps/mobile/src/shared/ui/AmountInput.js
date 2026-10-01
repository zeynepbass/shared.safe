import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { currencySymbol, formatKeypadDisplay } from '@ortak-kasa/core/money';
import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';

export function AmountInput({
  value,
  currency = 'TRY',
  label,
  error,
  size = 'xl',
  accessory,
  onPress,
  style,
}) {
  const { t, i18n } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const display = formatKeypadDisplay(value, { locale: i18n.language });
  const symbol = currencySymbol(currency);
  const empty = !value;
  const a11yLabel = `${label ?? t('amountInput.label')}: ${display} ${symbol}`;
  const Field = onPress ? Pressable : View;

  return (
    <View style={style}>
      <View style={[styles.row, error && styles.rowError]}>
        <Field
          onPress={onPress}
          accessible
          accessibilityRole={onPress ? 'button' : 'text'}
          accessibilityLabel={a11yLabel}
          accessibilityHint={error}
          style={styles.amount}
        >
          <AppText
            variant={size === 'xl' ? 'heading' : 'headerTitle'}
            color={empty ? 'textSubtle' : 'primary'}
            style={size === 'xl' ? styles.symbolXl : styles.symbolLg}
          >
            {symbol}
          </AppText>
          <AppText
            variant={size === 'xl' ? 'amountXl' : 'amountLg'}
            color={empty ? 'textSubtle' : 'text'}
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            style={styles.value}
          >
            {display}
          </AppText>
        </Field>
        {accessory}
      </View>
      {error ? (
        <AppText
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
          style={styles.error}
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.border,
    },
    rowError: { borderBottomColor: colors.danger },
    amount: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
    symbolXl: { marginBottom: spacing.xs },
    symbolLg: { marginBottom: spacing.xxs },
    value: { flexShrink: 1 },
    error: { marginTop: spacing.xs },
  });
