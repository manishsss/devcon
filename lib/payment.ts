/* eslint-disable @typescript-eslint/no-explicit-any */
import { withVerificationScope, VERIFICATION_LEASE_MS } from './verification-scope';
import { runPaymentMonitor } from './payment-monitor';
import { consumeBudget } from './abuse';
import { db, dispatchNotification, queueNotification, rpc, sendSponsorEmail, settleCampaign } from './campaign';
import { formatUsdcUnits } from './auction';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const addressFromTopic = (topic: string) => `0x${topic.slice(-40)}`;
const displayUnits = (value:string) => {
  const units=BigInt(value);
  return formatUsdcUnits(units,units%BigInt(1_000_000)===BigInt(0)?0:2);
};

async function checkoutRecord(id: string, secret: string) {
  return db().prepare(`SELECT
    sp.id,sp.secret,sp.slot_number,sp.position,sp.price_usd,sp.claim_price_units,sp.previous_holder_sponsorship_id,sp.claim_sequence,sp.status AS sponsorship_status,sp.reserved_until,sp.created_at,
    p.id AS payment_id,p.wallet_address,p.token,p.token_contract,p.chain,p.chain_id,p.amount,p.amount_usd,p.amount_units,p.transaction_hash,p.status AS payment_status,p.confirmations,p.verification_config,p.confirmed_at,p.refund_status,p.refund_amount_units,
    s.id AS sponsor_id,s.project_name,s.email,s.logo_status
    FROM sponsorships sp
    JOIN payments p ON p.sponsorship_id=sp.id
    JOIN sponsors s ON s.id=sp.sponsor_id
    WHERE sp.id=? AND sp.secret=?`).bind(id, secret).first();
}

const resultFor = (row: any, overrides: any = {}) => ({
  status: row.payment_status,
  claimStatus: row.sponsorship_status,
  refundStatus: row.refund_status,
  transactionHash: row.transaction_hash,
  project: row.project_name,
  slot: row.slot_number,
  position: row.position,
  price: row.claim_price_units ? displayUnits(row.claim_price_units) : row.amount,
  priceUnits: row.claim_price_units || row.amount_units,
  token: row.token,
  network: row.chain,
  logoStatus: row.logo_status,
  explorerUrl: row.transaction_hash ? JSON.parse(row.verification_config).explorer + row.transaction_hash : null,
  ...overrides,
});

async function releaseFailedPayment(row: any, hash: string, message: string) {
  const failedAt = Date.now();
  await db().batch([
    db().prepare("UPDATE payments SET transaction_hash=?,status='FAILED' WHERE id=? AND status NOT IN ('CONFIRMED','LATE_CONFIRMED','FAILED')").bind(hash, row.payment_id),
    db().prepare("UPDATE sponsorships SET status='PAYMENT_FAILED',updated_at=? WHERE id=? AND status IN ('RESERVED','PAYMENT_PENDING','EXPIRED')").bind(failedAt, row.id),
    db().prepare('UPDATE slots SET order_id=NULL,expires=NULL WHERE id=? AND order_id=?').bind(row.slot_number, row.id),
  ]);
  const final:any=await checkoutRecord(row.id,row.secret);
  return resultFor(final||row, { status: 'FAILED', message });
}

async function markLatePayment(row:any,hash:string,confirmations:number,message:string){
  const confirmedAt=Date.now();
  await db().batch([
    db().prepare(`UPDATE payments SET transaction_hash=?,status='LATE_CONFIRMED',confirmations=?,confirmed_at=?,
      refund_status='REFUND_PENDING',refund_amount_units=amount_units,refund_updated_at=?,refund_eligible_at=COALESCE(refund_eligible_at,?)
      WHERE id=? AND status NOT IN ('CONFIRMED','LATE_CONFIRMED','FAILED')`).bind(hash,confirmations,confirmedAt,confirmedAt,confirmedAt,row.payment_id),
    db().prepare("UPDATE sponsorships SET status='REFUND_PENDING',updated_at=? WHERE id=? AND status!='CURRENT_HOLDER' AND status!='FINAL_HOLDER'").bind(confirmedAt,row.id),
    db().prepare('UPDATE slots SET order_id=NULL,expires=NULL WHERE id=? AND order_id=?').bind(row.slot_number,row.id),
  ]);
  const notificationId=`late-payment:${row.id}`;
  await queueNotification({
    id:notificationId,
    sponsorId:row.sponsor_id,
    sponsorshipId:row.id,
    paymentId:row.payment_id,
    type:'LATE_PAYMENT_REFUND',
    recipient:row.email,
    subject:'Devcon claim payment refund update',
    body:`Your $${displayUnits(row.claim_price_units)} ${row.token} on ${row.chain} payment for Slot ${String(row.slot_number).padStart(2,'0')} was confirmed after the claim window had closed. It did not replace the current holder and is marked REFUND_PENDING. The refund is not complete until an on-chain refund reference is recorded.`,
  });
  await dispatchNotification(notificationId);
  const final:any=await checkoutRecord(row.id,row.secret);
  return resultFor(final||row,{status:'LATE_CONFIRMED',refundStatus:'REFUND_PENDING',message});
}

