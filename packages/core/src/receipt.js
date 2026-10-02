// Reads the total, the date and the shop name out of the text recognised on a receipt photo.
//
// The input is what on-device text recognition returns: lines in reading order, possibly with
// mistakes (I for İ, 0 for O, a stray space inside an amount, a label and its amount on two
// lines). Nothing here is certain, so every field is null when it was not found and the caller
// lets the user correct the rest.
//
// The rules follow Turkish cash register receipts and e-archive invoices:
//
//   MİGROS TİCARET A.Ş.            shop name: first lines, before address and tax office
//   TARİH : 12.03.2025  SAAT 14:32  date: day first; '.', '/' or '-' between the parts
//   SÜT 1L          %01   *34,50
//   TOPKDV                 *12,34   VAT, not the total
//   TOPLAM                *245,90   total (GENEL TOPLAM / ÖDENECEK TUTAR win over it)
//   NAKİT                 *250,00   what was handed over, not the total

// Letters are compared without Turkish diacritics and in upper case, so TARİH, TARIH and tarih
// are the same word. A 0 next to a letter is read as O (T0PLAM).
const FOLD = {
  İ: 'I',
  ı: 'I',
  Ş: 'S',
  ş: 'S',
  Ğ: 'G',
  ğ: 'G',
  Ü: 'U',
  ü: 'U',
  Ö: 'O',
  ö: 'O',
  Ç: 'C',
  ç: 'C',
};

function fold(text) {
  return text
    .replace(/[İıŞşĞğÜüÖöÇç]/g, (letter) => FOLD[letter])
    .toUpperCase()
    .replace(/(?<=[A-Z])0|0(?=[A-Z])/g, 'O');
}

const DATE = /(?<!\d)(\d{1,2})\s?([./-])\s?(\d{1,2})\s?\2\s?(\d{4}|\d{2})(?!\d)/g;
const ISO_DATE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const TIME = /(?<!\d)\d{1,2}:\d{2}(?::\d{2})?(?!\d)/g;
const PERCENT = /%\s?\d+(?:[.,]\d+)?/g;
// An amount always has two decimals; thousands may be grouped (1.245,90 or 1,245.90).
const AMOUNT = /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+|\d+)\s?[.,]\s?(\d{2})(?!\d)/g;

function validDate(year, month, day) {
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > days) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

function datesIn(line) {
  const found = [];
  for (const match of line.matchAll(ISO_DATE)) {
    found.push(validDate(Number(match[1]), Number(match[2]), Number(match[3])));
  }
  for (const match of line.matchAll(DATE)) {
    const year = Number(match[4]);
    found.push(validDate(year < 100 ? 2000 + year : year, Number(match[3]), Number(match[1])));
  }
  return found.filter(Boolean);
}

// Amounts on a line in minor units (kuruş), left to right. Dates, times and percentages are
// taken out first: 12.03.2025 would otherwise read as 12,03.
function amountsIn(line) {
  const cleaned = line
    .replace(ISO_DATE, ' ')
    .replace(DATE, ' ')
    .replace(TIME, ' ')
    .replace(PERCENT, ' ');
  return Array.from(
    cleaned.matchAll(AMOUNT),
    (match) => Number(match[1].replace(/[.,]/g, '')) * 100 + Number(match[2]),
  );
}

// Labels of the total, strongest first. A later line wins among equals: a receipt may print a
// running total before discounts and the final one after.
const TOTAL_LABELS = [
  /\b(GENEL TOPLAM|ODENECEK TUTAR|ODENECEK TOPLAM|VERGILER DAHIL TOPLAM)\b/,
  /\bTOPLAM\b/,
  /\b(TUTAR|TOTAL)\b/,
];
// Lines that mention a total but are something else: subtotal, VAT, discount, item count.
const NOT_TOTAL = /\b(ARA ?TOPLAM|TOPKDV|KDV|INDIRIM|ISKONTO|ADET|KALEM|MATRAH|PUAN)\b/;
// Payment lines; their amounts are never the total (cash handed over is usually more).
const PAYMENT = /\b(NAKIT|PARA USTU|PARAUSTU|ODENEN|ALINAN|BANKA KARTI|KREDI KARTI)\b/;

