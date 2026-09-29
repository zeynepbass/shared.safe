CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`group_id` text NOT NULL,
	`type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "activity_log_type_check" CHECK(type IN ('group_created', 'group_updated', 'group_deleted', 'member_added', 'member_updated', 'member_removed', 'expense_created', 'expense_updated', 'expense_deleted', 'expense_restored', 'settlement_created', 'settlement_deleted', 'settlement_restored'))
);
--> statement-breakpoint
CREATE INDEX `activity_log_group_idx` ON `activity_log` (`group_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_log_entity_idx` ON `activity_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `expense_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`expense_id` text NOT NULL,
	`member_id` text NOT NULL,
	`amount` integer NOT NULL,
	`split_type` text NOT NULL,
	`weight` integer,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expense_shares_amount_check" CHECK("expense_shares"."amount" >= 0),
	CONSTRAINT "expense_shares_split_type_check" CHECK(split_type IN ('equal', 'amount', 'percent', 'shares'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_shares_expense_member_idx` ON `expense_shares` (`expense_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `expense_shares_member_idx` ON `expense_shares` (`member_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`group_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`category` text NOT NULL,
	`payer_id` text NOT NULL,
	`spent_on` text NOT NULL,
	`note` text,
	`receipt_path` text,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payer_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expenses_amount_check" CHECK("expenses"."amount" > 0)
);
--> statement-breakpoint
CREATE INDEX `expenses_group_idx` ON `expenses` (`group_id`,`deleted_at`,`spent_on`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`icon` text NOT NULL,
	`archived_at` integer,
	CONSTRAINT "groups_type_check" CHECK(type IN ('home', 'trip', 'couple', 'other'))
);
--> statement-breakpoint
CREATE INDEX `groups_list_idx` ON `groups` (`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`avatar_color` text NOT NULL,
	`is_local_user` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `members_group_idx` ON `members` (`group_id`,`position`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`group_id` text NOT NULL,
	`from_member_id` text NOT NULL,
	`to_member_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`paid_on` text NOT NULL,
	`note` text,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "settlements_amount_check" CHECK("settlements"."amount" > 0),
	CONSTRAINT "settlements_members_check" CHECK("settlements"."from_member_id" <> "settlements"."to_member_id")
);
--> statement-breakpoint
CREATE INDEX `settlements_group_idx` ON `settlements` (`group_id`,`deleted_at`,`paid_on`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`avatar_color` text NOT NULL,
	`default_currency` text NOT NULL
);
