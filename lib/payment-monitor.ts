export function monitorError(error:any){const message=String(error?.message||'');return /limit/i.test(message)?'RATE_LIMITED':/UNIQUE/i.test(message)?'DUPLICATE_PAYMENT':/RPC|provider|temporarily unavailable|timeout|fetch/i.test(message)?'VERIFICATION_UNAVAILABLE':/wallet|amount|transfer|encode|token contract/i.test(message)?'PAYMENT_MISMATCH':'VERIFICATION_UNAVAILABLE';}
export async function runPaymentMonitor(database:any,verify:(body:any)=>Promise<any>,now=Date.now()){
  const {results}=await database.prepare(`SELECT sp.id,sp.secret,sp.reserved_until,p.id AS payment_id,p.status,p.transaction_hash AS tx,p.verification_attempts
    FROM sponsorships sp JOIN payments p ON p.sponsorship_id=sp.id
    WHERE (p.status IN ('PENDING','EXPIRED','PAYMENT_DETECTED','CONFIRMING') OR (p.status='CANCELLED' AND (p.transaction_hash IS NOT NULL OR p.payment_method='QR')))
    AND (p.verification_next_at IS NULL OR p.verification_next_at<=?)
    AND (p.verification_lock IS NULL OR (p.verification_lock_until IS NOT NULL AND p.verification_lock_until<=?))
    ORDER BY COALESCE(p.verification_checked_at,0),sp.created_at LIMIT 8`).bind(now,now).all();
  let succeeded=0,failed=0,deferred=0,processed=0;
  const started=Date.now();
  for(const row of results){
    if(Date.now()-started>40000)break;
    try{
      const result=await verify({id:row.id,secret:row.secret,tx:row.tx});processed++;
      if(result?.verificationInProgress){deferred++;continue;}
      const retry=result?.status==='PENDING'&&row.reserved_until<now?600000:30000;
      await database.prepare(`UPDATE payments SET verification_error=NULL,verification_checked_at=?,verification_next_at=?,verification_attempts=0
        WHERE id=? AND (verification_checked_at IS NULL OR verification_checked_at<=?)`).bind(now,now+retry,row.payment_id,now).run();succeeded++;
    }catch(error){
      processed++;
      const attempts=Math.min(Number(row.verification_attempts||0)+1,10),code=monitorError(error);
      await database.prepare(`UPDATE payments SET verification_error=?,verification_checked_at=?,verification_next_at=?,verification_attempts=?
        WHERE id=? AND status NOT IN ('CONFIRMED','LATE_CONFIRMED','FAILED')
        AND (verification_checked_at IS NULL OR verification_checked_at<=?)`).bind(code,now,now+Math.min(600000,30000*2**attempts),attempts,row.payment_id,now).run();
      console.error('Payment monitor failed',code);failed++;
    }
  }
  return {processed,succeeded,failed,deferred};
}

export async function runBackgroundMonitor(database:any,verify:(body:any)=>Promise<any>,source:'traffic'|'admin'|'scheduler',now=Date.now()){
  if(source==='scheduler')await database.prepare('UPDATE payment_monitor_state SET last_scheduled_at=? WHERE id=1').bind(now).run();
  const token=crypto.randomUUID();
  const lock=await database.prepare(`UPDATE payment_monitor_state SET lock_token=?,lock_until=?,last_started_at=?,last_source=?
    WHERE id=1 AND (lock_token IS NULL OR lock_until<=?)
    AND (?!='traffic' OR last_finished_at IS NULL OR last_finished_at<=?)`).bind(token,now+150000,now,source,now,source,now-15000).run();
  if(!lock.meta.changes)return {processed:0,succeeded:0,failed:0,deferred:0,skipped:true};
  try{
    const result=await runPaymentMonitor(database,verify,now),finished=Date.now();
    await database.prepare(`UPDATE payment_monitor_state SET last_finished_at=?,last_scheduled_at=CASE WHEN ?='scheduler' THEN ? ELSE last_scheduled_at END,
      processed=?,failed=?,last_error=NULL,lock_token=NULL,lock_until=NULL WHERE id=1 AND lock_token=?`).bind(finished,source,finished,result.processed,result.failed,token).run();
    return {...result,skipped:false};
  }catch{
    await database.prepare("UPDATE payment_monitor_state SET last_error='MONITOR_FAILED',lock_token=NULL,lock_until=NULL WHERE id=1 AND lock_token=?").bind(token).run();
    console.error('Payment monitor run failed');throw new Error('Payment monitor failed. The recorded payment states have not been bypassed.');
  }
}

export async function monitoringHealth(database:any,now=Date.now()){
  const state:any=await database.prepare(`SELECT last_started_at,last_finished_at,last_scheduled_at,last_source,processed,failed,last_error FROM payment_monitor_state WHERE id=1`).first();
  const backlog:any=await database.prepare(`SELECT COUNT(*) AS unresolved,COALESCE(SUM(CASE WHEN verification_error IS NOT NULL THEN 1 ELSE 0 END),0) AS verification_failures,
    MIN(COALESCE(verification_checked_at,created_at)) AS oldest_check,
    COALESCE(SUM(CASE WHEN verification_lock IS NOT NULL AND verification_lock_until IS NULL THEN 1 ELSE 0 END),0) AS legacy_locks FROM payments
    WHERE status IN ('PENDING','EXPIRED','PAYMENT_DETECTED','CONFIRMING') OR (status='CANCELLED' AND (transaction_hash IS NOT NULL OR payment_method='QR'))`).first();
  return {state,backlog,schedulerStale:!state?.last_scheduled_at||now-state.last_scheduled_at>180000};
}
export function maintenanceAuthorized(request:Request,secret?:string){if(!secret||secret.length<32)return false;const actual=request.headers.get('authorization')||'',expected='Bearer '+secret;if(actual.length!==expected.length)return false;let difference=0;for(let i=0;i<expected.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);return difference===0;}
