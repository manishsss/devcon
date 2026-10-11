import { db } from './campaign';

export async function cancelCheckout(body: {id?:string;secret?:string}) {
  const id=String(body.id||''),secret=String(body.secret||'');
  const database=db(),now=Date.now();
  const owned=await database.prepare('SELECT id FROM sponsorships WHERE id=? AND secret=?').bind(id,secret).first();
  if(!owned)throw new Error('Reservation unavailable.');
  // Atomic compare-and-set: never release a known payment or another checkout.
  const results=await database.batch([
    database.prepare(`UPDATE payments SET status='CANCELLED' WHERE sponsorship_id=? AND status IN ('PENDING','EXPIRED') AND transaction_hash IS NULL
      AND EXISTS(SELECT 1 FROM sponsorships WHERE id=? AND secret=? AND status IN ('RESERVED','EXPIRED'))`).bind(id,id,secret),
    database.prepare(`UPDATE sponsorships SET status='CANCELLED',reserved_until=MIN(reserved_until,?),updated_at=? WHERE id=? AND changes()=1`).bind(now,now,id),
    database.prepare('UPDATE slots SET order_id=NULL,expires=NULL WHERE order_id=? AND changes()=1').bind(id),
  ]);
  const payment=await database.prepare('SELECT status,transaction_hash FROM payments WHERE sponsorship_id=?').bind(id).first();
  return {released:Boolean(results[0].meta.changes||payment?.status==='CANCELLED'),status:payment?.status};
}