async function confirmClaim(row:any,hash:string,confirmations:number){
  const confirmedAt=Date.now();
  const slot:any=await db().prepare('SELECT order_id,holder_sponsorship_id,current_price_units,claim_count FROM slots WHERE id=?').bind(row.slot_number).first();
  const expectedPrevious=row.previous_holder_sponsorship_id||null;
  const expectedCurrent=slot?.current_price_units||null;
  const previous:any=expectedPrevious?await db().prepare(`SELECT sp.id,sp.slot_number,sp.claim_price_units,s.id AS sponsor_id,s.project_name,s.email,p.id AS payment_id,p.token,p.chain
    FROM sponsorships sp JOIN sponsors s ON s.id=sp.sponsor_id JOIN payments p ON p.sponsorship_id=sp.id WHERE sp.id=?`).bind(expectedPrevious).first():null;
  const statements:any[]=[
    db().prepare(`UPDATE slots SET holder_sponsorship_id=?,current_price_units=?,claim_count=claim_count+1,order_id=NULL,expires=NULL
      WHERE id=? AND order_id=? AND holder_sponsorship_id IS ? AND current_price_units IS ?
      AND EXISTS(SELECT 1 FROM auction_campaign WHERE id=1 AND status='LIVE' AND ends_at>?)`)
      .bind(row.id,row.claim_price_units,row.slot_number,row.id,expectedPrevious,expectedCurrent,confirmedAt),
    db().prepare(`UPDATE payments SET transaction_hash=?,status='CONFIRMED',confirmations=?,confirmed_at=?
      WHERE id=? AND status NOT IN ('CONFIRMED','LATE_CONFIRMED','FAILED') AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`)
      .bind(hash,confirmations,confirmedAt,row.payment_id,row.id),
    db().prepare(`UPDATE sponsorships SET status='CURRENT_HOLDER',claim_sequence=(SELECT claim_count FROM slots WHERE id=?),updated_at=?
      WHERE id=? AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`)
      .bind(row.slot_number,confirmedAt,row.id,row.id),
    db().prepare(`UPDATE sponsors SET logo_status='APPROVED' WHERE id=? AND logo_status='PENDING_REVIEW'
      AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`).bind(row.sponsor_id,row.id),
  ];
  if(previous){
    const notificationId=`outbid:${previous.id}`;
    const body=`You've been outbid on your Devcon spot.\n\nYour Slot ${String(row.slot_number).padStart(2,'0')} position was claimed by another project for $${displayUnits(row.claim_price_units)} ${row.token} on ${row.chain}.\n\nAmount paid: $${displayUnits(previous.claim_price_units)} ${previous.token} on ${previous.chain}\nNew claim amount: $${displayUnits(row.claim_price_units)} ${row.token} on ${row.chain}\nRefund amount: $${displayUnits(previous.claim_price_units)} ${previous.token} on ${previous.chain}\nRefund status: REFUND_PENDING\n\nYour original payment is eligible for a full refund. The refund is not complete until its on-chain transaction is recorded.`;
    statements.push(
      db().prepare("UPDATE sponsorships SET status='OUTBID',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)").bind(confirmedAt,previous.id,row.id),
      db().prepare(`UPDATE payments SET refund_status='REFUND_PENDING',refund_amount_units=amount_units,refund_updated_at=?,refund_eligible_at=COALESCE(refund_eligible_at,?)
        WHERE sponsorship_id=? AND status='CONFIRMED' AND refund_status='NONE' AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`).bind(confirmedAt,confirmedAt,previous.id,row.id),
      db().prepare(`INSERT OR IGNORE INTO notifications
        (id,sponsor_id,sponsorship_id,payment_id,type,recipient,subject,body,status,created_at)
        SELECT ?,?,?,?,?,?,?,?,'PENDING',? WHERE EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`)
        .bind(notificationId,previous.sponsor_id,previous.id,previous.payment_id,'OUTBID',previous.email,"You've been outbid on your Devcon spot.",body,confirmedAt,row.id),
    );
  }
  await db().batch(statements);
  const final:any=await checkoutRecord(row.id,row.secret);
  const won:any=await db().prepare('SELECT holder_sponsorship_id FROM slots WHERE id=?').bind(row.slot_number).first();
  if(final?.payment_status==='CONFIRMED'&&won?.holder_sponsorship_id!==row.id)return resultFor(final);
  if(final?.payment_status!=='CONFIRMED'){
    return markLatePayment(row,hash,confirmations,'The payment was confirmed, but the claim window had already closed. A full refund is pending.');
  }
  if(previous)await dispatchNotification(`outbid:${previous.id}`);
  await sendSponsorEmail(final.email,'Devcon spot claim confirmed',`Your $${displayUnits(final.claim_price_units)} ${final.token} payment on ${final.chain} is confirmed. You are the current holder of Slot ${String(final.slot_number).padStart(2,'0')}. The spot can still be taken for 1.5 times its current price until the four-day auction closes.`);
  return resultFor(final,{message:'Payment confirmed. You are the current holder of this spot.'});
}

