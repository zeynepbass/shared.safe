import {
  applyKeypadInput,
  formatAmountInput,
  formatKeypadDisplay,
  formatMoney,
  MINUS,
  parseAmountInput,
} from '../money';

describe('formatMoney', () => {
  it('uses Turkish separators', () => {
    expect(formatMoney(124000, 'TRY')).toBe('₺1.240,00');
    expect(formatMoney(301637, 'TRY')).toBe('₺3.016,37');
  });

  it('prefixes negatives with a true minus sign and positives with + when signed', () => {
    expect(formatMoney(-301637, 'TRY')).toBe(`${MINUS}₺3.016,37`);
    expect(formatMoney(29113, 'TRY', { signed: true })).toBe('+₺291,13');
    expect(formatMoney(0, 'TRY', { signed: true })).toBe('₺0,00');
  });

  it('supports English separators and other currencies', () => {
    expect(formatMoney(123456789, 'USD', { locale: 'en' })).toBe('$1,234,567.89');
    expect(formatMoney(5, 'EUR')).toBe('€0,05');
  });
});

describe('parseAmountInput', () => {
  it('parses Turkish input into minor units', () => {
    expect(parseAmountInput('486,40')).toBe(48640);
    expect(parseAmountInput('1.240,5')).toBe(124050);
    expect(parseAmountInput('150')).toBe(15000);
  });

  it('rejects malformed input', () => {
    expect(parseAmountInput('')).toBe(0);
    expect(parseAmountInput('1,234')).toBe(0);
    expect(parseAmountInput('abc')).toBe(0);
  });

  it('round-trips with formatAmountInput', () => {
    for (const value of [15000, 13640, 48640, 5, 100]) {
      expect(parseAmountInput(formatAmountInput(value))).toBe(value);
    }
  });
});

describe('keypad input', () => {
  const type = (keys) => keys.reduce((value, key) => applyKeypadInput(value, key), '');

  it('builds a decimal amount', () => {
    expect(type(['4', '8', '6', 'decimal', '4'])).toBe('486,4');
    expect(formatKeypadDisplay('1850')).toBe('1.850');
  });

  it('limits decimals to two digits and ignores a second separator', () => {
    expect(type(['1', 'decimal', '2', '3', '4', 'decimal'])).toBe('1,23');
  });

  it('replaces a leading zero and supports backspace', () => {
    expect(type(['0', '5'])).toBe('5');
    expect(type(['decimal', '5'])).toBe('0,5');
    expect(type(['1', '2', 'backspace'])).toBe('1');
  });
});
