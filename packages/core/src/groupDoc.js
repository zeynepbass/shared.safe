import { Automerge } from './automerge.js';
import { GROUP_TYPES } from './constants.js';
import { readAt } from './canonical.js';
import { ValidationError } from './errors.js';
import { CURRENCY_CODES } from './money.js';
import { buildShares } from './shares.js';

// One Automerge document per group:
//
//   { schema, group, members: {id: Member}, expenses: {id: Expense},
//     settlements: {id: Settlement}, activity: {id: Entry} }
//
// Records are keyed by UUID so concurrent additions never collide. Members, settlements and the
// group itself are edited field by field (last writer wins per field, which is harmless there).
// An expense is always written as a whole new object: its amount and shares must agree, and a
// field-level merge could combine one device's amount with another's shares. Replacing the whole
// record turns concurrent edits (and edit vs delete) into an Automerge conflict instead, which
// readGroupDoc reports and resolveExpenseConflict settles.
//
// Reads never use the document's JS view (see canonical.js); the `d` proxy inside a change is
// only written to.

export const SCHEMA_VERSION = 1;

// Automerge rejects undefined; optional fields are stored as null.
function clean(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  }
  return value;
}

const isActive = (record) => record && !record.deletedAt;

function requireGroup(doc) {
  const group = readAt(doc, ['group']);
  if (!group || group.deletedAt) throw new ValidationError('groupNotFound');
  return group;
}

function requireActiveMembers(doc, ids) {
  const members = readAt(doc, ['members']) ?? {};
  for (const id of new Set(ids)) {
    if (!isActive(members[id])) {
      throw new ValidationError('memberNotInGroup', 'Member does not belong to this group');
    }
  }
}

function checkGroupFields({ name, type, currency }) {
  if (!name?.trim()) throw new ValidationError('nameRequired');
  if (!GROUP_TYPES.includes(type)) throw new ValidationError('invalidGroupType');
  if (!CURRENCY_CODES.includes(currency)) throw new ValidationError('invalidCurrency');
}

function log(d, ctx, entry) {
  const id = ctx.newId();
  d.activity[id] = clean({
    id,
    actorMemberId: ctx.actorMemberId ?? null,
    occurredAt: ctx.now,
    payload: null,
    ...entry,
  });
  d.group.updatedAt = ctx.now;
}

// `ctx.onPatches`, when given, receives Automerge's patches for the change, so the caller can
// tell which records it touched (see touchedRecords).
function change(doc, ctx, fn) {
  return Automerge.change(
    doc,
    { time: Math.floor(ctx.now / 1000), patchCallback: ctx.onPatches },
    fn,
  );
}

function insertMember(d, ctx, { id, name, avatarColor }, position) {
  const trimmed = name?.trim();
  if (!trimmed) throw new ValidationError('memberRequired');
  d.members[id] = clean({
    id,
    name: trimmed,
    avatarColor,
    position,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
  });
  log(d, ctx, {
    type: 'member_added',
    entityType: 'member',
    entityId: id,
    payload: { name: trimmed },
  });
}

// Builds a new group document. Only the device that creates the group calls this; others start
// from an empty document and receive these changes, so there is a single root for everyone.
// `members[0]` is the creator.
export function createGroupDoc({ id, name, type, currency, icon, members }, ctx) {
  checkGroupFields({ name, type, currency });
  if (!members?.length) throw new ValidationError('profileMissing');
  return change(Automerge.init(), ctx, (d) => {
    d.schema = SCHEMA_VERSION;
    d.group = clean({
      id,
      name: name.trim(),
      type,
      currency,
      icon: icon ?? type,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      archivedAt: null,
      deletedAt: null,
    });
    d.members = {};
    d.expenses = {};
    d.settlements = {};
    d.activity = {};
    log(
      d,
      { ...ctx, actorMemberId: members[0].id },
      {
        type: 'group_created',
        entityType: 'group',
        entityId: id,
        payload: { name: name.trim() },
      },
    );
    members.forEach((member, index) =>
      insertMember(d, { ...ctx, actorMemberId: members[0].id }, member, index),
    );
  });
}

