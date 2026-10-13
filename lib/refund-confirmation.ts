/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, dispatchNotification } from './campaign';
import { verifyRefund } from './payment';
import { refundConfirmedEmail } from './sponsor-email';

// Retain the verified path for callers that require independent chain evidence.
export async function recordVerifiedRefund(payment:any,hash:string,note:string){
  await verifyRefund(payment,hash);
  return recordRefund(payment,hash,note,false);
}

// The protected admin route accepts the owner's manual confirmation. This never
// sends funds and explicitly records that an RPC verification was not performed.
export async function recordManualRefund(payment:any,hash:string,note:string){
  if(!/^0x[0-9a-f]{64}$/i.test(hash))throw new Error('Enter a valid refund transaction hash.');
  return recordRefund(payment,hash.toLowerCase(),note,true);
}

async function recordRefund(payment:any,hash:string,note:string,manual:boolean){
  const sponsor:any=await db().prepare(`SELECT s.project_name,s.email,sp.slot_number
    FROM sponsors s JOIN sponsorships sp ON sp.sponsor_id=s.id WHERE sp.id=?`).bind(payment.sponsorship_id).first();
  if(!sponsor)throw new Error('Refund sponsor unavailable.');
  const id=`refund-confirmed:${payment.id}`;
  const copy=refundConfirmedEmail({project:sponsor.project_name,slot:sponsor.slot_number,
    amountUnits:payment.refund_amount_units||payment.amount_units,network:payment.chain,
    wallet:payment.wallet_address,transactionUrl:JSON.parse(payment.verification_config).explorer+hash,manual});
  const now=Date.now();
  const recordedNote=manual?`Manually confirmed by administrator; no automated on-chain verification.${note?' '+note:''}`:note;
  await db().batch([
    db().prepare(`UPDATE payments SET refund_status='REFUNDED',refund_transaction_hash=?,refund_note=?,refund_error=NULL,refund_updated_at=?
      WHERE id=? AND status IN ('CONFIRMED','LATE_CONFIRMED') AND refund_status IN ('REFUND_PENDING','REFUND_PROCESSING','REFUND_FAILED')`).bind(hash,recordedNote||null,now,payment.id),
    db().prepare("UPDATE sponsorships SET status=CASE WHEN status='REFUND_PENDING' THEN 'REFUNDED' ELSE status END,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM payments WHERE id=? AND refund_status='REFUNDED')").bind(now,payment.sponsorship_id,payment.id),
    db().prepare(`INSERT OR IGNORE INTO notifications
      (id,sponsor_id,sponsorship_id,payment_id,type,recipient,subject,body,status,created_at)
      SELECT ?,?,?,?,'REFUND_CONFIRMED',?,?,?,'PENDING',?
      WHERE EXISTS(SELECT 1 FROM payments WHERE id=? AND refund_status='REFUNDED' AND refund_transaction_hash=?)`)
      .bind(id,payment.sponsor_id,payment.sponsorship_id,payment.id,sponsor.email,copy.subject,copy.body,now,payment.id,hash),
  ]);
  const recorded:any=await db().prepare('SELECT refund_status,refund_transaction_hash FROM payments WHERE id=?').bind(payment.id).first();
  if(recorded?.refund_status!=='REFUNDED'||recorded.refund_transaction_hash!==hash)throw new Error('Refund was not recorded: the payment is not eligible or already has a different completed refund.');
  try{await dispatchNotification(id);}catch{console.error('Refund confirmation email remains queued for admin retry.');}
}
