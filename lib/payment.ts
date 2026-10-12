/* eslint-disable @typescript-eslint/no-explicit-any */
import { config, db, dispatchNotification, queueNotification, ready, rpc, settleCampaign } from './campaign';
import { PAYMENT_CONFIRMED_EMAIL, outbidEmail, paymentConfirmedEmail } from './sponsor-email';
import { formatUsdcUnits } from './auction';
import { paymentRail, TREASURY_WALLET_ADDRESS } from './payment-networks';
import { exactUsdcAmount, qrPaymentUri } from './qr-payment';
import { runPaymentMonitor } from './payment-monitor';

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
  price: JSON.parse(row.verification_config).paymentMode==='qr' ? exactUsdcAmount(row.amount_units) : (row.claim_price_units ? displayUnits(row.claim_price_units) : row.amount),
  priceUnits: row.amount_units || row.claim_price_units,
  claimPriceUnits: row.claim_price_units,
  token: row.token,
  network: row.chain,
  logoStatus: row.logo_status,
  explorerUrl: row.transaction_hash ? JSON.parse(row.verification_config).explorer + row.transaction_hash : null,
  ...overrides,
});

async function releaseFailedPayment(row: any, hash: string, message: string) {
  const failedAt = Date.now();
  await db().batch([
    db().prepare("UPDATE payments SET status='FAILED' WHERE id=? AND transaction_hash=? AND status IN ('PENDING','EXPIRED','PAYMENT_DETECTED','CONFIRMING','CANCELLED')").bind(row.payment_id,hash),
    db().prepare("UPDATE sponsorships SET status='PAYMENT_FAILED',updated_at=? WHERE id=? AND status IN ('RESERVED','PAYMENT_PENDING','EXPIRED','CANCELLED') AND EXISTS(SELECT 1 FROM payments WHERE id=? AND status='FAILED')").bind(failedAt, row.id,row.payment_id),
    db().prepare("UPDATE slots SET order_id=NULL,expires=NULL WHERE id=? AND order_id=? AND EXISTS(SELECT 1 FROM payments WHERE id=? AND status='FAILED')").bind(row.slot_number, row.id,row.payment_id),
  ]);
  const final:any=await checkoutRecord(row.id,row.secret);
  return resultFor(final||row, { message });
}

async function markLatePayment(row:any,hash:string,confirmations:number,message:string){
  const confirmedAt=Date.now();
  await db().batch([
    db().prepare(`UPDATE payments SET transaction_hash=?,status='LATE_CONFIRMED',confirmations=?,confirmed_at=?,
      refund_status='REFUND_PENDING',refund_amount_units=amount_units,refund_updated_at=?
      WHERE id=? AND transaction_hash=? AND status IN ('PENDING','EXPIRED','PAYMENT_DETECTED','CONFIRMING','CANCELLED')`).bind(hash,confirmations,confirmedAt,confirmedAt,row.payment_id,hash),
    db().prepare("UPDATE sponsorships SET status='REFUND_PENDING',updated_at=? WHERE id=? AND status IN ('RESERVED','EXPIRED','PAYMENT_PENDING','CANCELLED') AND EXISTS(SELECT 1 FROM payments WHERE id=? AND status='LATE_CONFIRMED')").bind(confirmedAt,row.id,row.payment_id),
    db().prepare("UPDATE slots SET order_id=NULL,expires=NULL WHERE id=? AND order_id=? AND EXISTS(SELECT 1 FROM payments WHERE id=? AND status='LATE_CONFIRMED')").bind(row.slot_number,row.id,row.payment_id),
  ]);
  const final:any=await checkoutRecord(row.id,row.secret);
  if(final?.payment_status!=='LATE_CONFIRMED')return resultFor(final||row);
  const notificationId=`late-payment:${row.id}`;
  await queueNotification({
    id:notificationId,
    sponsorId:row.sponsor_id,
    sponsorshipId:row.id,
    paymentId:row.payment_id,
    type:'LATE_PAYMENT_REFUND',
    recipient:row.email,
    subject:'Devcon claim payment refund update',
    body:`Your $${displayUnits(row.amount_units||row.claim_price_units)} ${row.token} on ${row.chain} payment for Slot ${String(row.slot_number).padStart(2,'0')} was confirmed after the claim window had closed. It did not replace the current holder and is marked REFUND_PENDING. The refund is not complete until an on-chain refund reference is recorded.`,
  });
  await dispatchNotification(notificationId);
  return resultFor(final,{message});
}