export function updateGroup(doc, { name, type, currency, icon }, ctx) {
  const group = requireGroup(doc);
  checkGroupFields({ name, type, currency });
  return change(doc, ctx, (d) => {
    Object.assign(d.group, { name: name.trim(), type, currency, icon: icon ?? type });
    log(d, ctx, {
      type: 'group_updated',
      entityType: 'group',
      entityId: group.id,
      payload: { name: name.trim() },
    });
  });
}

export function deleteGroup(doc, ctx) {
  const group = requireGroup(doc);
  return change(doc, ctx, (d) => {
    d.group.deletedAt = ctx.now;
    log(d, ctx, {
      type: 'group_deleted',
      entityType: 'group',
      entityId: group.id,
      payload: { name: group.name },
    });
  });
}

export function addMember(doc, member, ctx) {
  requireGroup(doc);
  const positions = Object.values(readAt(doc, ['members']) ?? {}).map((m) => m.position);
  const position = positions.length ? Math.max(...positions) + 1 : 0;
  return change(doc, ctx, (d) => insertMember(d, ctx, member, position));
}

export function updateMember(doc, id, { name, avatarColor }, ctx) {
  requireGroup(doc);
  if (!isActive(readAt(doc, ['members', id]))) throw new ValidationError('memberNotFound');
  const trimmed = name?.trim();
  if (!trimmed) throw new ValidationError('memberRequired');
  return change(doc, ctx, (d) => {
    Object.assign(d.members[id], { name: trimmed, avatarColor, updatedAt: ctx.now });
    log(d, ctx, {
      type: 'member_updated',
      entityType: 'member',
      entityId: id,
      payload: { name: trimmed },
    });
  });
}

// Records the identity key (base64url) of the user who is this member, so key rotations can
// reach them. Not an activity: nobody needs to see it. A no-op when it is already there.
export function setMemberKey(doc, id, publicKey, ctx) {
  requireGroup(doc);
  const member = readAt(doc, ['members', id]);
  if (!isActive(member)) throw new ValidationError('memberNotFound');
  if (member.publicKey === publicKey) return doc;
  return change(doc, ctx, (d) => {
    d.members[id].publicKey = publicKey;
  });
}

// Anything that still points at a member, including soft-deleted expenses that may come back.
export function isMemberReferenced(doc, id) {
  return (
    Object.values(readAt(doc, ['expenses']) ?? {}).some(
      (e) => e.payerId === id || e.shares.some((s) => s.memberId === id),
    ) ||
    Object.values(readAt(doc, ['settlements']) ?? {}).some(
      (s) => isActive(s) && (s.fromMemberId === id || s.toMemberId === id),
    )
  );
}

export function removeMember(doc, id, ctx) {
  requireGroup(doc);
  const member = readAt(doc, ['members', id]);
  if (!isActive(member)) throw new ValidationError('memberNotFound');
  if (isMemberReferenced(doc, id)) throw new ValidationError('memberInUse');
  return change(doc, ctx, (d) => {
    d.members[id].deletedAt = ctx.now;
    d.members[id].updatedAt = ctx.now;
    log(d, ctx, {
      type: 'member_removed',
      entityType: 'member',
      entityId: id,
      payload: { name: member.name },
    });
  });
}

const expensePayload = (e) => ({
  description: e.description,
  amount: e.amount,
  currency: e.currency,
});

// Creates the expense when `id` is new, otherwise replaces it (see the note at the top).
export function putExpense(doc, input, ctx) {
  const group = requireGroup(doc);
  const current = readAt(doc, ['expenses', input.id]);
  if (current?.deletedAt) throw new ValidationError('expenseNotFound');
  const shares = buildShares(input.amount, input.splitType, input.shares);
  requireActiveMembers(doc, [input.payerId, ...shares.map((s) => s.memberId)]);
  const description = input.description?.trim();
  if (!description) throw new ValidationError('descriptionRequired');

  const record = clean({
    id: input.id,
    description,
    amount: input.amount,
    currency: input.currency ?? group.currency,
    category: input.category,
    payerId: input.payerId,
    spentOn: input.spentOn,
    note: input.note ?? null,
    // The id of the receipt photo, a sealed file kept on the relay next to the group's log.
    receiptId: input.receiptId ?? null,
    splitType: input.splitType,
    shares: shares.map(({ memberId, amount, weight }) => ({ memberId, amount, weight })),
    createdAt: current?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
  });
  return change(doc, ctx, (d) => {
    d.expenses[input.id] = record;
    log(d, ctx, {
      type: current ? 'expense_updated' : 'expense_created',
      entityType: 'expense',
      entityId: input.id,
      payload: expensePayload(record),
    });
  });
}

