/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, dispatchNotification } from './campaign';
import { verifyRefund } from './payment';
import { refundConfirmedEmail } from './sponsor-email';

// Invoked only by the existing protected admin refund route. This records a
// manually sent refund; it never sends funds or bypasses on-chain verification.
export async function recordVerifiedRefund(payment:any,hash:string,note:string){
  await verifyRefund(payment,hash);
  const sponsor:any=await db().prepare(`SELECT s.project_name,s.email,sp.slot_number
    FROM sponsors s JOIN sponsorships sp ON sp.sponsor_id=s.id WHERE sp.id=?`).bind(payment.sponsorship_id).first();
  if(!sponsor)throw new Error('Refund sponsor unavailable.');
  const id=`refund-confirmed:${payment.id}`;
  const copy=refundConfirmedEmail({project:sponsor.project_name,slot:sponsor.slot_number,
    amountUnits:payment.refund_amount_units||payment.amount_units,network:payment.chain,
    wallet:payment.wallet_address,transactionUrl:JSON.parse(payment.verification_config).explorer+hash});
  const now=Date.now();
  await db().batch([
    db().prepare(`UPDATE payments SET refund_status='REFUNDED',refund_transaction_hash=?,refund_note=?,refund_error=NULL,refund_updated_at=?
      WHERE id=? AND refund_status!='REFUNDED'`).bind(hash,note||null,now,payment.id),
    db().prepare("UPDATE sponsorships SET status=CASE WHEN status='REFUND_PENDING' THEN 'REFUNDED' ELSE status END,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM payments WHERE id=? AND refund_status='REFUNDED')").bind(now,payment.sponsorship_id,payment.id),
    db().prepare(`INSERT OR IGNORE INTO notifications
      (id,sponsor_id,sponsorship_id,payment_id,type,recipient,subject,body,status,created_at)
      SELECT ?,?,?,?,'REFUND_CONFIRMED',?,?,?,'PENDING',?
      WHERE EXISTS(SELECT 1 FROM payments WHERE id=? AND refund_status='REFUNDED' AND refund_transaction_hash=?)`)
      .bind(id,payment.sponsor_id,payment.sponsorship_id,payment.id,sponsor.email,copy.subject,copy.body,now,payment.id,hash),
  ]);
  try{await dispatchNotification(id);}catch{console.error('Refund confirmation email remains queued for admin retry.');}
}