// Expiring leases are fenced: old invocations cannot write after a replacement owns the token.
export async function verifyPayment(body:any) {
  const id=String(body.id||''),secret=String(body.secret||'');
  const row:any=await checkoutRecord(id,secret);
  if(!row)throw new Error('Reservation unavailable.');
  if(['CONFIRMED','LATE_CONFIRMED','FAILED'].includes(row.payment_status))return resultFor(row);
  const lock=crypto.randomUUID();
  const acquired=await db().prepare(`UPDATE payments SET verification_lock=?,verification_lock_until=? WHERE id=? AND (verification_lock IS NULL OR verification_lock_until<?) AND status NOT IN ('CONFIRMED','LATE_CONFIRMED','FAILED')`).bind(lock,Date.now()+VERIFICATION_LEASE_MS,row.payment_id,Date.now()).run();
  if(!acquired.meta.changes){const latest:any=await checkoutRecord(id,secret);return resultFor(latest,{message:'Verification is already in progress. Retry shortly.'});}
  try{return await withVerificationScope(row.payment_id,lock,()=>verifyPaymentLocked(body));}
  finally{await db().prepare('UPDATE payments SET verification_lock=NULL,verification_lock_until=NULL WHERE id=? AND verification_lock=?').bind(row.payment_id,lock).run();}
}

