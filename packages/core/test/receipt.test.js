import { readFileSync } from 'node:fs';

import { linesFromBlocks, parseReceipt, parseReceiptBlocks } from '../src/receipt.js';

// What Apple's Vision framework returned for the same receipt photographed straight and turned
// by 14 degrees (recorded with the app's recogniser, coordinates in pixels).
const vision = JSON.parse(
  readFileSync(new URL('./fixtures/visionReceipt.json', import.meta.url), 'utf8'),
);

const receipt = (...lines) => lines.join('\n');

const MARKET = receipt(
  'ÇINAR MARKETLERİ A.Ş.',
  'ATATÜRK MAH. İNÖNÜ CAD. NO:12/A',
  'KADIKÖY / İSTANBUL',
  'KADIKÖY V.D. 1234567890',
  'TARİH : 12.03.2025',
  'SAAT  : 14:32',
  'FİŞ NO: 0042',
  'SÜT 1L            %01   *34,50',
  'EKMEK             %01   *10,00',
  'DETERJAN 4KG      %20  *201,40',
  'TOPKDV                  *34,02',
  'TOPLAM                 *245,90',
  'NAKİT                  *250,00',
  'PARA ÜSTÜ                *4,10',
  'EKÜ NO: 0001  Z NO: 0153',
);

