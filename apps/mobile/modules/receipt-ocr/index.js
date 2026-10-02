import { requireOptionalNativeModule } from 'expo';

// On-device text recognition for receipt photos: Apple's Vision framework on iOS
// (ios/ReceiptRecognizer.swift), ML Kit on Android (android/.../ReceiptOcrModule.kt). The photo
// never leaves the phone to be read.
//
// Everything is in fractions of the upright image, origin at the top left:
//
//   recognizeReceipt(uri) → { width, height, blocks, edges }
//     blocks: [{ text, x, y, width, height, angle, lineHeight }]  one per line of text
//     edges:  [{ x, y }] × 4, clockwise from the top left, or null   the outline of the paper
//   detectReceiptEdges(uri) → edges
const Native = requireOptionalNativeModule('ReceiptOcr');

// False on the web and in a build made without the module.
export const isReceiptOcrAvailable = Native != null;

export async function recognizeReceipt(uri) {
  if (!Native) throw new Error('Receipt recognition is not available on this platform');
  return Native.recognize(uri);
}

export async function detectReceiptEdges(uri) {
  if (!Native) return null;
  return Native.detectEdges(uri);
}
