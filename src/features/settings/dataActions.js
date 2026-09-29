import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { deleteAllData, listExportRows } from '@/shared/db';
import { minorToDecimal, toCsv } from '@/shared/lib/csv';
import { todayISO } from '@/shared/lib/dates';
import { deleteImageFolder } from '@/shared/lib/images';

const COLUMNS = [
  'type',
  'group',
  'date',
  'description',
  'category',
  'amount',
  'currency',
  'paidBy',
  'paidTo',
  'splitType',
  'shares',
];

// Writes every expense and payment to a CSV in the cache folder and opens the share sheet.
// Returns 'empty' | 'unavailable' | 'shared'.
export async function exportCsv(db, t) {
  const rows = listExportRows(db);
  if (rows.length === 0) return 'empty';
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';

  const csv = toCsv(
    rows.map((row) => ({
      ...row,
      type: t(`settings.csv.${row.type}`),
      category: row.category ? t(`categories.${row.category}`) : '',
      amount: minorToDecimal(row.amount),
      splitType: row.splitType ? t(`splitTypes.${row.splitType}`) : '',
      shares: row.shares.map((s) => `${s.name} ${minorToDecimal(s.amount)}`).join('; '),
    })),
    COLUMNS.map((key) => ({ key, header: t(`settings.csv.${key}`) })),
  );

  const file = new File(Paths.cache, `ortak-kasa-${todayISO()}.csv`);
  if (file.exists) file.delete();
  file.create();
  // The byte order mark makes Excel read the file as UTF-8 (ş, ğ, ₺ …).
  file.write(`﻿${csv}`);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: t('settings.export'),
  });
  return 'shared';
}

export function wipeDevice(db) {
  deleteAllData(db);
  deleteImageFolder('receipts');
  deleteImageFolder('avatars');
}