// "KDV DAHİL TOPLAM" is the total with VAT included, not a VAT line.
const VAT_INCLUDED = /\bKDV ?(DAHIL|'?LI)\b/;

function findTotal(lines) {
  let best = null;
  lines.forEach((line, index) => {
    const key = line.key.replace(VAT_INCLUDED, ' ');
    if (NOT_TOTAL.test(key)) return;
    const rank = TOTAL_LABELS.findIndex((label) => label.test(key));
    if (rank === -1 || (best && rank > best.rank)) return;
    // The amount is on the label's line, or alone on the next one when the columns were read
    // as separate lines.
    let amounts = line.amounts;
    const next = lines[index + 1];
    if (amounts.length === 0 && next && next.amounts.length === 1 && !/[A-Z]{3}/.test(next.key)) {
      amounts = next.amounts;
    }
    if (amounts.length > 0) best = { rank, amount: amounts.at(-1) };
  });
  if (best) return best.amount;

  // No label was readable: the largest amount that is not VAT or a payment is the best guess.
  const rest = lines
    .filter((line) => !NOT_TOTAL.test(line.key) && !PAYMENT.test(line.key))
    .flatMap((line) => line.amounts);
  return rest.length > 0 ? Math.max(...rest) : null;
}

function findDate(lines) {
  const labelled = lines.find((line) => /\bTARIH\b/.test(line.key) && line.dates.length > 0);
  return (labelled ?? lines.find((line) => line.dates.length > 0))?.dates[0] ?? null;
}

// What the top of a receipt has besides the shop name: address, tax office, phone, greetings.
const NOT_MERCHANT =
  /\b(MAH|MAHALLESI|CAD|CADDESI|SOK|SOKAK|BULVARI?|BLV|NO|KAT|TEL|FAX|V\.?D|VERGI|VKN|TCKN|MERSIS|TARIH|SAAT|FIS|FATURA|E-ARSIV|WWW|HTTPS?|TESEKKUR|HOSGELDINIZ|KASIYER|KASA)\b|[/@]/;
const MERCHANT_LINES = 8;

function findMerchant(lines) {
  for (const line of lines.slice(0, MERCHANT_LINES)) {
    if (line.amounts.length > 0) break; // the items start here
    if ([...TOTAL_LABELS, NOT_TOTAL, PAYMENT].some((label) => label.test(line.key))) break;
    if (line.dates.length > 0 || NOT_MERCHANT.test(line.key)) continue;
    if ((line.key.match(/[A-Z]/g) ?? []).length < 3) continue;
    return line.text;
  }
  return null;
}

// → { total, date, merchant }: total in minor units, date as 'YYYY-MM-DD', merchant as printed.
export function parseReceipt(text) {
  const lines = (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => ({
      text: line,
      key: fold(line),
      amounts: amountsIn(line),
      dates: datesIn(line),
    }));
  return { total: findTotal(lines), date: findDate(lines), merchant: findMerchant(lines) };
}

// Text recognition returns pieces of text with their boxes, not lines: a label on the left of a
// receipt and its amount on the right arrive as two pieces. This puts the pieces that sit on the
// same row back on one line, left to right, rows top to bottom.
//
// `blocks` is [{ text, x, y, width, height, angle?, lineHeight? }]: the box around each piece
// with the origin at the top left, in pixels (any unit works as long as it is the same for all,
// and the same across and down). `angle` is how the piece's baseline runs, in radians, positive
// when downhill to the right, and `lineHeight` the height of its line; a recogniser that reports
// them lets a receipt photographed at an angle be read as well as a straight one.
export function linesFromBlocks(blocks) {
  const usable = blocks.filter((b) => b.text?.trim() && b.height > 0);
  const skew = skewOf(usable);
  const sin = Math.sin(skew);
  const cos = Math.cos(skew);
  // Each piece's place in the receipt's own directions: how far down its rows, how far along.
  const pieces = usable
    .map((b) => {
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      return {
        text: b.text.trim(),
        down: y * cos - x * sin,
        along: x * cos + y * sin,
        height: b.lineHeight > 0 ? b.lineHeight : b.height,
      };
    })
    .sort((a, b) => a.down - b.down);

  const rows = [];
  for (const piece of pieces) {
    const row = rows[rows.length - 1];
    // Same row when the piece's middle is within half a line of the row's.
    if (row && Math.abs(piece.down - row.down) < Math.min(row.height, piece.height) / 2) {
      row.pieces.push(piece);
      row.down = row.pieces.reduce((sum, p) => sum + p.down, 0) / row.pieces.length;
      row.height = Math.max(row.height, piece.height);
    } else {
      rows.push({ pieces: [piece], down: piece.down, height: piece.height });
    }
  }
  return rows.map((row) =>
    row.pieces
      .sort((a, b) => a.along - b.along)
      .map((p) => p.text)
      .join(' '),
  );
}

// The angle the receipt's text runs at: the median of the pieces' angles, each counting for its
// width. A long line shows its direction well; a three-letter one barely at all.
function skewOf(blocks) {
  const measured = blocks
    .filter((b) => Number.isFinite(b.angle) && b.width > 0)
    .sort((a, b) => a.angle - b.angle);
  const half = measured.reduce((sum, b) => sum + b.width, 0) / 2;
  let passed = 0;
  for (const block of measured) {
    passed += block.width;
    if (passed >= half) return block.angle;
  }
  return 0;
}

// parseReceipt for what a text recogniser returned.
export function parseReceiptBlocks(blocks) {
  return parseReceipt(linesFromBlocks(blocks).join('\n'));
}
