CREATE TABLE `receipt_uploads` (
	`receipt_id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`path` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `receipt_id` text;