async function confirmClaim(row:any,hash:string,confirmations:number){
  const confirmedAt=Date.now();
  const confirmationId=`payment-confirmed:${row.payment_id}`;
  const confirmation=paymentConfirmedEmail({project:row.project_name,slot:row.slot_number,amountUnits:row.amount_units||row.claim_price_units,network:row.chain});
  const slot:any=await db().prepare('SELECT order_id,holder_sponsorship_id,current_price_units,claim_count FROM slots WHERE id=?').bind(row.slot_number).first();
  const expectedPrevious=row.previous_holder_sponsorship_id||null;
  const expectedCurrent=slot?.current_price_units||null;
  const previous:any=expectedPrevious?await db().prepare(`SELECT sp.id,sp.slot_number,sp.claim_price_units,s.id AS sponsor_id,s.project_name,s.email,p.id AS payment_id,p.token,p.chain,p.amount_units
    FROM sponsorships sp JOIN sponsors s ON s.id=sp.sponsor_id JOIN payments p ON p.sponsorship_id=sp.id WHERE sp.id=?`).bind(expectedPrevious).first():null;
  const statements:any[]=[
    db().prepare(`UPDATE slots SET holder_sponsorship_id=?,current_price_units=?,claim_count=claim_count+1,order_id=NULL,expires=NULL
      WHERE id=? AND order_id=? AND holder_sponsorship_id IS ? AND current_price_units IS ?
      AND EXISTS(SELECT 1 FROM payments WHERE id=? AND transaction_hash=? AND status IN ('PENDING','EXPIRED','PAYMENT_DETECTED','CONFIRMING'))
      AND EXISTS(SELECT 1 FROM auction_campaign WHERE id=1 AND status='LIVE' AND (ends_at IS NULL OR ends_at>?))`)
      .bind(row.id,row.claim_price_units,row.slot_number,row.id,expectedPrevious,expectedCurrent,row.payment_id,hash,confirmedAt),
    db().prepare(`UPDATE payments SET transaction_hash=?,status='CONFIRMED',confirmations=?,confirmed_at=?
      WHERE id=? AND status IN ('PENDING','EXPIRED','PAYMENT_DETECTED','CONFIRMING') AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`)
      .bind(hash,confirmations,confirmedAt,row.payment_id,row.id),
    db().prepare(`UPDATE sponsorships SET status='CURRENT_HOLDER',claim_sequence=(SELECT claim_count FROM slots WHERE id=?),updated_at=?
      WHERE id=? AND status IN ('RESERVED','EXPIRED','PAYMENT_PENDING') AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`)
      .bind(row.slot_number,confirmedAt,row.id,row.id),
    db().prepare(`UPDATE sponsors SET logo_status='APPROVED' WHERE id=? AND logo_status='PENDING_REVIEW'
      AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`).bind(row.sponsor_id,row.id),
  ];
  if(previous){
    const notificationId=`outbid:${previous.id}`;
    const copy=outbidEmail({project:previous.project_name,slot:row.slot_number,amountUnits:previous.amount_units||previous.claim_price_units,newAmountUnits:row.claim_price_units});
    statements.push(
      db().prepare("UPDATE sponsorships SET status='OUTBID',updated_at=? WHERE id=? AND status='CURRENT_HOLDER' AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)").bind(confirmedAt,previous.id,row.id),
      db().prepare(`UPDATE payments SET refund_status='REFUND_PENDING',refund_amount_units=amount_units,refund_updated_at=?
        WHERE sponsorship_id=? AND status='CONFIRMED' AND refund_status='NONE' AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`).bind(confirmedAt,previous.id,row.id),
      db().prepare(`INSERT OR IGNORE INTO notifications
        (id,sponsor_id,sponsorship_id,payment_id,type,recipient,subject,body,status,created_at)
        SELECT ?,?,?,?,?,?,?,?,'PENDING',? WHERE EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`)
        .bind(notificationId,previous.sponsor_id,previous.id,previous.payment_id,'OUTBID',previous.email,copy.subject,copy.body,confirmedAt,row.id),
    );
  }
  // Persist the email in the same transaction as the successful claim. Late,
  // failed and superseded transfers never receive a holder confirmation.
  statements.push(db().prepare(`INSERT OR IGNORE INTO notifications
    (id,sponsor_id,sponsorship_id,payment_id,type,recipient,subject,body,status,created_at)
    SELECT ?,?,?,?,?,?,?,?,'PENDING',?
    WHERE EXISTS(SELECT 1 FROM payments WHERE id=? AND status='CONFIRMED')
    AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)`)
    .bind(confirmationId,row.sponsor_id,row.id,row.payment_id,PAYMENT_CONFIRMED_EMAIL,row.email,confirmation.subject,confirmation.body,confirmedAt,row.payment_id,row.id));
  const changes=await db().batch(statements);
  const final:any=await checkoutRecord(row.id,row.secret);
  if(final?.payment_status!=='CONFIRMED'){
    return markLatePayment(row,hash,confirmations,'The payment was confirmed, but the claim window had already closed. A full refund is pending.');
  }
  if(!changes[0].meta.changes)return resultFor(final);
  if(previous)try{await dispatchNotification(`outbid:${previous.id}`);}catch{console.error('Outbid email remains queued for admin retry.');}
  try{await dispatchNotification(confirmationId);}catch{console.error('Payment confirmation email remains queued for admin retry.');}
  return resultFor(final,{message:'Payment confirmed. You are the current holder of this spot.'});
}

