import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const GROUP_TYPES = ['home', 'trip', 'couple', 'other'];
export const SPLIT_TYPES = ['equal', 'amount', 'percent', 'shares'];

export const ACTIVITY_TYPES = [
  'group_created',
  'group_updated',
  'group_deleted',
  'member_added',
  'member_updated',
  'member_removed',
  'expense_created',
  'expense_updated',
  'expense_deleted',
  'expense_restored',
  'settlement_created',
  'settlement_deleted',
  'settlement_restored',
];

const inList = (column, values) =>
  sql.raw(`${column} IN (${values.map((value) => `'${value}'`).join(', ')})`);

// Every synced row carries the same bookkeeping columns. Deletes only set deleted_at so the
// change can be replicated later; rows are never removed physically.
const syncColumns = () => ({
  id: text('id').primaryKey().notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const users = sqliteTable('users', {
  ...syncColumns(),
  name: text('name').notNull(),
  avatarColor: text('avatar_color').notNull(),
  avatarPath: text('avatar_path'),
  defaultCurrency: text('default_currency').notNull(),
});

export const groups = sqliteTable(
  'groups',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    currency: text('currency').notNull(),
    icon: text('icon').notNull(),
    archivedAt: integer('archived_at'),
  },
  (t) => [
    check('groups_type_check', inList('type', GROUP_TYPES)),
    index('groups_list_idx').on(t.deletedAt, t.updatedAt),
  ],
);

export const members = sqliteTable(
  'members',
  {
    ...syncColumns(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id),
    name: text('name').notNull(),
    avatarColor: text('avatar_color').notNull(),
    avatarPath: text('avatar_path'),
    isLocalUser: integer('is_local_user', { mode: 'boolean' }).notNull().default(false),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('members_group_idx').on(t.groupId, t.position)],
);

export const expenses = sqliteTable(
  'expenses',
  {
    ...syncColumns(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id),
    description: text('description').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    category: text('category').notNull(),
    payerId: text('payer_id')
      .notNull()
      .references(() => members.id),
    spentOn: text('spent_on').notNull(),
    note: text('note'),
    receiptPath: text('receipt_path'),
  },
  (t) => [
    check('expenses_amount_check', sql`${t.amount} > 0`),
    index('expenses_group_idx').on(t.groupId, t.deletedAt, t.spentOn),
  ],
);

export const expenseShares = sqliteTable(
  'expense_shares',
  {
    ...syncColumns(),
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    amount: integer('amount').notNull(),
    splitType: text('split_type').notNull(),
    weight: integer('weight'),
  },
  (t) => [
    check('expense_shares_amount_check', sql`${t.amount} >= 0`),
    check('expense_shares_split_type_check', inList('split_type', SPLIT_TYPES)),
    uniqueIndex('expense_shares_expense_member_idx').on(t.expenseId, t.memberId),
    index('expense_shares_member_idx').on(t.memberId),
  ],
);

export const settlements = sqliteTable(
  'settlements',
  {
    ...syncColumns(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id),
    fromMemberId: text('from_member_id')
      .notNull()
      .references(() => members.id),
    toMemberId: text('to_member_id')
      .notNull()
      .references(() => members.id),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    paidOn: text('paid_on').notNull(),
    note: text('note'),
  },
  (t) => [
    check('settlements_amount_check', sql`${t.amount} > 0`),
    check('settlements_members_check', sql`${t.fromMemberId} <> ${t.toMemberId}`),
    index('settlements_group_idx').on(t.groupId, t.deletedAt, t.paidOn),
  ],
);

export const activityLog = sqliteTable(
  'activity_log',
  {
    ...syncColumns(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id),
    type: text('type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    payload: text('payload', { mode: 'json' }),
    occurredAt: integer('occurred_at').notNull(),
  },
  (t) => [
    check('activity_log_type_check', inList('type', ACTIVITY_TYPES)),
    index('activity_log_group_idx').on(t.groupId, t.occurredAt),
    index('activity_log_entity_idx').on(t.entityType, t.entityId),
  ],
);

// Device-local preferences (theme, language, onboarding flag). Never synced, so keyed by name.
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey().notNull(),
  value: text('value'),
  updatedAt: integer('updated_at').notNull(),
});
