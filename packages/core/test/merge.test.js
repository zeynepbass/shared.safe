import { randomUUID } from 'node:crypto';

import { Automerge } from '../src/automerge.js';
import { computeBalances } from '../src/balances.js';
import {
  addMember,
  addSettlement,
  createGroupDoc,
  putExpense,
  removeMember,
  resolveExpenseConflict,
  setExpenseDeleted,
  updateMember,
} from '../src/groupDoc.js';
import { expenseConflict, listExpenseConflicts, readGroupDoc } from '../src/readGroupDoc.js';
import { simplifyDebts } from '../src/simplify.js';

let clock = Date.UTC(2026, 8, 30, 9);
const ctx = (actorMemberId) => ({ now: (clock += 1000), newId: randomUUID, actorMemberId });

const A_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const B_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const C_ID = 'cccccccc-0000-4000-8000-000000000003';

// A "device" is just its own copy of the document; syncing is exchanging changes.
function setupGroup() {
  const origin = createGroupDoc(
    {
      id: randomUUID(),
      name: 'Ev',
      type: 'home',
      currency: 'TRY',
      members: [
        { id: A_ID, name: 'Ayşe', avatarColor: '#1' },
        { id: B_ID, name: 'Berk', avatarColor: '#2' },
        { id: C_ID, name: 'Cem', avatarColor: '#3' },
      ],
    },
    ctx(A_ID),
  );
  const phone = Automerge.clone(origin);
  const tablet = Automerge.applyChanges(Automerge.init(), Automerge.getAllChanges(origin))[0];
  return { phone, tablet };
}

function exchange(left, right) {
  const toRight = Automerge.getChanges(right, left).length ? missing(right, left) : [];
  const toLeft = missing(left, right);
  return [Automerge.applyChanges(left, toLeft)[0], Automerge.applyChanges(right, toRight)[0]];
}

// Changes `from` has that `to` lacks.
function missing(to, from) {
  const have = new Set(Automerge.getAllChanges(to).map((c) => Automerge.decodeChange(c).hash));
  return Automerge.getAllChanges(from).filter((c) => !have.has(Automerge.decodeChange(c).hash));
}

const expense = (id, overrides = {}) => ({
  id,
  description: 'Market',
  amount: 30000,
  category: 'market',
  payerId: A_ID,
  spentOn: '2026-09-30',
  splitType: 'equal',
  shares: [{ memberId: A_ID }, { memberId: B_ID }, { memberId: C_ID }],
  ...overrides,
});

const sumShares = (e) => e.shares.reduce((s, x) => s + x.amount, 0);
const balancesOf = (doc) => {
  const view = readGroupDoc(doc);
  const active = (r) => !r.deletedAt;
  return computeBalances({
    members: view.members.filter(active),
    expenses: view.expenses.filter(active),
    settlements: view.settlements.filter(active),
  });
};