export async function verifyPayment(body: any) {
  const id = String(body.id || '');
  const secret = String(body.secret || '');
  let hash = String(body.tx || '').trim().toLowerCase();
  const row: any = await checkoutRecord(id, secret);
  if (!row) throw new Error('Reservation unavailable.');
  const verification = JSON.parse(row.verification_config);
  const qr=verification.paymentMode==='qr';
  if (['CONFIRMED','LATE_CONFIRMED','FAILED'].includes(row.payment_status)) return resultFor(row);
  if(row.payment_status==='CANCELLED'&&!qr&&!hash&&!row.transaction_hash)return resultFor(row,{message:'This unpaid reservation was cancelled.'});
  // Rotate background scans fairly even when an unpaid checkout has no hash.
  await db().prepare('UPDATE sponsorships SET updated_at=? WHERE id=?').bind(Date.now(),row.id).run();
  hash = hash || row.transaction_hash || (row.payment_status==='CANCELLED'&&!qr?null:await discoverPayment(row));
  if (!hash) return resultFor(row,{status:'PENDING',message:'Watching for your exact USDC transfer on '+row.chain+'.'});
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Enter a valid transaction hash.');
  if (row.transaction_hash && row.transaction_hash.toLowerCase() !== hash.toLowerCase()) throw new Error('This reservation already has a payment under verification.');

  const {asset}=paymentRail(row.chain_id,row.token);
  if(row.token_contract.toLowerCase()!==asset.address.toLowerCase()||verification.treasury.toLowerCase()!==TREASURY_WALLET_ADDRESS)throw new Error('This checkout has an unsupported USDC contract or recipient.');
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
  if (String(transaction.hash).toLowerCase() !== hash || BigInt(transaction.value || '0x0') !== BigInt(0)) throw new Error('The transaction identity or native value is invalid.');

  // Claim a hash atomically before any status mutation. The unique database index
  // prevents a transfer from being credited to multiple checkouts.
  try {
    await db().prepare(`UPDATE payments SET transaction_hash=? WHERE id=? AND (transaction_hash IS NULL OR transaction_hash=?)
      AND status IN ('PENDING','EXPIRED','PAYMENT_DETECTED','CONFIRMING','CANCELLED')`).bind(hash,row.payment_id,hash).run();
  } catch { throw new Error('This transaction is already assigned to another checkout.'); }
  const bound:any=await checkoutRecord(id,secret);
  if(['CONFIRMED','LATE_CONFIRMED','FAILED'].includes(bound.payment_status))return resultFor(bound);
  if(bound.transaction_hash!==hash)throw new Error('This checkout already has a different transaction under verification.');

  if (!receipt) {
    await db().batch([
      db().prepare("UPDATE payments SET status='PAYMENT_DETECTED' WHERE id=? AND transaction_hash=? AND status IN ('PENDING','EXPIRED')").bind(row.payment_id,hash),
      db().prepare("UPDATE sponsorships SET status='PAYMENT_PENDING',updated_at=? WHERE id=? AND status='RESERVED'").bind(Date.now(), row.id),
    ]);
    const detected:any=await checkoutRecord(id,secret);
    return resultFor(detected||row, { message: 'Payment detected. Waiting for the transaction to be mined.' });
  }

  if(String(receipt.transactionHash).toLowerCase()!==hash||transaction.blockHash!==receipt.blockHash||transaction.blockNumber!==receipt.blockNumber)throw new Error('Transaction and receipt do not refer to the same mined payment.');

  if(!['0x0','0x1'].includes(receipt.status))throw new Error('The transaction receipt has an invalid execution status.');

  const matchingLogs = (receipt.logs || []).filter((log: any) =>
    !log.removed && log.blockHash===receipt.blockHash && String(log.transactionHash).toLowerCase()===hash &&
    String(log.address).toLowerCase() === row.token_contract.toLowerCase() &&
    log.topics?.length === 3 &&
    String(log.topics[0]).toLowerCase() === TRANSFER_TOPIC &&
    addressFromTopic(log.topics[1]).toLowerCase() === row.wallet_address.toLowerCase() &&
    addressFromTopic(log.topics[2]).toLowerCase() === verification.treasury.toLowerCase() &&
    BigInt(log.data) === expectedUnits
  );
  if (receipt.status==='0x1'&&matchingLogs.length !== 1) throw new Error('No exact token transfer matched the wallet, amount and treasury address.');

  const block: any = await rpc(verification, 'eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (!block?.timestamp || block.hash!==receipt.blockHash || block.number!==receipt.blockNumber) throw new Error('The payment is not in the canonical block. Try again.');
  const timestamp = Number(block.timestamp) * 1000;
  if(Number(receipt.blockNumber)<=Number(verification.startBlock)||timestamp<Math.floor(row.created_at/1000)*1000)throw new Error('This transfer predates the checkout and cannot create a claim or refund.');
  const currentBlock = Number(await rpc(verification, 'eth_blockNumber', []));
  const confirmations = Math.max(0, currentBlock - Number(receipt.blockNumber) + 1);
  if (confirmations < verification.confirmations) {
    await db().batch([
      db().prepare("UPDATE payments SET status='CONFIRMING',confirmations=MAX(confirmations,?) WHERE id=? AND transaction_hash=? AND status IN ('PENDING','EXPIRED','PAYMENT_DETECTED','CONFIRMING','CANCELLED')").bind(confirmations,row.payment_id,hash),
      db().prepare("UPDATE sponsorships SET status='PAYMENT_PENDING',updated_at=? WHERE id=? AND status IN ('RESERVED','EXPIRED')").bind(Date.now(), row.id),
    ]);
    const confirming:any=await checkoutRecord(id,secret);
    return resultFor(confirming||row, { required: verification.confirmations });
  }

  if(receipt.status==='0x0')return releaseFailedPayment(row,hash,'The blockchain transaction failed. The current holder was not changed.');

  const now=Date.now();
  const refreshedCampaign:any=await settleCampaign(now);
  const refreshedSlot:any=await db().prepare('SELECT order_id FROM slots WHERE id=?').bind(row.slot_number).first();
  const withinWindow=row.payment_status!=='CANCELLED'&&timestamp<=row.reserved_until&&now<row.reserved_until&&refreshedCampaign?.status==='LIVE'&&(refreshedCampaign.ends_at===null||now<refreshedCampaign.ends_at)&&refreshedSlot?.order_id===row.id;
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
  const from=Math.max(0,Number(verification.startBlock??0)+1,Number(verification.scanBlock??verification.startBlock??Math.max(0,head-2000)));
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
  return runPaymentMonitor(db(),verifyPayment);
}

export async function verifyRefund(payment:any,hash:string){
  const verification=JSON.parse(payment.verification_config);
  if(Number(await rpc(verification,'eth_chainId',[]))!==payment.chain_id)throw new Error('Refund RPC returned a different chain.');
  const receipt=await rpc(verification,'eth_getTransactionReceipt',[hash]);
  if(!receipt||receipt.status!=='0x1')throw new Error('The refund transaction is not confirmed successfully on the original payment network.');
  if(String(receipt.transactionHash).toLowerCase()!==hash)throw new Error('Refund receipt does not match the submitted transaction.');
  const block=await rpc(verification,'eth_getBlockByNumber',[receipt.blockNumber,false]);
  if(!block||block.hash!==receipt.blockHash||block.number!==receipt.blockNumber)throw new Error('The refund is not in the canonical block.');
  if(Number(block.timestamp)*1000<Math.floor(Math.max(payment.confirmed_at||0,payment.refund_eligible_at||0)/1000)*1000)throw new Error('The refund transaction predates refund eligibility.');
  const expectedUnits=BigInt(payment.refund_amount_units||payment.amount_units);
  const logs=(receipt.logs||[]).filter((log:any)=>
    !log.removed&&log.blockHash===receipt.blockHash&&String(log.transactionHash).toLowerCase()===hash&&
    String(log.address).toLowerCase()===payment.token_contract.toLowerCase()&&
    log.topics?.length===3&&String(log.topics[0]).toLowerCase()===TRANSFER_TOPIC&&
    addressFromTopic(log.topics[1]).toLowerCase()===verification.treasury.toLowerCase()&&
    addressFromTopic(log.topics[2]).toLowerCase()===payment.wallet_address.toLowerCase()&&
    BigInt(log.data)===expectedUnits);
  if(logs.length!==1)throw new Error('Refund must transfer the full original token amount from the treasury to the original payment wallet.');
  const head=Number(await rpc(verification,'eth_blockNumber',[]));
  if(head-Number(receipt.blockNumber)+1<verification.confirmations)throw new Error('The refund needs more on-chain confirmations.');
}

export async function paymentPreflight(body:any){
  const row:any=await checkoutRecord(String(body.id||''),String(body.secret||''));
  if(!row)throw new Error('Reservation unavailable.');
  const current=await config(),now=Date.now();
  const campaign:any=await settleCampaign(now);
  const slot:any=await db().prepare('SELECT order_id FROM slots WHERE id=?').bind(row.slot_number).first();
  if(!ready(current)||campaign?.status!=='LIVE'||(campaign.ends_at!==null&&now>=campaign.ends_at)||slot?.order_id!==row.id||row.reserved_until-now<60000)throw new Error('This checkout is closed or has less than one minute remaining. Do not send funds.');
  if(row.payment_status!=='PENDING'||row.transaction_hash)throw new Error('This checkout already has a payment. Verify it instead of sending again.');
  const verification=JSON.parse(row.verification_config);
  const {asset}=paymentRail(row.chain_id,row.token);
  if(verification.treasury.toLowerCase()!==TREASURY_WALLET_ADDRESS||row.token_contract.toLowerCase()!==asset.address.toLowerCase())throw new Error('Payment configuration changed. Do not send funds.');
  return {treasury:verification.treasury,priceUnits:row.amount_units,chainId:row.chain_id,tokenAddress:row.token_contract};
}

export async function qrPaymentDetails(body:any){
  const row:any=await checkoutRecord(String(body.id||''),String(body.secret||''));
  if(!row)throw new Error('Reservation unavailable.');
  const verification=JSON.parse(row.verification_config);
  const {network,asset}=paymentRail(row.chain_id,row.token);
  if(verification.paymentMode!=='qr'||verification.treasury.toLowerCase()!==TREASURY_WALLET_ADDRESS||row.token_contract.toLowerCase()!==asset.address.toLowerCase())throw new Error('QR payment configuration is unavailable.');
  const campaign:any=await db().prepare('SELECT status,ends_at FROM auction_campaign WHERE id=1').first();
  const slot:any=await db().prepare('SELECT order_id FROM slots WHERE id=?').bind(row.slot_number).first();
  const now=Date.now();
  const payable=row.payment_status==='PENDING'&&!row.transaction_hash&&row.reserved_until-now>=60000&&slot?.order_id===row.id&&campaign?.status==='LIVE'&&(campaign.ends_at===null||campaign.ends_at>now);
  return {
    id:row.id,secret:row.secret,reservedUntil:row.reserved_until,paymentMode:'qr',qrPayable:payable,
    price:exactUsdcAmount(row.amount_units),priceUnits:row.amount_units,
    claimPrice:displayUnits(row.claim_price_units),claimPriceUnits:row.claim_price_units,
    identifyingFraction:exactUsdcAmount(BigInt(row.amount_units)-BigInt(row.claim_price_units)),
    position:row.position,project:row.project_name,wallet:row.wallet_address,treasury:verification.treasury,
    chainId:network.id,chainName:network.name,token:asset.symbol,tokenLabel:asset.label,tokenAddress:asset.address,
    decimals:asset.decimals,gas:network.gas,explorer:network.explorer,
    paymentUri:qrPaymentUri({chainId:network.id,tokenAddress:asset.address,treasury:verification.treasury,amountUnits:row.amount_units}),
    status:row.payment_status,transactionHash:row.transaction_hash,
  };
}
