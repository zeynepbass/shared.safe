import { and, asc, eq, isNull } from 'drizzle-orm';

import * as groupDoc from '@ortak-kasa/core/groupDoc';

import { DbValidationError } from '../errors';
import { newId } from '../ids';
import { members, syncGroups } from '../schema';
import { commitGroupChange } from '../sync/groupDocs';

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

function requireEditable(db, id) {
  const member = getMember(db, id);
  if (!member || member.deletedAt) throw new DbValidationError('memberNotFound');
  // The local user's member mirrors the profile and is changed through saveProfile.
  if (member.isLocalUser) throw new DbValidationError('memberIsLocalUser');
  return member;
}

export function addMember(db, groupId, { name, avatarColor }) {
  const id = newId();
  commitGroupChange(db, groupId, (doc, ctx) =>
    groupDoc.addMember(doc, { id, name, avatarColor }, ctx),
  );
  return id;
}

export function updateMember(db, id, { name, avatarColor }) {
  const member = requireEditable(db, id);
  commitGroupChange(db, member.groupId, (doc, ctx) =>
    groupDoc.updateMember(doc, id, { name, avatarColor }, ctx),
  );
}

// Refused while anything (including soft-deleted expenses that may come back) points at the
// member; otherwise balances would silently change. The group's key is then replaced, so the
// removed member cannot read what comes after (done by the sync client once online).
export function removeMember(db, id) {
  const member = requireEditable(db, id);
  commitGroupChange(db, member.groupId, (doc, ctx) => groupDoc.removeMember(doc, id, ctx), {
    afterProject: (tx) =>
      tx
        .update(syncGroups)
        .set({ rekeyPending: true })
        .where(eq(syncGroups.groupId, member.groupId))
        .run(),
  });
}