describe('two devices editing offline', () => {
  it('keeps everything both added while apart', () => {
    let { phone, tablet } = setupGroup();
    const e1 = randomUUID();
    const e2 = randomUUID();
    phone = putExpense(phone, expense(e1), ctx(A_ID));
    tablet = putExpense(tablet, expense(e2, { amount: 9001, payerId: B_ID }), ctx(B_ID));
    tablet = addMember(tablet, { id: randomUUID(), name: 'Deniz', avatarColor: '#4' }, ctx(B_ID));

    [phone, tablet] = exchange(phone, tablet);

    for (const doc of [phone, tablet]) {
      const view = readGroupDoc(doc);
      expect(view.expenses.map((e) => e.id).sort()).toEqual([e1, e2].sort());
      expect(view.members.map((m) => m.name)).toEqual(['Ayşe', 'Berk', 'Cem', 'Deniz']);
      expect(listExpenseConflicts(doc)).toEqual([]);
    }
    expect(Automerge.getHeads(phone)).toEqual(Automerge.getHeads(tablet));
    expect(Object.fromEntries(balancesOf(phone))).toEqual(Object.fromEntries(balancesOf(tablet)));
    expect([...balancesOf(phone).values()].reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('merges field edits on members without a conflict', () => {
    let { phone, tablet } = setupGroup();
    phone = updateMember(phone, C_ID, { name: 'Cem Y.', avatarColor: '#3' }, ctx(A_ID));
    tablet = updateMember(tablet, B_ID, { name: 'Berk K.', avatarColor: '#9' }, ctx(B_ID));
    [phone, tablet] = exchange(phone, tablet);
    expect(readGroupDoc(phone).members.map((m) => m.name)).toEqual(['Ayşe', 'Berk K.', 'Cem Y.']);
    expect(readGroupDoc(tablet)).toEqual(readGroupDoc(phone));
  });
});

describe('the same field written on two devices', () => {
  // Automerge 2.2's JS view keeps showing the local value after merging a concurrent write that
  // wins; core reads the WebAssembly state instead, so both devices must agree.
  it('reads the same winner on both devices', () => {
    for (let run = 0; run < 10; run += 1) {
      let { phone, tablet } = setupGroup();
      phone = updateMember(phone, C_ID, { name: 'Cem telefon', avatarColor: '#3' }, ctx(A_ID));
      tablet = updateMember(tablet, C_ID, { name: 'Cem tablet', avatarColor: '#3' }, ctx(B_ID));
      [phone, tablet] = exchange(phone, tablet);
      const onPhone = readGroupDoc(phone).members.find((m) => m.id === C_ID).name;
      const onTablet = readGroupDoc(tablet).members.find((m) => m.id === C_ID).name;
      expect(onPhone).toBe(onTablet);
      expect(readGroupDoc(Automerge.load(Automerge.save(phone))).members[2].name).toBe(onPhone);
    }
  });
});

describe('the same expense edited on two devices', () => {
  function editedTwice() {
    let { phone, tablet } = setupGroup();
    const id = randomUUID();
    phone = putExpense(phone, expense(id), ctx(A_ID));
    [phone, tablet] = exchange(phone, tablet);

    phone = putExpense(
      phone,
      expense(id, { amount: 45000, description: 'Market + su' }),
      ctx(A_ID),
    );
    tablet = putExpense(
      tablet,
      expense(id, {
        payerId: B_ID,
        splitType: 'shares',
        shares: [
          { memberId: A_ID, weight: 1 },
          { memberId: B_ID, weight: 2 },
        ],
      }),
      ctx(B_ID),
    );
    [phone, tablet] = exchange(phone, tablet);
    return { phone, tablet, id };
  }

  it('reports a conflict with both versions, identically on each device', () => {
    const { phone, tablet, id } = editedTwice();
    const onPhone = expenseConflict(phone, id);
    expect(onPhone).toHaveLength(2);
    expect(expenseConflict(tablet, id)).toEqual(onPhone);
    expect(onPhone.map((v) => v.amount).sort()).toEqual([30000, 45000]);
    expect(readGroupDoc(phone).expenses.find((e) => e.id === id).hasConflict).toBe(true);
  });

  it('never mixes the two versions, so shares still add up', () => {
    const { phone, tablet, id } = editedTwice();
    for (const doc of [phone, tablet]) {
      // eslint-disable-next-line no-unused-vars
      const { hasConflict, ...visible } = readGroupDoc(doc).expenses.find((e) => e.id === id);
      expect(sumShares(visible)).toBe(visible.amount);
      expect(expenseConflict(doc, id)[0]).toEqual(visible);
    }
    expect(Object.fromEntries(balancesOf(phone))).toEqual(Object.fromEntries(balancesOf(tablet)));
  });

  it('is settled everywhere once one device picks a version', () => {
    let { phone, tablet, id } = editedTwice();
    const keep = expenseConflict(phone, id).find((v) => v.payerId === B_ID);
    phone = resolveExpenseConflict(phone, id, keep, ctx(A_ID));
    [phone, tablet] = exchange(phone, tablet);
    for (const doc of [phone, tablet]) {
      expect(expenseConflict(doc, id)).toBeNull();
      const visible = readGroupDoc(doc).expenses.find((e) => e.id === id);
      expect(visible).toMatchObject({ payerId: B_ID, amount: 30000, splitType: 'shares' });
      expect(visible.hasConflict).toBe(false);
    }
  });
});

describe('delete on one device, edit on the other', () => {
  function deleteVsEdit() {
    let { phone, tablet } = setupGroup();
    const id = randomUUID();
    phone = putExpense(phone, expense(id), ctx(A_ID));
    [phone, tablet] = exchange(phone, tablet);
    phone = setExpenseDeleted(phone, id, true, ctx(A_ID));
    tablet = putExpense(tablet, expense(id, { amount: 12000 }), ctx(B_ID));
    [phone, tablet] = exchange(phone, tablet);
    return { phone, tablet, id };
  }

  it('surfaces both the deletion and the edit', () => {
    const { phone, tablet, id } = deleteVsEdit();
    const versions = expenseConflict(phone, id);
    expect(versions).toHaveLength(2);
    expect(versions.filter((v) => v.deletedAt)).toHaveLength(1);
    expect(versions.find((v) => !v.deletedAt).amount).toBe(12000);
    expect(expenseConflict(tablet, id)).toEqual(versions);
  });

  it('can keep the edited expense', () => {
    let { phone, tablet, id } = deleteVsEdit();
    const edited = expenseConflict(tablet, id).find((v) => !v.deletedAt);
    tablet = resolveExpenseConflict(tablet, id, edited, ctx(B_ID));
    [phone, tablet] = exchange(phone, tablet);
    const visible = readGroupDoc(phone).expenses.find((e) => e.id === id);
    expect(visible).toMatchObject({ amount: 12000, deletedAt: null, hasConflict: false });
    expect(balancesOf(phone).get(A_ID)).toBe(8000);
  });

  it('can confirm the deletion', () => {
    let { phone, tablet, id } = deleteVsEdit();
    const deleted = expenseConflict(phone, id).find((v) => v.deletedAt);
    phone = resolveExpenseConflict(phone, id, deleted, ctx(A_ID));
    [phone, tablet] = exchange(phone, tablet);
    expect(readGroupDoc(tablet).expenses.find((e) => e.id === id).deletedAt).not.toBeNull();
    expect([...balancesOf(tablet).values()]).toEqual([0, 0, 0]);
  });
});

describe('delivery order', () => {
  it('converges whatever order and however often changes arrive', () => {
    let { phone, tablet } = setupGroup();
    const base = Automerge.clone(phone);
    for (let i = 0; i < 5; i += 1) {
      phone = putExpense(phone, expense(randomUUID(), { amount: 1000 + i }), ctx(A_ID));
      tablet = putExpense(
        tablet,
        expense(randomUUID(), { amount: 2000 + i, payerId: C_ID }),
        ctx(C_ID),
      );
    }
    const all = [...missing(base, phone), ...missing(base, tablet)];
    const shuffled = [...all].reverse();
    const once = Automerge.applyChanges(Automerge.clone(base), all)[0];
    const reversedTwice = Automerge.applyChanges(Automerge.clone(base), [
      ...shuffled,
      ...shuffled,
    ])[0];
    const oneByOne = shuffled.reduce(
      (doc, c) => Automerge.applyChanges(doc, [c])[0],
      Automerge.clone(base),
    );
    for (const doc of [reversedTwice, oneByOne]) {
      expect(Automerge.getHeads(doc)).toEqual(Automerge.getHeads(once));
      expect(readGroupDoc(doc)).toEqual(readGroupDoc(once));
    }
    expect(readGroupDoc(once).expenses).toHaveLength(10);
  });
});

describe('settlements and members across devices', () => {
  it('settles debts computed from the merged document', () => {
    let { phone, tablet } = setupGroup();
    phone = putExpense(phone, expense(randomUUID()), ctx(A_ID));
    [phone, tablet] = exchange(phone, tablet);
    const transfers = simplifyDebts(balancesOf(tablet));
    for (const t of transfers) {
      tablet = addSettlement(
        tablet,
        {
          id: randomUUID(),
          fromMemberId: t.from,
          toMemberId: t.to,
          amount: t.amount,
          paidOn: '2026-09-30',
        },
        ctx(B_ID),
      );
    }
    [phone, tablet] = exchange(phone, tablet);
    expect([...balancesOf(phone).values()]).toEqual([0, 0, 0]);
  });

  it('refuses to remove a member an expense still uses', () => {
    let { phone } = setupGroup();
    phone = putExpense(phone, expense(randomUUID()), ctx(A_ID));
    expect(() => removeMember(phone, C_ID, ctx(A_ID))).toThrow(
      expect.objectContaining({ code: 'memberInUse' }),
    );
  });

  it('logs every change in the shared activity feed', () => {
    let { phone, tablet } = setupGroup();
    const id = randomUUID();
    phone = putExpense(phone, expense(id), ctx(A_ID));
    tablet = addMember(tablet, { id: randomUUID(), name: 'Deniz', avatarColor: '#4' }, ctx(B_ID));
    [phone, tablet] = exchange(phone, tablet);
    const types = readGroupDoc(tablet).activity.map((a) => a.type);
    expect(types.filter((t) => t === 'member_added')).toHaveLength(4);
    expect(types).toContain('expense_created');
    expect(readGroupDoc(tablet).activity.find((a) => a.entityId === id).actorMemberId).toBe(A_ID);
  });
});
