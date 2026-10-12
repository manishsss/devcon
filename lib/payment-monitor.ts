export function monitorError(error:any){const message=String(error?.message||'');return /limit/i.test(message)?'RATE_LIMITED':/UNIQUE/i.test(message)?'DUPLICATE_PAYMENT':/wallet|amount|transfer|encode|token contract/i.test(message)?'PAYMENT_MISMATCH':'VERIFICATION_UNAVAILABLE';}
export async function runPaymentMonitor(database:any,verify:(body:any)=>Promise<any>,now=Date.now()){
  const {results}=await database.prepare(`SELECT sp.id,sp.secret,p.id AS payment_id,p.transaction_hash AS tx,p.verification_attempts
    FROM sponsorships sp JOIN payments p ON p.sponsorship_id=sp.id
    WHERE (p.status IN ('PENDING','EXPIRED','PAYMENT_DETECTED','CONFIRMING')
      OR (p.status='CANCELLED' AND json_extract(p.verification_config,'$.paymentMode')='qr'))
      AND (p.verification_next_at IS NULL OR p.verification_next_at<=?)
    ORDER BY COALESCE(p.verification_checked_at,0),sp.created_at LIMIT 8`).bind(now).all();
  let succeeded=0,failed=0;
  for(const row of results){try{await verify({id:row.id,secret:row.secret,tx:row.tx});await database.prepare('UPDATE payments SET verification_error=NULL,verification_checked_at=?,verification_next_at=?,verification_attempts=0 WHERE id=?').bind(now,now+30000,row.payment_id).run();succeeded++;}
    catch(error){const attempts=Math.min(Number(row.verification_attempts||0)+1,10),code=monitorError(error);await database.prepare('UPDATE payments SET verification_error=?,verification_checked_at=?,verification_next_at=?,verification_attempts=? WHERE id=?').bind(code,now,now+Math.min(600000,30000*2**attempts),attempts,row.payment_id).run();console.error('Payment monitor failed',code);failed++;}}
  return {processed:results.length,succeeded,failed};
}
export function maintenanceAuthorized(request:Request,secret?:string){if(!secret||secret.length<32)return false;const actual=request.headers.get('authorization')||'',expected='Bearer '+secret;if(actual.length!==expected.length)return false;let difference=0;for(let i=0;i<expected.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);return difference===0;}
