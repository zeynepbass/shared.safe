import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { notifyChange } from '../changes';
import { DbValidationError } from '../errors';
import { newId, now } from '../ids';
import { expenses, expenseShares, members, settlements } from '../schema';
import { logActivity } from './activityRepository';
import { touchGroup } from './groupAccess';

export function listMembers(db, groupId) {
  return db
    .select()
    .from(members)
    .where(and(eq(members.groupId, groupId), isNull(members.deletedAt)))
    .orderBy(asc(members.position), asc(members.createdAt))
    .all();
}

export function getMember(db, id) {
  return db.select().from(members).where(eq(members.id, id)).get() ?? null;
}

// Throws unless every id is an active member of the group.
export function assertActiveMembers(executor, groupId, memberIds) {
  const unique = [...new Set(memberIds)];
  if (unique.length === 0) return;
  const found = executor
    .select({ id: members.id })
    .from(members)
    .where(
      and(eq(members.groupId, groupId), isNull(members.deletedAt), inArray(members.id, unique)),
    )
    .all();
  if (found.length !== unique.length) {
    throw new DbValidationError('memberNotInGroup', 'Member does not belong to this group');
  }
}

export function insertMember(
  tx,
  groupId,
  { name, avatarColor, avatarPath = null, isLocalUser = false },
  at,
) {
  const id = newId();
  const { next } = tx
    .select({ next: sql`COALESCE(MAX(${members.position}), -1) + 1` })
    .from(members)
    .where(eq(members.groupId, groupId))
    .get();
  tx.insert(members)
    .values({
      id,
      groupId,
      name: name.trim(),
      avatarColor,
      avatarPath,
      isLocalUser,
      position: Number(next),
      createdAt: at,
      updatedAt: at,
    })
    .run();
  logActivity(tx, {
    groupId,
    type: 'member_added',
    entityType: 'member',
    entityId: id,
    payload: { name: name.trim() },
    at,
  });
  return id;
}

export function addMember(db, groupId, input) {
  const timestamp = now();
  const id = db.transaction((tx) => {
    const memberId = insertMember(tx, groupId, input, timestamp);
    touchGroup(tx, groupId, timestamp);
    return memberId;
  });
  notifyChange(['members', 'groups', 'activity_log']);
  return id;
}

export function updateMember(db, id, { name, avatarColor }) {
  const timestamp = now();
  db.transaction((tx) => {
    const member = getMember(tx, id);
    if (!member || member.deletedAt) throw new DbValidationError('memberNotFound');
    // The local user's member row mirrors the profile and is edited through saveProfile.
    if (member.isLocalUser) throw new DbValidationError('memberIsLocalUser');
    tx.update(members)
      .set({ name: name.trim(), avatarColor, updatedAt: timestamp })
      .where(eq(members.id, id))
      .run();
    logActivity(tx, {
      groupId: member.groupId,
      type: 'member_updated',
      entityType: 'member',
      entityId: id,
      payload: { name: name.trim() },
      at: timestamp,
    });
  });
  notifyChange(['members', 'activity_log']);
}

function isReferenced(executor, memberId) {
  const share = executor
    .select({ id: expenseShares.id })
    .from(expenseShares)
    .where(and(eq(expenseShares.memberId, memberId), isNull(expenseShares.deletedAt)))
    .limit(1)
    .get();
  if (share) return true;
  const paid = executor
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.payerId, memberId))
    .limit(1)
    .get();
  if (paid) return true;
  const settled = executor
    .select({ id: settlements.id })
    .from(settlements)
    .where(
      and(
        isNull(settlements.deletedAt),
        or(eq(settlements.fromMemberId, memberId), eq(settlements.toMemberId, memberId)),
      ),
    )
    .limit(1)
    .get();
  return Boolean(settled);
}

// A member can only be removed while nothing (including soft-deleted expenses that may be
// restored) points at them; otherwise balances would silently change.
export function removeMember(db, id) {
  const timestamp = now();
  db.transaction((tx) => {
    const member = getMember(tx, id);
    if (!member || member.deletedAt) throw new DbValidationError('memberNotFound');
    if (member.isLocalUser) throw new DbValidationError('memberIsLocalUser');
    if (isReferenced(tx, id)) throw new DbValidationError('memberInUse');
    tx.update(members)
      .set({ deletedAt: timestamp, updatedAt: timestamp })
      .where(eq(members.id, id))
      .run();
    logActivity(tx, {
      groupId: member.groupId,
      type: 'member_removed',
      entityType: 'member',
      entityId: id,
      payload: { name: member.name },
      at: timestamp,
    });
    touchGroup(tx, member.groupId, timestamp);
  });
  notifyChange(['members', 'groups', 'activity_log']);
}
