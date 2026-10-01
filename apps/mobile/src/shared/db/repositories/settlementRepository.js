import { and, desc, eq, isNull } from 'drizzle-orm';

import * as groupDoc from '@ortak-kasa/core/groupDoc';

import { DbValidationError } from '../errors';
import { newId } from '../ids';
import { settlements } from '../schema';
import { commitGroupChange } from '../sync/groupDocs';

export function listSettlements(db, groupId) {
  return db
    .select()
    .from(settlements)
    .where(and(eq(settlements.groupId, groupId), isNull(settlements.deletedAt)))
    .orderBy(desc(settlements.paidOn), desc(settlements.createdAt))
    .all();
}

export function recordSettlement(db, input) {
  const id = newId();
  commitGroupChange(db, input.groupId, (doc, ctx) =>
    groupDoc.addSettlement(doc, { ...input, id }, ctx),
  );
  return id;
}

function setDeleted(db, id, deleted) {
  const row = db.select().from(settlements).where(eq(settlements.id, id)).get();
  if (!row) throw new DbValidationError('settlementNotFound');
  commitGroupChange(db, row.groupId, (doc, ctx) =>
    groupDoc.setSettlementDeleted(doc, id, deleted, ctx),
  );
}

export function softDeleteSettlement(db, id) {
  setDeleted(db, id, true);
}

export function restoreSettlement(db, id) {
  setDeleted(db, id, false);
}
