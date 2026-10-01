import { deleteImage, pickImage } from '@/shared/lib/images';

export function pickReceipt(source) {
  return pickImage(source, { folder: 'receipts', quality: 0.6, allowsEditing: false });
}

export const deleteReceipt = deleteImage;
