import { importGroupDoc } from '../src/groupDoc.js';
import { readGroupDoc } from '../src/readGroupDoc.js';

const group = {
  id: 'g1',
  name: 'Ev',
  type: 'home',
  currency: 'TRY',
  icon: 'home',
  createdAt: 1,
  updatedAt: 5,
};
const members = [
  {
    id: 'm1',
    name: 'Ayşe',
    avatarColor: '#1',
    position: 0,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  },
  {
    id: 'm2',
    name: 'Berk',
    avatarColor: '#2',
    position: 1,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  },
];
const expenses = [
  {
    id: 'e1',
    description: 'Market',
    amount: 100,
    currency: 'TRY',
    category: 'market',
    payerId: 'm1',
    spentOn: '2026-09-01',
    note: undefined,
    splitType: 'equal',
    shares: [
      { memberId: 'm1', amount: 50, weight: null },
      { memberId: 'm2', amount: 50, weight: null },
    ],
    createdAt: 2,
    updatedAt: 2,
    deletedAt: null,
  },
];
const activity = [
  {
    id: 'a1',
    type: 'group_created',
    entityType: 'group',
    entityId: 'g1',
    payload: { name: 'Ev' },
    occurredAt: 1,
  },
];

describe('importGroupDoc', () => {
  it('keeps every record, id and timestamp', () => {
    const doc = importGroupDoc(
      { group, members, expenses, settlements: [], activity },
      { now: 10 },
    );
    const view = readGroupDoc(doc);
    expect(view.group).toMatchObject({ id: 'g1', updatedAt: 5, deletedAt: null });
    expect(view.members.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(view.expenses[0]).toMatchObject({
      id: 'e1',
      note: null,
      hasConflict: false,
      createdAt: 2,
    });
    expect(view.activity[0]).toMatchObject({ id: 'a1', actorMemberId: null, occurredAt: 1 });
  });
});
