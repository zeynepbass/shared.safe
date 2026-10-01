const NUMBER = /^-?\d+(\.\d+)?$/;
// Cells starting with these are run as formulas by spreadsheet apps.
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(value) {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA.test(text) && !NUMBER.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text) || text !== text.trim()) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// `columns` is [{ key, header }]. Lines end with CRLF as RFC 4180 asks.
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.key])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

// Kuruş as a plain decimal ("1240.50"), which every spreadsheet locale can parse.
export function minorToDecimal(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
