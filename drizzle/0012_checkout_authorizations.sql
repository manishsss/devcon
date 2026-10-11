CREATE TABLE `checkout_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_address` text NOT NULL,
	`intent_hash` text NOT NULL,
	`message` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_checkout_authorizations_expiry` ON `checkout_authorizations` (`expires_at`);
