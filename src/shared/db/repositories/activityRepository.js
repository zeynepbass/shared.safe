import { and, desc, eq, isNull } from 'drizzle-orm';

import { newId } from '../ids';
import { activityLog } from '../schema';

// Written inside the same transaction as the change it describes.
export function logActivity(tx, { groupId, type, entityType, entityId, payload = null, at }) {
  tx.insert(activityLog)
    .values({
      id: newId(),
      groupId,
      type,
      entityType,
      entityId,
      payload,
      occurredAt: at,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

export function listActivity(db, groupId, { limit = 50 } = {}) {
  return db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.groupId, groupId), isNull(activityLog.deletedAt)))
    .orderBy(desc(activityLog.occurredAt), desc(activityLog.createdAt))
    .limit(limit)
    .all();
}

export function listEntityActivity(db, entityType, entityId) {
  return db
    .select()
    .from(activityLog)
    .where(
      and(
        eq(activityLog.entityType, entityType),
        eq(activityLog.entityId, entityId),
        isNull(activityLog.deletedAt),
      ),
    )
    .orderBy(desc(activityLog.occurredAt))
    .all();
}
