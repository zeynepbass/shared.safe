import { formatAmountInput } from '@ortak-kasa/core/money';
import { parseReceiptBlocks } from '@ortak-kasa/core/receipt';

const TITLE_MAX = 60;

// What the recogniser reports is in fractions of the photo; rows of text are told apart in
// pixels, where a step across is as long as a step down.
export function blocksInPixels({ width, height, blocks }) {
  return blocks.map((b) => ({
    text: b.text,
    x: b.x * width,
    y: b.y * height,
    width: b.width * width,
    height: b.height * height,
    lineHeight: b.lineHeight * height,
    angle: b.angle,
  }));
}

// Turns a scanned receipt into the fields of the expense form.
//
// → { patch, found }: `patch` goes into the draft, `found` names what was read ('total', 'date',
// 'merchant') so the form can say what to check. Nothing is certain, so everything stays
// editable; a field that was not read is left as it is.
//
// `mode` is 'replace' after scanning (the user asked for the form to be filled) and 'fill' for a
// photo picked from the library, where only what the user has not entered yet is filled in.
export function draftFromScan(scan, draft, { locale, today, mode = 'replace' }) {
  const parsed = parseReceiptBlocks(blocksInPixels(scan));
  const replace = mode === 'replace';
  const patch = {};
  const found = [];

  if (parsed.total) {
    found.push('total');
    if (replace || !draft.amountInput) {
      patch.amountInput = formatAmountInput(parsed.total, { locale });
    }
  }
  // A date in the future is a misread digit, not a receipt.
  if (parsed.date && parsed.date <= today) {
    found.push('date');
    if (replace || draft.spentOn === today) patch.spentOn = parsed.date;
  }
  if (parsed.merchant) {
    found.push('merchant');
    if (replace || !draft.title.trim()) patch.title = parsed.merchant.slice(0, TITLE_MAX).trim();
  }
  return { patch, found };
}
