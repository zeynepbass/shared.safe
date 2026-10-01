import { csvCell, minorToDecimal, toCsv } from '../csv';

describe('csvCell', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('Market')).toBe('Market');
    expect(csvCell(12)).toBe('12');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes separators, quotes, line breaks and edge spaces', () => {
    expect(csvCell('Ekmek, süt')).toBe('"Ekmek, süt"');
    expect(csvCell('5" ekran')).toBe('"5"" ekran"');
    expect(csvCell('iki\nsatır')).toBe('"iki\nsatır"');
    expect(csvCell(' boşluk')).toBe('" boşluk"');
  });

  it('defuses spreadsheet formulas but keeps negative numbers', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('+90 555')).toBe("'+90 555");
    expect(csvCell('-12.50')).toBe('-12.50');
  });
});

describe('toCsv', () => {
  it('writes a header and CRLF-terminated rows', () => {
    const csv = toCsv(
      [
        { a: 'x', b: 1 },
        { a: 'y, z', b: null },
      ],
      [
        { key: 'a', header: 'Açıklama' },
        { key: 'b', header: 'Tutar' },
      ],
    );
    expect(csv).toBe('Açıklama,Tutar\r\nx,1\r\n"y, z",\r\n');
  });
});

describe('minorToDecimal', () => {
  it('prints kuruş as a dot decimal', () => {
    expect(minorToDecimal(0)).toBe('0.00');
    expect(minorToDecimal(5)).toBe('0.05');
    expect(minorToDecimal(124050)).toBe('1240.50');
    expect(minorToDecimal(-1999)).toBe('-19.99');
  });
});