describe('parseReceipt', () => {
  it('reads total, date and shop name from a cash register receipt', () => {
    expect(parseReceipt(MARKET)).toEqual({
      total: 24590,
      date: '2025-03-12',
      merchant: 'ÇINAR MARKETLERİ A.Ş.',
    });
  });

  it('returns nulls when nothing is readable', () => {
    const empty = { total: null, date: null, merchant: null };
    expect(parseReceipt('')).toEqual(empty);
    expect(parseReceipt(null)).toEqual(empty);
    expect(parseReceipt('***\n---\n12')).toEqual(empty);
  });

  describe('total (TOPLAM)', () => {
    const totalOf = (...lines) => parseReceipt(receipt(...lines)).total;

    it('is not the VAT, the subtotal, the cash handed over or the change', () => {
      expect(
        totalOf(
          'ARA TOPLAM *90,00',
          'İNDİRİM TOPLAMI *5,00',
          'KDV %10 *7,73',
          'KDV %20 *0,00',
          'TOPLAM KDV *7,73',
          'TOPLAM *85,00',
          'NAKİT *100,00',
          'PARA ÜSTÜ *15,00',
        ),
      ).toBe(8500);
    });

    it('prefers GENEL TOPLAM and ÖDENECEK TUTAR over a plain TOPLAM', () => {
      expect(totalOf('TOPLAM 400,00', 'KDV %10 40,00', 'GENEL TOPLAM 440,00')).toBe(44000);
      expect(totalOf('Ödenecek Tutar: 1.180,00 TL', 'Mal Hizmet Toplam Tutarı 1.000,00 TL')).toBe(
        118000,
      );
    });

    it('takes the last TOPLAM when a receipt prints more than one', () => {
      expect(totalOf('TOPLAM *120,00', 'KUPON *-20,00', 'TOPLAM *100,00')).toBe(10000);
    });

    it('reads a total that includes VAT', () => {
      expect(totalOf('KDV *12,50', 'KDV DAHİL TOPLAM *137,50')).toBe(13750);
    });

    it('reads grouped thousands in both notations', () => {
      expect(totalOf('TOPLAM *1.245,90')).toBe(124590);
      expect(totalOf('TOPLAM 12.345.678,09')).toBe(1234567809);
      expect(totalOf('TOPLAM 1,245.90')).toBe(124590);
      expect(totalOf('TOPLAM 1245.90 TL')).toBe(124590);
      expect(totalOf('TOPLAM ₺0,75')).toBe(75);
    });

    it('copes with recognition mistakes in the label and the amount', () => {
      expect(totalOf('T0PLAM x245,90')).toBe(24590);
      expect(totalOf('toplam: 245, 90')).toBe(24590);
      expect(totalOf('TOPLAM★245 ,90')).toBe(24590);
    });

    it('finds the amount on the next line when the columns were read apart', () => {
      expect(totalOf('TOPKDV', '*12,34', 'TOPLAM', '*1000,00', 'NAKİT', '*1000,00')).toBe(100000);
    });

    it('does not take the next line when that is another row', () => {
      expect(totalOf('TOPLAM', 'NAKİT *50,00')).toBe(null);
    });

    it('reads the amount of a card slip', () => {
      expect(totalOf('SATIŞ', 'TUTAR 318,75 TL', 'ONAY KODU 123456')).toBe(31875);
    });

    it('falls back to the largest amount that is not VAT or a payment', () => {
      expect(totalOf('ÇAY *15,00', 'TOST *85,00', 'KDV *9,09', 'NAKİT *200,00')).toBe(8500);
    });

    it('does not mistake dates, times or VAT rates for amounts', () => {
      expect(totalOf('12.03.2025 14.32', 'SU %1,00', 'TOPLAM 12.03.2025 *7,50')).toBe(750);
      expect(totalOf('TARİH 12.03.25', 'SAAT 14:32:10')).toBe(null);
    });
  });

  describe('date (TARİH)', () => {
    const dateOf = (...lines) => parseReceipt(receipt(...lines)).date;

    it('reads day-first dates with any of the usual separators', () => {
      expect(dateOf('TARİH: 05.01.2025')).toBe('2025-01-05');
      expect(dateOf('TARİH 5/1/2025')).toBe('2025-01-05');
      expect(dateOf('TARIH : 05-01-2025 SAAT : 09:05')).toBe('2025-01-05');
      expect(dateOf('Tarih:31.12.24')).toBe('2024-12-31');
      expect(dateOf('05 . 01 . 2025')).toBe('2025-01-05');
    });

    it('reads the ISO dates of e-archive invoices', () => {
      expect(dateOf('Fatura Tarihi: 2025-03-12')).toBe('2025-03-12');
    });

    it('prefers the date next to TARİH', () => {
      expect(dateOf('SON KULLANMA 01.09.2026', 'TARİH 12.03.2025')).toBe('2025-03-12');
    });

    it('takes the first date when none is labelled', () => {
      expect(dateOf('12/03/2025 14:32', 'İADE SON GÜN 26/03/2025')).toBe('2025-03-12');
    });

    it('rejects dates that do not exist', () => {
      expect(dateOf('TARİH 31.02.2025')).toBe(null);
      expect(dateOf('TARİH 12.13.2025')).toBe(null);
      expect(dateOf('TARİH 00.01.2025')).toBe(null);
      expect(dateOf('TARİH 29.02.2024')).toBe('2024-02-29');
      expect(dateOf('TARİH 29.02.2025')).toBe(null);
    });

    it('does not read phone or tax numbers as dates', () => {
      expect(dateOf('TEL: 0216 123 45 67', 'VKN 1234567890', 'MERSİS 0123-4567-8901')).toBe(null);
    });
  });

  describe('shop name', () => {
    const merchantOf = (...lines) => parseReceipt(receipt(...lines)).merchant;

    it('is the first line that is not an address, a number or a greeting', () => {
      expect(
        merchantOf(
          '*** HOŞGELDİNİZ ***',
          '0216 123 45 67',
          'Lale  Kafe',
          'MODA CAD. NO:5',
          'TARİH 12.03.2025',
        ),
      ).toBe('Lale Kafe');
    });

    it('keeps the name as printed', () => {
      expect(merchantOf('BİRLİK GIDA SAN. VE TİC. LTD. ŞTİ.', 'TOPLAM *5,00')).toBe(
        'BİRLİK GIDA SAN. VE TİC. LTD. ŞTİ.',
      );
    });

    it('is not looked for among the items', () => {
      expect(merchantOf('TARİH 12.03.2025', 'SÜT *34,50', 'YILDIZ MARKET')).toBe(null);
    });

    it('is never a label of the totals', () => {
      expect(merchantOf('TOPLAM', '*1000,00')).toBe(null);
      expect(merchantOf('TOPKDV', 'NAKİT', 'YILDIZ MARKET')).toBe(null);
    });
  });
});

