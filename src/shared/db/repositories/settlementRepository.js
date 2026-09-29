import { and, desc, eq, isNull } from 'drizzle-orm';

import { notifyChange } from '../changes';
import { DbValidationError } from '../errors';
import { newId, now } from '../ids';
import { settlements } from '../schema';
import { logActivity } from './activityRepository';
import { getGroup, touchGroup } from './groupAccess';
import { assertActiveMembers } from './memberRepository';

const TABLES = ['settlements', 'groups', 'activity_log'];

function activityPayload(settlement) {
  return {
    fromMemberId: settlement.fromMemberId,
    toMemberId: settlement.toMemberId,
    amount: settlement.amount,
    currency: settlement.currency,
  };
}

export function listSettlements(db, groupId) {
  return db
    .select()
    .from(settlements)
    .where(and(eq(settlements.groupId, groupId), isNull(settlements.deletedAt)))
    .orderBy(desc(settlements.paidOn), desc(settlements.createdAt))
    .all();
}

export function recordSettlement(db, input) {
  const { groupId, fromMemberId, toMemberId, amount, paidOn, note } = input;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new DbValidationError('invalidAmount');
  if (fromMemberId === toMemberId) throw new DbValidationError('sameMember');

  const timestamp = now();
  const id = newId();
  db.transaction((tx) => {
    const group = getGroup(tx, groupId);
    if (!group) throw new DbValidationError('groupNotFound');
    assertActiveMembers(tx, groupId, [fromMemberId, toMemberId]);
    const values = {
      id,
      groupId,
      fromMemberId,
      toMemberId,
      amount,
      currency: input.currency ?? group.currency,
      paidOn,
      note: note ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    tx.insert(settlements).values(values).run();
    logActivity(tx, {
      groupId,
      type: 'settlement_created',
      entityType: 'settlement',
      entityId: id,
      payload: activityPayload(values),
      at: timestamp,
    });
    touchGroup(tx, groupId, timestamp);
  });
  notifyChange(TABLES);
  return id;
}

function setDeleted(db, id, deleted) {
  const timestamp = now();
  db.transaction((tx) => {
    const current = tx.select().from(settlements).where(eq(settlements.id, id)).get();
    if (!current || Boolean(current.deletedAt) === deleted) {
      throw new DbValidationError('settlementNotFound');
    }
    tx.update(settlements)
      .set({ deletedAt: deleted ? timestamp : null, updatedAt: timestamp })
      .where(eq(settlements.id, id))
      .run();
    logActivity(tx, {
      groupId: current.groupId,
      type: deleted ? 'settlement_deleted' : 'settlement_restored',
      entityType: 'settlement',
      entityId: id,
      payload: activityPayload(current),
      at: timestamp,
    });
    touchGroup(tx, current.groupId, timestamp);
  });
  notifyChange(TABLES);
}

export function softDeleteSettlement(db, id) {
  setDeleted(db, id, true);
}

export function restoreSettlement(db, id) {
  setDeleted(db, id, false);
}
