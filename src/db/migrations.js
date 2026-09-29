export const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );

      CREATE TABLE groups (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('home', 'trip', 'couple', 'other')),
        currency TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        archived_at INTEGER
      );

      CREATE TABLE members (
        id TEXT PRIMARY KEY NOT NULL,
        group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        is_self INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        removed_at INTEGER
      );
      CREATE INDEX idx_members_group ON members (group_id, position);

      CREATE TABLE expenses (
        id TEXT PRIMARY KEY NOT NULL,
        group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        category TEXT NOT NULL,
        payer_id TEXT NOT NULL REFERENCES members (id),
        split_type TEXT NOT NULL CHECK (split_type IN ('equal', 'amount', 'percent', 'shares')),
        spent_on TEXT NOT NULL,
        note TEXT,
        receipt_uri TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE INDEX idx_expenses_group ON expenses (group_id, deleted_at, spent_on);

      CREATE TABLE expense_shares (
        expense_id TEXT NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES members (id),
        amount INTEGER NOT NULL CHECK (amount >= 0),
        weight INTEGER,
        PRIMARY KEY (expense_id, member_id)
      );
      CREATE INDEX idx_shares_member ON expense_shares (member_id);

      CREATE TABLE settlements (
        id TEXT PRIMARY KEY NOT NULL,
        group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
        from_member_id TEXT NOT NULL REFERENCES members (id),
        to_member_id TEXT NOT NULL REFERENCES members (id),
        amount INTEGER NOT NULL CHECK (amount > 0),
        paid_on TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        deleted_at INTEGER,
        CHECK (from_member_id <> to_member_id)
      );
      CREATE INDEX idx_settlements_group ON settlements (group_id, deleted_at);
    `,
  },
];

export const LATEST_VERSION = migrations[migrations.length - 1].version;
