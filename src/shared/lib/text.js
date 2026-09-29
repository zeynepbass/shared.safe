export function initialOf(name, locale = 'tr') {
  const first = String(name ?? '')
    .trim()
    .charAt(0);
  return first ? first.toLocaleUpperCase(locale === 'tr' ? 'tr-TR' : 'en-US') : '?';
}

export function upper(text, locale = 'tr') {
  return String(text ?? '').toLocaleUpperCase(locale === 'tr' ? 'tr-TR' : 'en-US');
}
