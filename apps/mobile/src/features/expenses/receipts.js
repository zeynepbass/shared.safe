import { Directory, File, Paths } from 'expo-file-system';

import { MAX_FILE_PLAIN_BYTES } from '@ortak-kasa/core/sync/protocol';

import { isReceiptOcrAvailable, recognizeReceipt } from '../../../modules/receipt-ocr';

import { newId } from '@/shared/db/ids';
import { RECEIPT_FOLDER } from '@/shared/db/sync/receiptFiles';
import { todayISO } from '@/shared/lib/dates';
import { deleteImage, pickImage } from '@/shared/lib/images';

import { getDraft, updateDraft } from './draftStore';
import { draftFromScan } from './receiptPrefill';

export { isReceiptOcrAvailable };

export function pickReceipt(source) {
  return pickImage(source, { folder: RECEIPT_FOLDER, quality: 0.6, allowsEditing: false });
}

export const deleteReceipt = deleteImage;

// Long enough for the small print of a receipt to stay readable, small enough to send.
const MAX_SIDE = 1600;
const QUALITIES = [70, 50, 35];

// The image library takes paths, not file URLs.
const pathOf = (uri) => decodeURIComponent(uri.replace(/^file:\/\//, ''));

// Keeps a photo taken by the scanner as a receipt: scaled down and saved as a JPEG that fits
// the size a receipt may have when it is synced. `image` is the camera's image; returns the URI.
export async function saveReceiptImage(image) {
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const sized =
    scale < 1
      ? await image.resizeAsync(Math.round(image.width * scale), Math.round(image.height * scale))
      : image;
  const folder = new Directory(Paths.document, RECEIPT_FOLDER);
  folder.create({ idempotent: true, intermediates: true });
  const file = new File(folder, `${newId()}.jpg`);
  for (const quality of QUALITIES) {
    await sized.saveToFileAsync(pathOf(file.uri), 'jpg', quality);
    if (file.size <= MAX_FILE_PLAIN_BYTES) break;
  }
  if (sized !== image) sized.dispose();
  return file.uri;
}

// Makes `uri` the receipt of the expense being edited; a photo chosen earlier in the same form
// and not saved with any expense is deleted.
export function attachReceipt(uri) {
  const draft = getDraft();
  if (draft?.receiptState === 'new' && draft.receiptUri !== uri) deleteReceipt(draft.receiptUri);
  updateDraft({ receiptUri: uri, receiptState: 'new' });
}

export function removeReceipt() {
  const draft = getDraft();
  if (draft?.receiptState === 'new') deleteReceipt(draft.receiptUri);
  updateDraft({ receiptUri: null, receiptState: 'removed' });
}

// Reads the receipt at `uri` on the device and fills the form from it. Returns which fields were
// read ('total', 'date', 'merchant'); an empty list when nothing was, or when the photo could
// not be read at all.
export async function fillDraftFromReceipt(uri, { locale, mode }) {
  if (!isReceiptOcrAvailable) return [];
  try {
    const scan = await recognizeReceipt(uri);
    const draft = getDraft();
    if (!draft) return [];
    const { patch, found } = draftFromScan(scan, draft, { locale, today: todayISO(), mode });
    updateDraft(patch);
    return found;
  } catch (error) {
    console.warn('Receipt could not be read', error?.message ?? error);
    return [];
  }
}
