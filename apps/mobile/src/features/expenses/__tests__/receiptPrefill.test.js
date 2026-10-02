import { blocksInPixels, draftFromScan } from '../receiptPrefill';

// A scan as the native module reports it: fractions of a 1000 × 2000 photo.
const block = (text, x, y) => ({
  text,
  x,
  y,
  width: text.length * 0.012,
  height: 0.015,
  lineHeight: 0.015,
  angle: 0,
});

const scan = (...blocks) => ({ width: 1000, height: 2000, blocks, edges: null });

const MARKET = scan(
  block('ÇINAR MARKETLERİ A.Ş.', 0.2, 0.05),
  block('TARİH : 12.03.2025', 0.1, 0.1),
  block('TOPKDV', 0.1, 0.4),
  block('*34,02', 0.7, 0.401),
  block('TOPLAM', 0.1, 0.43),
  block('*245,90', 0.7, 0.431),
  block('NAKİT', 0.1, 0.46),
  block('*250,00', 0.7, 0.461),
);

const empty = { amountInput: '', title: '', spentOn: '2026-10-01' };
const options = { locale: 'tr', today: '2026-10-01' };

describe('blocksInPixels', () => {
  it('scales across by the width and down by the height', () => {
    expect(blocksInPixels(scan(block('TOPLAM', 0.1, 0.43)))[0]).toMatchObject({
      text: 'TOPLAM',
      x: 100,
      y: 860,
      height: 30,
      lineHeight: 30,
      angle: 0,
    });
  });
});

describe('draftFromScan', () => {
  it('fills the amount, the date and the title from a scanned receipt', () => {
    expect(draftFromScan(MARKET, empty, options)).toEqual({
      patch: { amountInput: '245,9', spentOn: '2025-03-12', title: 'ÇINAR MARKETLERİ A.Ş.' },
      found: ['total', 'date', 'merchant'],
    });
  });

  it('writes the amount the way the keypad of the language does', () => {
    expect(draftFromScan(MARKET, empty, { ...options, locale: 'en' }).patch.amountInput).toBe(
      '245.9',
    );
  });

  it('replaces what was typed after a scan, but not for a photo picked from the library', () => {
    const typed = { amountInput: '100', title: 'Pazar', spentOn: '2026-09-28' };
    expect(draftFromScan(MARKET, typed, options).patch).toEqual({
      amountInput: '245,9',
      spentOn: '2025-03-12',
      title: 'ÇINAR MARKETLERİ A.Ş.',
    });
    expect(draftFromScan(MARKET, typed, { ...options, mode: 'fill' })).toEqual({
      patch: {},
      found: ['total', 'date', 'merchant'],
    });
    // Only the amount was entered: the rest is still filled in.
    expect(
      draftFromScan(MARKET, { ...empty, amountInput: '100' }, { ...options, mode: 'fill' }).patch,
    ).toEqual({ spentOn: '2025-03-12', title: 'ÇINAR MARKETLERİ A.Ş.' });
  });

  it('leaves alone what it could not read', () => {
    expect(draftFromScan(scan(block('TEŞEKKÜR EDERİZ', 0.2, 0.5)), empty, options)).toEqual({
      patch: {},
      found: [],
    });
    expect(draftFromScan(scan(), empty, options)).toEqual({ patch: {}, found: [] });
  });

  it('does not take a date in the future', () => {
    const result = draftFromScan(MARKET, empty, { ...options, today: '2025-03-11' });
    expect(result.found).toEqual(['total', 'merchant']);
    expect(result.patch.spentOn).toBeUndefined();
  });

  it('keeps a long shop name within the title', () => {
    const long = scan(
      block(`${'UZUN '.repeat(20)}MARKET`, 0.1, 0.05),
      block('TOPLAM *5,00', 0.1, 0.5),
    );
    expect(draftFromScan(long, empty, options).patch.title.length).toBeLessThanOrEqual(60);
  });
});
