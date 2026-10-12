-- Permanent amount tombstones. Never release an amount after cancellation/expiry.
CREATE TABLE `qr_payment_amounts` (
  `id` text PRIMARY KEY NOT NULL,
  `chain_id` integer NOT NULL,
  `token_contract` text NOT NULL,
  `treasury` text NOT NULL,
  `amount_units` text NOT NULL,
  `base_units` text NOT NULL,
  `client_key` text NOT NULL,
  `reserved_until` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qr_amount_network_unique` ON `qr_payment_amounts` (`chain_id`,`token_contract`,`treasury`,`amount_units`);
--> statement-breakpoint
CREATE INDEX `qr_client_lease` ON `qr_payment_amounts` (`client_key`,`reserved_until`);
--> statement-breakpoint
CREATE TRIGGER qr_amounts_no_delete BEFORE DELETE ON qr_payment_amounts BEGIN SELECT RAISE(ABORT,'QR amount history cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER qr_amounts_no_update BEFORE UPDATE ON qr_payment_amounts BEGIN SELECT RAISE(ABORT,'QR amount history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER qr_amount_payment_owner BEFORE INSERT ON payments
WHEN EXISTS(SELECT 1 FROM qr_payment_amounts q WHERE q.chain_id=NEW.chain_id AND q.token_contract=lower(NEW.token_contract)
  AND q.treasury=lower(json_extract(NEW.verification_config,'$.treasury')) AND q.amount_units=NEW.amount_units AND q.id!=NEW.sponsorship_id)
BEGIN SELECT RAISE(ABORT,'Payment amount belongs to another QR checkout'); END;
