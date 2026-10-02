import { asc, eq } from 'drizzle-orm';

import { MAX_FILE_PLAIN_BYTES } from '@ortak-kasa/core/sync/protocol';

import { notifyChange } from '../changes';
import { expenses, receiptUploads } from '../schema';
import { groupKeys } from '../security/keys';
import { crypto } from '../security/sodium';
import { receiptFilesOf } from './receiptFiles';

// Receipt photos travel apart from the group's changes: each is one file on the relay, sealed
// with the group's key like everything else, and fetched by the other devices only when someone
// opens the expense.

function forgetUpload(db, receiptId) {
  db.delete(receiptUploads).where(eq(receiptUploads.receiptId, receiptId)).run();
  notifyChange(['receipt_uploads']);
}

// The storage side of SyncClient's file methods.
export function createReceiptStore(db) {
  return {
    fileOutbox(groupId) {
      const keys = groupKeys(db, groupId);
      if (!keys.length) return [];
      const waiting = db
        .select()
        .from(receiptUploads)
        .where(eq(receiptUploads.groupId, groupId))
        .orderBy(asc(receiptUploads.createdAt))
        .all();
      const files = [];
      for (const upload of waiting) {
        const bytes = receiptFilesOf(db).read(upload.path);
        if (!bytes || bytes.length > MAX_FILE_PLAIN_BYTES) {
          // Deleted from the device, or too large to send: it stays a photo of this device only.
          console.warn(`Receipt ${bytes ? 'is too large to sync' : 'file is missing'}`);
          forgetUpload(db, upload.receiptId);
          continue;
        }
        files.push({
          id: upload.receiptId,
          data: crypto.sealFile(groupId, upload.receiptId, keys, bytes),
        });
      }
      return files;
    },

    fileStored: (groupId, receiptId) => forgetUpload(db, receiptId),
    fileRejected: (groupId, receiptId) => forgetUpload(db, receiptId),
  };
}

export function countPendingReceipts(db) {
  return db.select({ id: receiptUploads.receiptId }).from(receiptUploads).all().length;
}

// What is needed to ask the relay for an expense's receipt, or null when there is nothing to
// ask for: no receipt, or this device already has its copy.
export function receiptToFetch(db, expenseId) {
  const row = db.select().from(expenses).where(eq(expenses.id, expenseId)).get();
  if (!row?.receiptId || row.receiptPath) return null;
  return { groupId: row.groupId, receiptId: row.receiptId };
}

// Opens a receipt fetched from the relay and keeps it as this device's copy. Throws a
// CryptoError if it does not open with the group's keys. Returns the path, or null when the
// expense has moved on to another receipt in the meantime.
export function saveFetchedReceipt(db, expenseId, { groupId, receiptId }, sealed) {
  const bytes = crypto.openFile(groupId, receiptId, groupKeys(db, groupId), sealed);
  const current = db.select().from(expenses).where(eq(expenses.id, expenseId)).get();
  if (current?.receiptId !== receiptId) return null;
  const path = receiptFilesOf(db).write(receiptId, bytes);
  db.update(expenses).set({ receiptPath: path }).where(eq(expenses.id, expenseId)).run();
  notifyChange(['expenses']);
  return path;
}
