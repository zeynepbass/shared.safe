export const CURRENCIES = {
  TRY: { code: 'TRY', symbol: '₺', label: '₺ TRY' },
  EUR: { code: 'EUR', symbol: '€', label: '€ EUR' },
  USD: { code: 'USD', symbol: '$', label: '$ USD' },
  GBP: { code: 'GBP', symbol: '£', label: '£ GBP' },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);

export const MINUS = '−';

const SEPARATORS = {
  tr: { group: '.', decimal: ',' },
  en: { group: ',', decimal: '.' },
};

function separatorsFor(locale) {
  return SEPARATORS[locale] ?? SEPARATORS.tr;
}

export function currencySymbol(code) {
  return CURRENCIES[code]?.symbol ?? code;
}

function groupDigits(digits, separator) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

export function formatNumber(minor, { locale = 'tr', decimals = 2 } = {}) {
  const { group, decimal } = separatorsFor(locale);
  const abs = Math.abs(Math.trunc(minor));
  const whole = groupDigits(String(Math.floor(abs / 100)), group);
  if (decimals === 0) return whole;
  const cents = String(abs % 100).padStart(2, '0');
  return `${whole}${decimal}${cents}`;
}

export function formatMoney(minor, currency = 'TRY', { locale = 'tr', signed = false } = {}) {
  const value = Math.trunc(minor);
  const body = `${currencySymbol(currency)}${formatNumber(value, { locale })}`;
  if (value < 0) return `${MINUS}${body}`;
  if (signed && value > 0) return `+${body}`;
  return body;
}

export function toMinor(major) {
  return Math.round(Number(major) * 100);
}

export function fromMinor(minor) {
  return minor / 100;
}

export function parseAmountInput(input, { locale = 'tr' } = {}) {
  if (input == null) return 0;
  const { decimal } = separatorsFor(locale);
  const normalized = String(input)
    .trim()
    .replace(/\s/g, '')
    .split(decimal === ',' ? '.' : ',')
    .join('')
    .replace(decimal, '.');
  if (!/^\d*(\.\d{0,2})?$/.test(normalized) || normalized === '' || normalized === '.') return 0;
  const [whole, frac = ''] = normalized.split('.');
  return Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'));
}

export function formatAmountInput(minor, { locale = 'tr' } = {}) {
  if (!minor) return '';
  const { decimal } = separatorsFor(locale);
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  if (cents === 0) return String(whole);
  const frac = String(cents).padStart(2, '0').replace(/0$/, '');
  return `${whole}${decimal}${frac}`;
}

export function applyKeypadInput(current, key, { locale = 'tr', maxWholeDigits = 9 } = {}) {
  const { decimal } = separatorsFor(locale);
  if (key === 'backspace') return current.slice(0, -1);
  if (key === 'decimal') {
    if (current.includes(decimal)) return current;
    return `${current || '0'}${decimal}`;
  }
  if (!/^\d$/.test(key)) return current;
  const [whole, frac] = current.split(decimal);
  if (frac !== undefined) {
    if (frac.length >= 2) return current;
    return `${current}${key}`;
  }
  if (whole === '0') return key;
  if (whole.length >= maxWholeDigits) return current;
  return `${current}${key}`;
}

export function formatKeypadDisplay(current, { locale = 'tr' } = {}) {
  const { group, decimal } = separatorsFor(locale);
  if (!current) return '0';
  const [whole, frac] = current.split(decimal);
  const grouped = groupDigits(whole || '0', group);
  return frac === undefined ? grouped : `${grouped}${decimal}${frac}`;
}
