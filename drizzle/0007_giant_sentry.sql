CREATE TABLE `reservation_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`message` text NOT NULL,
	`digest` text NOT NULL,
	`amount_units` text NOT NULL,
	`expires` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `payments` ADD `verification_lock` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `refund_eligible_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_unresolved_intent_unique` ON `payments` (lower("wallet_address"),`chain_id`,lower("token_contract"),`amount_units`) WHERE "payments"."status" NOT IN ('CONFIRMED','LATE_CONFIRMED','FAILED');