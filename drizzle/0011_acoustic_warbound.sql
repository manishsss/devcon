CREATE TABLE `verification_guards` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `payments` ADD `verification_lock_until` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `reconciliation_status` text;