describe('linesFromBlocks', () => {
  // A piece of text as a recogniser reports it: where it is and how tall.
  const block = (text, x, y, height = 20) => ({ text, x, y, width: text.length * 10, height });

  it('joins the pieces of a row left to right, rows top to bottom', () => {
    expect(
      linesFromBlocks([
        block('*245,90', 300, 102),
        block('NAKİT', 10, 140),
        block('TOPLAM', 10, 100),
        block('ÇINAR MARKET', 60, 10),
        block('*250,00', 300, 143),
      ]),
    ).toEqual(['ÇINAR MARKET', 'TOPLAM *245,90', 'NAKİT *250,00']);
  });

  it('keeps the rows of a receipt photographed at a slight angle apart', () => {
    // Each amount sits a third of a line lower than its label; rows are a line and a half apart.
    expect(
      linesFromBlocks([
        block('SÜT', 10, 100),
        block('*34,50', 300, 107),
        block('EKMEK', 10, 130),
        block('*10,00', 300, 137),
      ]),
    ).toEqual(['SÜT *34,50', 'EKMEK *10,00']);
  });

  it('does not pull small print into the row of a tall heading next to it', () => {
    expect(
      linesFromBlocks([block('TOPLAM', 10, 100, 40), block('KDV DAHİL', 200, 132, 10)]),
    ).toEqual(['TOPLAM', 'KDV DAHİL']);
  });

  it('ignores empty pieces', () => {
    expect(
      linesFromBlocks([block('  ', 0, 0), block('TOPLAM', 0, 30), block('x', 0, 60, 0)]),
    ).toEqual(['TOPLAM']);
    expect(linesFromBlocks([])).toEqual([]);
  });

  it('follows the direction the text runs in when the receipt is at an angle', () => {
    // Rows run 10 degrees uphill: over 600 px the amount sits 106 px above its label, more
    // than the 60 px between two rows.
    const angle = (-10 * Math.PI) / 180;
    const at = (text, along, row) => ({
      text,
      x: Math.round(along * Math.cos(angle)),
      y: Math.round(1000 + row * 60 + along * Math.sin(angle)),
      width: text.length * 10,
      height: 30,
      lineHeight: 20,
      angle,
    });
    const blocks = [
      at('TOPLAM KDV DAHİL', 0, 0),
      at('*245,90', 600, 0),
      at('NAKİT ÖDEME ALINDI', 0, 1),
      at('*250,00', 600, 1),
    ];
    expect(linesFromBlocks(blocks)).toEqual([
      'TOPLAM KDV DAHİL *245,90',
      'NAKİT ÖDEME ALINDI *250,00',
    ]);
    // Without the angle the amounts drift into the rows above.
    expect(linesFromBlocks(blocks.map(({ angle: _angle, ...b }) => b))).not.toEqual(
      linesFromBlocks(blocks),
    );
  });

  it('takes the direction from the long pieces, not the short ones', () => {
    const blocks = [
      { text: 'TOPLAM TUTAR KDV DAHİL', x: 0, y: 100, width: 400, height: 20, angle: 0 },
      { text: 'TL', x: 500, y: 102, width: 20, height: 20, angle: 0.4 },
      { text: '*5,00', x: 600, y: 101, width: 50, height: 20, angle: 0.3 },
    ];
    expect(linesFromBlocks(blocks)).toEqual(['TOPLAM TUTAR KDV DAHİL TL *5,00']);
  });

  it('reads a recorded scan of a receipt turned by 14 degrees', () => {
    expect(linesFromBlocks(vision.tilted)).toEqual([
      'ÇINAR MARKETLERİ A.Ş.',
      'ATATÜRK MAH. İNÖNÜ CAD. NO:12/A',
      'KADIKÖY / İSTANBUL',
      'KADIKÖY V.D. 1234567890',
      'TARİH : 12.03.2025 SAAT : 14:32',
      'FİŞ NO: 0042',
      'SÜT 1L %01 *34,50',
      'EKMEK %01 *10,00',
      'DETERJAN 4KG %20 *201,40',
      'TOPKDV *34,02',
      'TOPLAM *245,90',
      'NAKİT *250,00',
      'PARA ÜSTÜ *4,10',
      'EKÜ NO: 0001 Z NO: 0153',
    ]);
  });

  // The recogniser makes its own mistakes (in the straight photo it read "%01" as "801" and
  // "EKÜ" as "EKU"); what matters is that every label ends up next to its amount.
  it.each(['straight', 'tilted'])('gets the same answer from the %s recorded scan', (name) => {
    const lines = linesFromBlocks(vision[name]);
    expect(lines).toHaveLength(14);
    expect(lines).toEqual(
      expect.arrayContaining(['TOPKDV *34,02', 'TOPLAM *245,90', 'NAKİT *250,00']),
    );
    expect(parseReceiptBlocks(vision[name])).toEqual({
      total: 24590,
      date: '2025-03-12',
      merchant: 'ÇINAR MARKETLERİ A.Ş.',
    });
  });

  it('feeds the parser what it needs', () => {
    expect(
      parseReceiptBlocks([
        block('ÇINAR MARKETLERİ A.Ş.', 60, 10),
        block('TARİH :', 10, 50),
        block('12.03.2025', 120, 51),
        block('TOPKDV', 10, 200),
        block('*34,02', 300, 203),
        block('TOPLAM', 10, 230),
        block('*245,90', 300, 232),
      ]),
    ).toEqual({ total: 24590, date: '2025-03-12', merchant: 'ÇINAR MARKETLERİ A.Ş.' });
  });
});
