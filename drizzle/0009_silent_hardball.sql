CREATE UNIQUE INDEX `payments_sponsorship_unique` ON `payments` (`sponsorship_id`);--> statement-breakpoint
CREATE TRIGGER sponsorship_parent_insert BEFORE INSERT ON sponsorships WHEN NEW.slot_number NOT BETWEEN 1 AND 8 OR NOT EXISTS(SELECT 1 FROM sponsors WHERE id=NEW.sponsor_id) BEGIN SELECT RAISE(ABORT,'invalid sponsorship parent'); END;
--> statement-breakpoint
CREATE TRIGGER payment_parent_insert BEFORE INSERT ON payments WHEN NOT EXISTS(SELECT 1 FROM sponsorships WHERE id=NEW.sponsorship_id AND sponsor_id=NEW.sponsor_id AND slot_number=NEW.slot_id) BEGIN SELECT RAISE(ABORT,'invalid payment parent'); END;
--> statement-breakpoint
CREATE TRIGGER slot_holder_update BEFORE UPDATE OF holder_sponsorship_id ON slots WHEN NEW.holder_sponsorship_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sponsorships WHERE id=NEW.holder_sponsorship_id AND slot_number=NEW.id) BEGIN SELECT RAISE(ABORT,'holder belongs to different slot'); END;
--> statement-breakpoint
CREATE TRIGGER payment_terms_immutable BEFORE UPDATE ON payments WHEN NEW.sponsor_id!=OLD.sponsor_id OR NEW.sponsorship_id!=OLD.sponsorship_id OR NEW.wallet_address!=OLD.wallet_address OR NEW.chain_id!=OLD.chain_id OR NEW.token_contract!=OLD.token_contract OR NEW.amount_units IS NOT OLD.amount_units OR NEW.amount!=OLD.amount OR NEW.token!=OLD.token OR NEW.slot_id IS NOT OLD.slot_id BEGIN SELECT RAISE(ABORT,'payment terms are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER sponsorship_terms_immutable BEFORE UPDATE ON sponsorships WHEN NEW.slot_number!=OLD.slot_number OR NEW.sponsor_id!=OLD.sponsor_id OR NEW.claim_price_units IS NOT OLD.claim_price_units OR NEW.previous_holder_sponsorship_id IS NOT OLD.previous_holder_sponsorship_id BEGIN SELECT RAISE(ABORT,'sponsorship terms are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER payment_history_delete BEFORE DELETE ON payments WHEN OLD.status!='PENDING' OR OLD.transaction_hash IS NOT NULL BEGIN SELECT RAISE(ABORT,'payment history cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER sponsorship_history_delete BEFORE DELETE ON sponsorships WHEN EXISTS(SELECT 1 FROM payments WHERE sponsorship_id=OLD.id) OR EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=OLD.id OR order_id=OLD.id) BEGIN SELECT RAISE(ABORT,'referenced sponsorship cannot be deleted'); END;
