import { db } from './campaign';

// D1 executes this batch as one transaction. Never send funds from this action.
export async function queueSponsorCancellation(paymentId: string, reason: string, now = Date.now()) {
  if (!paymentId || !reason.trim() || reason.length > 1000) throw new Error('Provide a payment and a cancellation reason.');
  const database = db();
  const results = await database.batch([
    database.prepare(`UPDATE payments SET refund_status='REFUND_PENDING',refund_amount_units=amount_units,refund_eligible_at=?,refund_updated_at=?,refund_note=?
      WHERE id=? AND status='CONFIRMED' AND refund_status='NONE'
      AND sponsorship_id IN (SELECT holder_sponsorship_id FROM slots WHERE order_id IS NULL)
      AND EXISTS (SELECT 1 FROM auction_campaign WHERE id=1 AND status='LIVE')`).bind(now,now,reason.trim(),paymentId),
    database.prepare(`UPDATE sponsorships SET status='REFUND_PENDING',updated_at=? WHERE id IN
      (SELECT sponsorship_id FROM payments WHERE id=? AND refund_status='REFUND_PENDING') AND changes()=1`).bind(now,paymentId),
    database.prepare(`UPDATE sponsors SET logo_status='REJECTED' WHERE id IN
      (SELECT sponsor_id FROM payments WHERE id=? AND refund_status='REFUND_PENDING') AND changes()=1`).bind(paymentId),
    database.prepare(`UPDATE slots SET holder_sponsorship_id=NULL,current_price_units=NULL WHERE order_id IS NULL
      AND holder_sponsorship_id IN (SELECT sponsorship_id FROM payments WHERE id=? AND refund_status='REFUND_PENDING') AND changes()=1`).bind(paymentId),
  ]);
  if (!results[0].meta.changes) {
    const payment: {refund_status:string} | null = await database.prepare('SELECT refund_status FROM payments WHERE id=?').bind(paymentId).first();
    if (!payment || payment.refund_status==='NONE') throw new Error('Only a confirmed current holder without an active checkout can be cancelled during the live campaign.');
  }
  return {ok:true};
}
