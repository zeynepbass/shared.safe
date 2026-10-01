import { eq, inArray, isNull } from 'drizzle-orm';

import { importGroupDoc } from '@ortak-kasa/core/groupDoc';

import { newId, now } from '../ids';
import {
  activityLog,
  expenses,
  expenseShares,
  groupDocs,
  groups,
  members,
  settlements,
  syncGroups,
  users,
} from '../schema';
import { ensureRecoverySecret, groupKeys } from '../security/keys';
import { resyncGroupEncrypted, startGroupSync } from './groupDocs';

// Brings data from older versions up to date, once, at startup:
// - a profile made before recovery phrases gets its recovery secret (and so its identity);
// - groups that synced before encryption get a key and are sent again, sealed; a group that was
//   joined but has not arrived yet cannot be read without a key and is dropped (it needs a new
//   invite);
// - groups created before sync existed become documents (below).
export function bootstrapSync(db) {
  const profile = db.select({ id: users.id }).from(users).where(isNull(users.deletedAt)).get();
  if (profile) ensureRecoverySecret(db);

  for (const row of db.select().from(syncGroups).all()) {
    if (groupKeys(db, row.groupId).length) continue;
    const arrived = db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.id, row.groupId))
      .get();
    if (arrived) resyncGroupEncrypted(db, row.groupId);
    else {
      db.delete(groupDocs).where(eq(groupDocs.groupId, row.groupId)).run();
      db.delete(syncGroups).where(eq(syncGroups.groupId, row.groupId)).run();
    }
  }

  importLegacyGroups(db);
}

// Groups created before sync existed live only in the read tables. Each one becomes a document
// once, with its ids, timestamps and history intact, and starts syncing like a new group.
function importLegacyGroups(db) {
  const legacy = db
    .select({ id: groups.id })
    .from(groups)
    .leftJoin(syncGroups, eq(syncGroups.groupId, groups.id))
    .where(isNull(syncGroups.groupId))
    .all();

  for (const { id } of legacy) {
    const group = db.select().from(groups).where(eq(groups.id, id)).get();
    const memberRows = db.select().from(members).where(eq(members.groupId, id)).all();
    const expenseRows = db.select().from(expenses).where(eq(expenses.groupId, id)).all();
    const shareRows = expenseRows.length
      ? db
          .select()
          .from(expenseShares)
          .where(
            inArray(
              expenseShares.expenseId,
              expenseRows.map((e) => e.id),
            ),
          )
          .all()
          .filter((s) => !s.deletedAt)
      : [];
    const doc = importGroupDoc(
      {
        group: {
          id: group.id,
          name: group.name,
          type: group.type,
          currency: group.currency,
          icon: group.icon,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
          archivedAt: group.archivedAt,
          deletedAt: group.deletedAt,
        },
        members: memberRows.map((m) => ({
          id: m.id,
          name: m.name,
          avatarColor: m.avatarColor,
          position: m.position,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          deletedAt: m.deletedAt,
        })),
        expenses: expenseRows.map((e) => {
          const shares = shareRows.filter((s) => s.expenseId === e.id);
          return {
            id: e.id,
            description: e.description,
            amount: e.amount,
            currency: e.currency,
            category: e.category,
            payerId: e.payerId,
            spentOn: e.spentOn,
            note: e.note,
            splitType: shares[0]?.splitType ?? 'equal',
            shares: shares.map((s) => ({
              memberId: s.memberId,
              amount: s.amount,
              weight: s.weight,
            })),
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            deletedAt: e.deletedAt,
          };
        }),
        settlements: db
          .select()
          .from(settlements)
          .where(eq(settlements.groupId, id))
          .all()
          .map((s) => ({
            id: s.id,
            fromMemberId: s.fromMemberId,
            toMemberId: s.toMemberId,
            amount: s.amount,
            currency: s.currency,
            paidOn: s.paidOn,
            note: s.note,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            deletedAt: s.deletedAt,
          })),
        activity: db
          .select()
          .from(activityLog)
          .where(eq(activityLog.groupId, id))
          .all()
          .filter((a) => !a.deletedAt)
          .map((a) => ({
            id: a.id,
            type: a.type,
            entityType: a.entityType,
            entityId: a.entityId,
            payload: a.payload,
            occurredAt: a.occurredAt,
          })),
      },
      { now: now(), newId },
    );
    const localMemberId = memberRows.find((m) => m.isLocalUser)?.id ?? null;
    startGroupSync(db, id, doc, { localMemberId });
  }
}
