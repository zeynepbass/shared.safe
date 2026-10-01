CREATE TABLE `group_doc_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` text NOT NULL,
	`data` blob NOT NULL
);
--> statement-breakpoint
CREATE INDEX `group_doc_changes_group_idx` ON `group_doc_changes` (`group_id`,`id`);--> statement-breakpoint
CREATE TABLE `group_docs` (
	`group_id` text PRIMARY KEY NOT NULL,
	`snapshot` blob NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_groups` (
	`group_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`local_member_id` text,
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` text NOT NULL,
	`change_hash` text NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_outbox_change_idx` ON `sync_outbox` (`group_id`,`change_hash`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `has_conflict` integer DEFAULT false NOT NULL;