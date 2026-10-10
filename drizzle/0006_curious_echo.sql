PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auction_campaign` (
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
INSERT INTO `__new_auction_campaign`("id", "status", "starts_at", "ends_at", "duration_seconds", "target_units", "threshold_units", "final_value_units", "final_holder_count", "finalized_at", "created_at") SELECT "id", "status", "starts_at", "ends_at", "duration_seconds", "target_units", "threshold_units", "final_value_units", "final_holder_count", "finalized_at", "created_at" FROM `auction_campaign`;--> statement-breakpoint
DROP TABLE `auction_campaign`;--> statement-breakpoint
ALTER TABLE `__new_auction_campaign` RENAME TO `auction_campaign`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
UPDATE auction_campaign SET threshold_units = '1100000000' WHERE status IN ('UPCOMING','LIVE') AND finalized_at IS NULL;
