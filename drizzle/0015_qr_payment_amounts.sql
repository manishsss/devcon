ALTER TABLE payments ADD payment_method text NOT NULL DEFAULT 'WALLET' CHECK(payment_method IN ('WALLET','QR'));
--> statement-breakpoint
CREATE TABLE qr_payment_amounts (
 chain_id integer NOT NULL, token_contract text NOT NULL, treasury text NOT NULL,
 amount_units text NOT NULL, reservation_id text NOT NULL UNIQUE, allocated_at integer NOT NULL,
 PRIMARY KEY(chain_id,token_contract,treasury,amount_units)
);
--> statement-breakpoint
CREATE TRIGGER qr_amount_no_update BEFORE UPDATE ON qr_payment_amounts BEGIN SELECT RAISE(ABORT,'QR amounts cannot be reused'); END;
--> statement-breakpoint
CREATE TRIGGER qr_amount_no_delete BEFORE DELETE ON qr_payment_amounts BEGIN SELECT RAISE(ABORT,'QR amounts cannot be reused'); END;
--> statement-breakpoint
CREATE TRIGGER payment_method_immutable BEFORE UPDATE OF payment_method ON payments WHEN NEW.payment_method!=OLD.payment_method BEGIN SELECT RAISE(ABORT,'payment method is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER qr_payment_binding BEFORE INSERT ON payments WHEN NEW.payment_method='QR' AND NOT EXISTS(
 SELECT 1 FROM qr_payment_amounts q JOIN sponsorships sp ON sp.id=q.reservation_id
 WHERE q.reservation_id=NEW.sponsorship_id AND q.chain_id=NEW.chain_id AND q.token_contract=lower(NEW.token_contract)
 AND q.amount_units=NEW.amount_units AND CAST(q.amount_units AS INTEGER)<CAST(sp.claim_price_units AS INTEGER)
 AND CAST(q.amount_units AS INTEGER)>0 AND CAST(q.amount_units AS INTEGER)%1000=0
) BEGIN SELECT RAISE(ABORT,'invalid QR payment binding'); END;
