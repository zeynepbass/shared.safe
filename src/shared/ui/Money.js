import { useTranslation } from 'react-i18next';

import { formatMoney } from '@/shared/lib/money';

import { AppText } from './AppText';

export function toneColor(minor) {
  if (minor > 0) return 'success';
  if (minor < 0) return 'danger';
  return 'text';
}

export function Money({
  minor,
  currency = 'TRY',
  tone = 'neutral',
  signed = false,
  absolute = false,
  variant = 'amount',
  style,
}) {
  const { i18n } = useTranslation();
  const value = absolute ? Math.abs(minor) : minor;
  const color = tone === 'auto' ? toneColor(minor) : tone === 'neutral' ? 'text' : tone;

  return (
    <AppText variant={variant} color={color} tabular style={style}>
      {formatMoney(value, currency, { locale: i18n.language, signed })}
    </AppText>
  );
}

export function useFormatMoney() {
  const { i18n } = useTranslation();
  return (minor, currency, options) =>
    formatMoney(minor, currency, { locale: i18n.language, ...options });
}
