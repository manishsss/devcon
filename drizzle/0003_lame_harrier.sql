CREATE TABLE `auction_campaign` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'UPCOMING' NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`duration_seconds` integer DEFAULT 345600 NOT NULL,
	`target_units` text DEFAULT '2200000000' NOT NULL,
	`threshold_units` text DEFAULT '1100000000' NOT NULL,
	`final_value_units` text,
	`final_holder_count` integer,
	`finalized_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`sponsor_id` text NOT NULL,
	`sponsorship_id` text NOT NULL,
	`payment_id` text,
	`type` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_status` ON `notifications` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_type_sponsorship_unique` ON `notifications` (`type`,`sponsorship_id`);--> statement-breakpoint
ALTER TABLE `payments` ADD `amount_units` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `refund_status` text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `refund_amount_units` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `refund_transaction_hash` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `refund_updated_at` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `refund_error` text;--> statement-breakpoint
CREATE INDEX `idx_payments_refund_status` ON `payments` (`refund_status`);--> statement-breakpoint
ALTER TABLE `slots` ADD `current_price_units` text;--> statement-breakpoint
ALTER TABLE `slots` ADD `holder_sponsorship_id` text;--> statement-breakpoint
ALTER TABLE `slots` ADD `claim_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_slots_holder` ON `slots` (`holder_sponsorship_id`);--> statement-breakpoint
ALTER TABLE `sponsorships` ADD `claim_price_units` text;--> statement-breakpoint
ALTER TABLE `sponsorships` ADD `previous_holder_sponsorship_id` text;--> statement-breakpoint
ALTER TABLE `sponsorships` ADD `claim_sequence` integer;--> statement-breakpoint
ALTER TABLE `sponsorships` ADD `is_challenge` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `payments` SET `amount_units`=CAST(CAST(`amount` AS REAL)*1000000 AS INTEGER) WHERE `amount_units` IS NULL;--> statement-breakpoint
UPDATE `sponsorships` SET `claim_price_units`=CAST(`price_usd`*1000000 AS TEXT) WHERE `claim_price_units` IS NULL;--> statement-breakpoint
UPDATE `slots` SET
  `holder_sponsorship_id`=`order_id`,
  `current_price_units`=CAST(`price`*1000000 AS TEXT),
  `claim_count`=1
WHERE `order_id` IN (
  SELECT sp.`id` FROM `sponsorships` sp
  JOIN `payments` p ON p.`sponsorship_id`=sp.`id`
  WHERE sp.`status`='SOLD' AND p.`status`='CONFIRMED'
);--> statement-breakpoint
UPDATE `sponsorships` SET `status`='CURRENT_HOLDER',`claim_sequence`=1
WHERE `id` IN (SELECT `holder_sponsorship_id` FROM `slots` WHERE `holder_sponsorship_id` IS NOT NULL);--> statement-breakpoint
UPDATE `slots` SET `order_id`=NULL,`expires`=NULL WHERE `holder_sponsorship_id` IS NOT NULL;
