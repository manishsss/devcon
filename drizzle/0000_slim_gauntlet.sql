CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`slot` integer NOT NULL,
	`price` integer NOT NULL,
	`project` text NOT NULL,
	`contact` text NOT NULL,
	`x` text NOT NULL,
	`email` text NOT NULL,
	`website` text NOT NULL,
	`wallet` text NOT NULL,
	`logo` text,
	`approved` integer DEFAULT 0 NOT NULL,
	`review` text DEFAULT 'Pending review' NOT NULL,
	`status` text DEFAULT 'Awaiting payment' NOT NULL,
	`tx` text,
	`config` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`audit` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_tx_unique` ON `orders` (`tx`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slots` (
	`id` integer PRIMARY KEY NOT NULL,
	`price` integer NOT NULL,
	`disabled` integer DEFAULT 0 NOT NULL,
	`order_id` text,
	`expires` integer
);
