CREATE TABLE `payment_monitor_state` (
  `id` integer PRIMARY KEY NOT NULL,
  `last_started_at` integer,
  `last_finished_at` integer,
  `last_scheduled_at` integer,
  `last_source` text,
  `processed` integer NOT NULL DEFAULT 0,
  `failed` integer NOT NULL DEFAULT 0,
  `last_error` text,
  `lock_token` text,
  `lock_until` integer
);
--> statement-breakpoint
INSERT INTO `payment_monitor_state` (`id`) VALUES (1);