export function setExpenseDeleted(doc, id, deleted, ctx) {
  requireGroup(doc);
  const current = readAt(doc, ['expenses', id]);
  if (!current || Boolean(current.deletedAt) === deleted) {
    throw new ValidationError('expenseNotFound');
  }
  return change(doc, ctx, (d) => {
    d.expenses[id] = { ...current, deletedAt: deleted ? ctx.now : null, updatedAt: ctx.now };
    log(d, ctx, {
      type: deleted ? 'expense_deleted' : 'expense_restored',
      entityType: 'expense',
      entityId: id,
      payload: expensePayload(current),
    });
  });
}

// Keeps `version` (one of the alternatives readGroupDoc listed) as the expense for everyone. A
// fresh assignment supersedes every conflicting one, so the conflict disappears on all devices
// once they have this change.
export function resolveExpenseConflict(doc, id, version, ctx) {
  requireGroup(doc);
  if (!readAt(doc, ['expenses', id]) || version?.id !== id) {
    throw new ValidationError('expenseNotFound');
  }
  if (!version.deletedAt) {
    requireActiveMembers(doc, [version.payerId, ...version.shares.map((s) => s.memberId)]);
  }
  return change(doc, ctx, (d) => {
    d.expenses[id] = clean({ ...version, updatedAt: ctx.now });
    log(d, ctx, {
      type: version.deletedAt ? 'expense_deleted' : 'expense_updated',
      entityType: 'expense',
      entityId: id,
      payload: expensePayload(version),
    });
  });
}

const settlementPayload = (s) => ({
  fromMemberId: s.fromMemberId,
  toMemberId: s.toMemberId,
  amount: s.amount,
  currency: s.currency,
});

export function addSettlement(doc, input, ctx) {
  const group = requireGroup(doc);
  const { id, fromMemberId, toMemberId, amount, paidOn, note } = input;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ValidationError('invalidAmount');
  if (fromMemberId === toMemberId) throw new ValidationError('sameMember');
  requireActiveMembers(doc, [fromMemberId, toMemberId]);
  const record = clean({
    id,
    fromMemberId,
    toMemberId,
    amount,
    currency: input.currency ?? group.currency,
    paidOn,
    note: note ?? null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
  });
  return change(doc, ctx, (d) => {
    d.settlements[id] = record;
    log(d, ctx, {
      type: 'settlement_created',
      entityType: 'settlement',
      entityId: id,
      payload: settlementPayload(record),
    });
  });
}

export function setSettlementDeleted(doc, id, deleted, ctx) {
  requireGroup(doc);
  const current = readAt(doc, ['settlements', id]);
  if (!current || Boolean(current.deletedAt) === deleted) {
    throw new ValidationError('settlementNotFound');
  }
  return change(doc, ctx, (d) => {
    d.settlements[id].deletedAt = deleted ? ctx.now : null;
    d.settlements[id].updatedAt = ctx.now;
    log(d, ctx, {
      type: deleted ? 'settlement_deleted' : 'settlement_restored',
      entityType: 'settlement',
      entityId: id,
      payload: settlementPayload(current),
    });
  });
}

// Turns a group that existed before sync (plain records from the local database) into a document
// in one change, keeping ids, timestamps and history as they were.
export function importGroupDoc({ group, members, expenses, settlements, activity }, ctx) {
  return change(Automerge.init(), ctx, (d) => {
    d.schema = SCHEMA_VERSION;
    d.group = clean({ archivedAt: null, deletedAt: null, ...group });
    d.members = {};
    d.expenses = {};
    d.settlements = {};
    d.activity = {};
    for (const m of members) d.members[m.id] = clean(m);
    for (const e of expenses) d.expenses[e.id] = clean(e);
    for (const s of settlements) d.settlements[s.id] = clean(s);
    for (const a of activity) d.activity[a.id] = clean({ actorMemberId: null, ...a });
  });
}
