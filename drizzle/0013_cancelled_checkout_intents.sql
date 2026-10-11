-- Cancelled checkouts retain history but must not lock the payer's next intent.
DROP INDEX `payments_unresolved_intent_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_unresolved_intent_unique` ON `payments` (lower("wallet_address"),`chain_id`,lower("token_contract"),`amount_units`) WHERE "payments"."status" NOT IN ('CONFIRMED','LATE_CONFIRMED','FAILED','CANCELLED');
