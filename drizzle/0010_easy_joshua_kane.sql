ALTER TABLE `payments` ADD `verification_error` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `verification_checked_at` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `verification_next_at` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `verification_attempts` integer DEFAULT 0 NOT NULL;