ALTER TABLE `sync_groups` ADD `rekey_pending` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_groups` ADD `removed_at` integer;--> statement-breakpoint
ALTER TABLE `sync_outbox` ADD `sealed` blob;--> statement-breakpoint
ALTER TABLE `sync_outbox` ADD `sealed_epoch` integer;