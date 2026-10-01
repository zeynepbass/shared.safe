import { readAllAt, readAt } from './canonical.js';

const byPosition = (a, b) => a.position - b.position || a.createdAt - b.createdAt;
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
}

// Every version of an expense that is currently in conflict, or null. The first entry is the
// one shown until someone resolves it; the order is the same on every device.
export function expenseConflict(doc, expenseId) {
  const versions = readAllAt(doc, ['expenses'], expenseId);
  const distinct = versions.filter((v, i) => versions.findIndex((w) => same(v, w)) === i);
  // Identical concurrent writes are not a real disagreement.
  return distinct.length > 1 ? distinct : null;
}

// Plain-object view of a group document, including soft-deleted records, for projecting into
// the local read tables. Returns null until the group's first change has arrived.
export function readGroupDoc(doc) {
  const root = readAt(doc);
  if (!root?.group) return null;
  const members = Object.values(root.members).sort(byPosition);
  const expenses = Object.values(root.expenses).map((expense) => ({
    ...expense,
    hasConflict: expenseConflict(doc, expense.id) !== null,
  }));
  const settlements = Object.values(root.settlements);
  const activity = Object.values(root.activity).sort(
    (a, b) => b.occurredAt - a.occurredAt || (a.id < b.id ? -1 : 1),
  );
  return { group: root.group, members, expenses, settlements, activity };
}

const COLLECTIONS = ['members', 'expenses', 'settlements', 'activity'];

// Which records a list of Automerge patches touched, so only those need projecting again:
// { all, group, members, expenses, settlements, activity } with a Set of ids per collection.
// An expense whose conflict appeared or went away is included (Automerge reports both). `all`
// is set when the document's shape itself changed, as in a group's first change; then everything
// has to be read.
export function touchedRecords(patches) {
  const touched = { all: false, group: false };
  for (const name of COLLECTIONS) touched[name] = new Set();
  for (const { path } of patches) {
    const [top, id] = path;
    if (top === 'group') touched.group = true;
    else if (COLLECTIONS.includes(top) && path.length > 1) touched[top].add(id);
    else touched.all = true;
  }
  return touched;
}

// One record as readGroupDoc would return it; undefined when the document does not have it.
export function readRecord(doc, collection, id) {
  const record = readAt(doc, [collection, id]);
  if (!record || collection !== 'expenses') return record;
  return { ...record, hasConflict: expenseConflict(doc, id) !== null };
}

// Identity keys of the members still in the group: who a new group key must be sealed to.
export function keyRecipients(doc) {
  const members = readAt(doc, ['members']) ?? {};
  return Object.values(members)
    .filter((m) => !m.deletedAt && typeof m.publicKey === 'string')
    .map((m) => ({ memberId: m.id, publicKey: m.publicKey }));
}

export function listExpenseConflicts(doc) {
  const expenses = readAt(doc, ['expenses']);
  if (!expenses) return [];
  return Object.keys(expenses)
    .map((id) => ({ expenseId: id, versions: expenseConflict(doc, id) }))
    .filter((c) => c.versions);
}
