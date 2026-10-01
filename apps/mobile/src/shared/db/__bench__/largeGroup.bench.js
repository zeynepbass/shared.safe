import { computeBalances } from '@ortak-kasa/core/balances';
import { addSettlement, putExpense } from '@ortak-kasa/core/groupDoc';
import { simplifyDebts } from '@ortak-kasa/core/simplify';
import { FULL_PERCENT } from '@ortak-kasa/core/split';

import { buildTimeline } from '@/features/groups/timeline';

import {
  addMember,
  createExpense,
  createGroup,
  getGroupBalances,
  getGroupOverview,
  getGroupSnapshot,
  getGroupStats,
  getGroupWithMembers,
  listGroupSummaries,
  listMembers,
  restoreExpense,
  saveProfile,
  softDeleteExpense,
  updateExpense,
} from '../repositories';
import { commitGroupChange, forgetGroupDocs, loadGroupDoc } from '../sync/groupDocs';
import { createTestDb } from '../testing/createTestDb';

// Measures the paths a large group goes through: opening it, listing it, working out balances
// and changing one expense. Run with `npm run bench` (BENCH_EXPENSES sets the size).
//
// Node runs Automerge's WebAssembly natively; on a phone it runs on an interpreter, so the
// document rows below are far slower there while the SQLite and plain JS rows are comparable.

const EXPENSES = Number(process.env.BENCH_EXPENSES ?? 10000);
const SETTLEMENTS = Math.round(EXPENSES / 50);
const NAMES = ['Ali', 'Ayşe', 'Mert', 'Ece', 'Deniz'];
const CATEGORIES = ['market', 'food', 'bills', 'home', 'transport', 'stay', 'fun', 'other'];
const SPLITS = ['equal', 'equal', 'equal', 'shares', 'percent'];

// Same data on every run.
function randomSource(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function isoDay(index) {
  const date = new Date(Date.UTC(2024, 0, 1) + (index % 1000) * 86400000);
  return date.toISOString().slice(0, 10);
}

function expenseInput(index, memberIds, random) {
  const splitType = SPLITS[index % SPLITS.length];
  const count = 2 + Math.floor(random() * (memberIds.length - 1));
  const included = memberIds.slice(0, count);
  const weights =
    splitType === 'percent'
      ? included.map((_, i) => (i === 0 ? FULL_PERCENT - 1000 * (count - 1) : 1000))
      : included.map((_, i) => (splitType === 'shares' ? i + 1 : undefined));
  return {
    description: `Harcama ${index + 1}`,
    amount: 500 + Math.floor(random() * 250000),
    category: CATEGORIES[index % CATEGORIES.length],
    payerId: memberIds[index % memberIds.length],
    spentOn: isoDay(index),
    splitType,
    shares: included.map((memberId, i) => ({ memberId, weight: weights[i] })),
  };
}

function seed() {
  const { db } = createTestDb();
  saveProfile(db, { name: 'Zeynep', avatarColor: '#111', defaultCurrency: 'TRY' });
  const groupId = createGroup(db, { name: 'Ev', type: 'home', currency: 'TRY' });
  for (const name of NAMES) addMember(db, groupId, { name, avatarColor: '#222' });
  const memberIds = listMembers(db, groupId).map((m) => m.id);
  const random = randomSource(42);

  // One commit for everything: the history is the same as adding the records one by one,
  // without projecting the group once per record.
  commitGroupChange(db, groupId, (doc, ctx) => {
    let next = doc;
    for (let i = 0; i < EXPENSES; i += 1) {
      const input = { ...expenseInput(i, memberIds, random), id: ctx.newId() };
      next = putExpense(next, input, { ...ctx, now: ctx.now + i });
    }
    for (let i = 0; i < SETTLEMENTS; i += 1) {
      const input = {
        id: ctx.newId(),
        fromMemberId: memberIds[(i + 1) % memberIds.length],
        toMemberId: memberIds[i % memberIds.length],
        amount: 1000 + i,
        paidOn: isoDay(i * 7),
      };
      next = addSettlement(next, input, { ...ctx, now: ctx.now + EXPENSES + i });
    }
    return next;
  });
  return { db, groupId, memberIds, random };
}

function measure(label, fn, { runs = 5 } = {}) {
  const times = [];
  let result;
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    result = fn(i);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { label, median: times[Math.floor(times.length / 2)], max: times.at(-1), result };
}

describe(`group with ${EXPENSES} expenses`, () => {
  it('reports how long reads and writes take', () => {
    const seedStart = performance.now();
    const { db, groupId, memberIds, random } = seed();
    const seedMs = performance.now() - seedStart;

    const rows = [];
    const record = (...args) => {
      const row = measure(...args);
      rows.push(row);
      return row.result;
    };

    record('open: load the document', () => {
      forgetGroupDocs(db);
      return loadGroupDoc(db, groupId);
    });
    record('group screen: read (newest 200)', () => getGroupOverview(db, groupId, { limit: 200 }));
    const overview = record('group screen: read (all)', () => getGroupOverview(db, groupId));
    const timeline = record('group screen: timeline rows (all)', () =>
      buildTimeline(overview.expenses, overview.settlements),
    );
    const sheet = record('balances screen: read', () => getGroupBalances(db, groupId));
    record('balances screen: simplify debts', () =>
      simplifyDebts(sheet.balances, { order: memberIds }),
    );
    record('groups screen: read', () => listGroupSummaries(db));
    record('stats screen: read', () => getGroupStats(db, groupId, { today: '2026-09-29' }));
    record('expense form: read', () => getGroupWithMembers(db, groupId));

    // Everything loaded and summed in JS, which is what the screens above used to do; kept as
    // the yardstick and as a check on the SQL sums.
    const snapshot = record('reference: every expense with shares', () =>
      getGroupSnapshot(db, groupId),
    );
    const reference = record('reference: balances in JS', () => computeBalances(snapshot));

    const created = [];
    record('write: add an expense', (i) => {
      created.push(
        createExpense(db, { ...expenseInput(EXPENSES + i, memberIds, random), groupId }),
      );
    });
    record('write: edit an expense', (i) =>
      updateExpense(db, created[i], {
        ...expenseInput(EXPENSES + i, memberIds, random),
        groupId,
        amount: 4200 + i,
      }),
    );
    record('write: delete an expense', (i) => softDeleteExpense(db, created[i]));
    record('write: restore an expense', (i) => restoreExpense(db, created[i]));

    const width = Math.max(...rows.map((r) => r.label.length));
    const lines = rows.map(
      (r) =>
        `${r.label.padEnd(width)}  ${r.median.toFixed(1).padStart(9)} ms  (max ${r.max.toFixed(1)})`,
    );
    process.stdout.write(
      [
        '',
        `${EXPENSES} expenses, ${SETTLEMENTS} settlements, ${memberIds.length} members`,
        `seeded in ${(seedMs / 1000).toFixed(1)} s, ${timeline.length} timeline rows`,
        ...lines,
        '',
      ].join('\n'),
    );

    expect(overview.expenses).toHaveLength(EXPENSES);
    expect(sheet.balances).toEqual(reference);
    expect([...sheet.balances.values()].reduce((sum, v) => sum + v, 0)).toBe(0);
  });
});
