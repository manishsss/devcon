CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`sponsor_id` text NOT NULL,
	`sponsorship_id` text NOT NULL,
	`wallet_address` text NOT NULL,
	`token` text NOT NULL,
	`token_contract` text NOT NULL,
	`chain` text NOT NULL,
	`chain_id` integer NOT NULL,
	`amount` text NOT NULL,
	`amount_usd` integer NOT NULL,
	`transaction_hash` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`confirmations` integer DEFAULT 0 NOT NULL,
	`verification_config` text NOT NULL,
	`created_at` integer NOT NULL,
	`confirmed_at` integer,
	`refund_note` text
);
--> statement-breakpoint
CREATE INDEX `idx_payments_sponsorship` ON `payments` (`sponsorship_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_transaction_hash_unique` ON `payments` (`transaction_hash`);--> statement-breakpoint
CREATE TABLE `sponsors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_name` text NOT NULL,
	`x_handle` text NOT NULL,
	`website` text,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`wallet_address` text NOT NULL,
	`logo_url` text NOT NULL,
	`logo_status` text DEFAULT 'PENDING_REVIEW' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sponsors_wallet` ON `sponsors` (`wallet_address`);--> statement-breakpoint
CREATE TABLE `sponsorships` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`slot_number` integer NOT NULL,
	`position` text NOT NULL,
	`price_usd` integer NOT NULL,
	`status` text DEFAULT 'RESERVED' NOT NULL,
	`sponsor_id` text NOT NULL,
	`reserved_until` integer NOT NULL,
	`terms_accepted` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sponsorships_slot_status` ON `sponsorships` (`slot_number`,`status`);--> statement-breakpoint
CREATE INDEX `idx_sponsorships_sponsor` ON `sponsorships` (`sponsor_id`);