async function verifyPaymentLocked(body: any) {
  const id = String(body.id || '');
  const secret = String(body.secret || '');
  let hash = String(body.tx || '').trim().toLowerCase();
  const row: any = await checkoutRecord(id, secret);
  if (!row) throw new Error('Reservation unavailable.');
  if (['CONFIRMED','LATE_CONFIRMED','FAILED'].includes(row.payment_status)) return resultFor(row);
  hash = hash || row.transaction_hash || await discoverPayment(row);
  if (!hash) {
    if(row.sponsorship_status==='EXPIRED')await db().prepare("UPDATE payments SET reconciliation_status='NO_PAYMENT_OBSERVED_QUARANTINED' WHERE id=? AND status='EXPIRED'").bind(row.payment_id).run();
    return resultFor(row,{message:'Watching for your exact USDC transfer on '+row.chain+'.'});
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Enter a valid transaction hash.');
  if (row.transaction_hash && row.transaction_hash.toLowerCase() !== hash.toLowerCase()) throw new Error('This reservation already has a payment under verification.');

  const campaign:any=await settleCampaign(Date.now());
  const slot:any = await db().prepare('SELECT order_id FROM slots WHERE id=?').bind(row.slot_number).first();
  // Expired claims may still have received funds; verify them for refund eligibility.

  const verification = JSON.parse(row.verification_config);
  if (Number(await rpc(verification, 'eth_chainId', [])) !== row.chain_id) throw new Error('Configured RPC returned a different chain.');
  const [transaction, receipt] = await Promise.all([
    rpc(verification, 'eth_getTransactionByHash', [hash]),
    rpc(verification, 'eth_getTransactionReceipt', [hash]),
  ]);

  if (!transaction) {
    return resultFor(row, { status: 'PENDING', message: `Transaction not found on ${row.chain} yet.` });
  }

  const expectedUnits = BigInt(row.amount_units || row.claim_price_units);
  const expectedInput = `0xa9059cbb${verification.treasury.slice(2).toLowerCase().padStart(64, '0')}${expectedUnits.toString(16).padStart(64, '0')}`;
  if (String(transaction.from || '').toLowerCase() !== row.wallet_address.toLowerCase()) throw new Error('The transaction sender does not match the registered payment wallet.');
  if (String(transaction.to || '').toLowerCase() !== row.token_contract.toLowerCase()) throw new Error('The transaction did not call the selected token contract.');
  if (String(transaction.input || transaction.data || '').toLowerCase() !== expectedInput) throw new Error('The transaction does not encode the exact token amount and treasury destination.');

  if (!receipt) {
    await db().batch([
      db().prepare("UPDATE payments SET transaction_hash=?,status='PAYMENT_DETECTED' WHERE id=? AND transaction_hash IS NULL").bind(hash, row.payment_id),
      db().prepare("UPDATE sponsorships SET status='PAYMENT_PENDING',updated_at=? WHERE id=? AND status='RESERVED'").bind(Date.now(), row.id),
    ]);
    const detected:any=await checkoutRecord(id,secret);
    return resultFor(detected||row, { status:'PAYMENT_DETECTED',message: 'Payment detected. Waiting for the transaction to be mined.' });
  }

  if (receipt.status !== '0x1') return releaseFailedPayment(row, hash, 'The blockchain transaction failed. The current holder was not changed.');

  const matchingLogs = (receipt.logs || []).filter((log: any) =>
    String(log.address).toLowerCase() === row.token_contract.toLowerCase() &&
    log.topics?.length === 3 &&
    String(log.topics[0]).toLowerCase() === TRANSFER_TOPIC &&
    addressFromTopic(log.topics[1]).toLowerCase() === row.wallet_address.toLowerCase() &&
    addressFromTopic(log.topics[2]).toLowerCase() === verification.treasury.toLowerCase() &&
    BigInt(log.data) === expectedUnits
  );
  if (matchingLogs.length !== 1) throw new Error('No exact token transfer matched the wallet, amount and treasury address.');

  const block: any = await rpc(verification, 'eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (!block?.timestamp) throw new Error('The payment block is temporarily unavailable. Try again.');
  const timestamp = Number(block.timestamp) * 1000;
  const currentBlock = Number(await rpc(verification, 'eth_blockNumber', []));
  const confirmations = Math.max(0, currentBlock - Number(receipt.blockNumber) + 1);
  if (confirmations < verification.confirmations) {
    await db().batch([
      db().prepare("UPDATE payments SET transaction_hash=?,status='CONFIRMING',confirmations=? WHERE id=? AND status NOT IN ('CONFIRMED','LATE_CONFIRMED','FAILED')").bind(hash, confirmations, row.payment_id),
      db().prepare("UPDATE sponsorships SET status='PAYMENT_PENDING',updated_at=? WHERE id=? AND status IN ('RESERVED','EXPIRED')").bind(Date.now(), row.id),
    ]);
    const confirming:any=await checkoutRecord(id,secret);
    return resultFor(confirming||row, { status:'CONFIRMING',confirmations, required: verification.confirmations });
  }

  const now=Date.now();
  const refreshedCampaign:any=await settleCampaign(now);
  const refreshedSlot:any=await db().prepare('SELECT order_id FROM slots WHERE id=?').bind(row.slot_number).first();
  const withinWindow=timestamp>=row.created_at&&timestamp<=row.reserved_until&&refreshedCampaign?.status==='LIVE'&&now<refreshedCampaign.ends_at&&refreshedSlot?.order_id===row.id;
  if(!withinWindow){
    return markLatePayment(row,hash,confirmations,'The exact payment was confirmed outside the active claim window. It did not replace the current holder, and a full refund is pending.');
  }
  return confirmClaim(row,hash,confirmations);
}

// Discover direct ERC20 transfers from the registered wallet without a pasted hash.
// A matching event is only a candidate: verifyPayment still checks the full transaction.
export async function discoverPayment(row:any){
  const verification=JSON.parse(row.verification_config);
  if(Number(await rpc(verification,'eth_chainId',[]))!==row.chain_id)throw new Error('Configured RPC returned a different chain.');
  const head=Number(await rpc(verification,'eth_blockNumber',[]));
  const from=Math.max(0,Number(verification.scanBlock??verification.startBlock??Math.max(0,head-2000)));
  const topic=(address:string)=>'0x'+address.slice(2).toLowerCase().padStart(64,'0');
  // Bounded batches keep public RPC queries small; persisted progress resumes next run.
  let cursor=from;
  for(let page=0;page<4&&cursor<=head;page++){
    const end=Math.min(cursor+499,head);
    const logs=await rpc(verification,'eth_getLogs',[{
      address:row.token_contract,fromBlock:'0x'+cursor.toString(16),toBlock:'0x'+end.toString(16),
      topics:[TRANSFER_TOPIC,topic(row.wallet_address),topic(verification.treasury)],
    }]);
    if(!Array.isArray(logs))throw new Error('Payment discovery is temporarily unavailable.');
    for(const log of logs){
      if(log.removed||!log.data||BigInt(log.data)!==BigInt(row.amount_units||row.claim_price_units))continue;
      const hash=String(log.transactionHash||'').toLowerCase();
      if(!/^0x[0-9a-f]{64}$/.test(hash))continue;
      const used=await db().prepare('SELECT id FROM payments WHERE transaction_hash=? AND id!=?').bind(hash,row.payment_id).first();
      if(!used)return hash;
    }
    cursor=end+1;
  }
  // Re-read the tip to tolerate a short reorg or a transfer arriving in the latest block.
  verification.scanBlock=Math.max(from,Math.min(cursor,Math.max(0,head-12)));
  await db().prepare('UPDATE payments SET verification_config=? WHERE id=? AND transaction_hash IS NULL').bind(JSON.stringify(verification),row.payment_id).run();
  return '';
}

export async function monitorPayments() {
  try{await consumeBudget(db(),'monitor:global',4);}catch(error:any){if(error?.status===429)return {processed:0,succeeded:0,failed:0,throttled:true};throw error;}
  return runPaymentMonitor(db(),verifyPayment);
}

export async function verifyRefund(payment:any,hash:string){
  const verification=JSON.parse(payment.verification_config);
  if(Number(await rpc(verification,'eth_chainId',[]))!==payment.chain_id)throw new Error('Refund RPC returned a different chain.');
  const receipt=await rpc(verification,'eth_getTransactionReceipt',[hash]);
  if(!receipt||receipt.status!=='0x1')throw new Error('The refund transaction is not confirmed successfully on the original payment network.');
  if(!payment.refund_eligible_at||!payment.confirmed_at)throw new Error('Refund eligibility timestamp is missing. Manual reconciliation is required.');
  const block:any=await rpc(verification,'eth_getBlockByNumber',[receipt.blockNumber,false]);
  const timestamp=Number(block?.timestamp)*1000;
  if(!Number.isFinite(timestamp)||timestamp<Math.max(payment.confirmed_at,payment.refund_eligible_at))throw new Error('Refund transfer predates this payment or its refund obligation.');
  const expectedUnits=BigInt(payment.refund_amount_units||payment.amount_units);
  const logs=(receipt.logs||[]).filter((log:any)=>
    String(log.address).toLowerCase()===payment.token_contract.toLowerCase()&&
    log.topics?.length===3&&String(log.topics[0]).toLowerCase()===TRANSFER_TOPIC&&
    addressFromTopic(log.topics[1]).toLowerCase()===verification.treasury.toLowerCase()&&
    addressFromTopic(log.topics[2]).toLowerCase()===payment.wallet_address.toLowerCase()&&
    BigInt(log.data)===expectedUnits);
  if(logs.length!==1)throw new Error('Refund must transfer the full original token amount from the treasury to the original payment wallet.');
  const head=Number(await rpc(verification,'eth_blockNumber',[]));
  if(head-Number(receipt.blockNumber)+1<verification.confirmations)throw new Error('The refund needs more on-chain confirmations.');
}
