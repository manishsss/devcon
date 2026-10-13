/* eslint-disable @typescript-eslint/no-explicit-any */
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { readRpc } from './read-rpc';
import { fencedDatabase } from './verification-scope';
import { consumeBudget } from './abuse';
import { PAYMENT_NETWORKS } from './payment-networks';
import { TREASURY_WALLET_ADDRESS } from './payment-networks';
import { campaignResultEmail, emailTypeEnabled, sendTransactionalEmail } from './sponsor-email';
import {
  AUCTION_DURATION_MS,
  INITIAL_PRICES,
  TARGET_UNITS,
  THRESHOLD_UNITS,
  claimPriceUnits,
  effectiveAuctionStatus,
  formatUsdcUnits,
  initialPriceUnits,
  type AuctionStatus,
} from './auction';

const BASE_USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const defaults={
  target:2200,
  treasury:TREASURY_WALLET_ADDRESS,
  chainName:'Base',
  chainId:8453,
  rpc:'https://base-rpc.publicnode.com',
  explorer:'https://basescan.org/tx/',
  usdc:BASE_USDC,
  usdcDecimals:6,
  confirmations:12,
  reservationMinutes:5,
  maxUploadMB:5,
  policy:"The four-day campaign must reach at least 50% of the $2,200 target ($1,100). If it does not, every confirmed current sponsorship payment is queued for a full refund and the fundraiser closes. Sponsors who are successfully outbid are always eligible for a full refund of their confirmed claim payment."
};
export const positions=['Front · Upper Left','Front · Upper Right','Front · Lower Left','Front · Lower Right','Back · Upper Left','Back · Upper Right','Back · Lower Left','Back · Lower Right'];

export function db(){if(!(env as any).DB)throw new Error('Sponsorship inventory is temporarily unavailable. Please try again.');return fencedDatabase((env as any).DB);}

export async function config(){
  const row:any=await db().prepare('SELECT value FROM settings WHERE id=1').first();
  const saved=row?JSON.parse(row.value):{};
  const runtime:any=env;
  return {
    ...defaults,
    ...saved,
    policy:defaults.policy,
    reservationMinutes:Number(runtime.RESERVATION_MINUTES||saved.reservationMinutes||defaults.reservationMinutes),
    treasury:runtime.TREASURY_WALLET_ADDRESS||saved.treasury||defaults.treasury,
    rpcByChain:Object.fromEntries(PAYMENT_NETWORKS.map(network=>[network.id,runtime[`CHAIN_RPC_URL_${network.id}`]||(network.id===8453?(runtime.CHAIN_RPC_URL||saved.rpc||network.rpc):network.rpc)])),
    chainName:runtime.SUPPORTED_CHAIN||saved.chainName||defaults.chainName,
    chainId:Number(runtime.SUPPORTED_CHAIN_ID||saved.chainId||defaults.chainId),
    rpc:runtime.CHAIN_RPC_URL||saved.rpc||defaults.rpc,
    explorer:runtime.BASE_EXPLORER_URL||saved.explorer||defaults.explorer,
    usdc:runtime.USDC_CONTRACT_ADDRESS||saved.usdc||defaults.usdc,
  };
}

export function ready(c:any){return (env as any).PAYMENTS_DISABLED!=='1'&&typeof c.treasury==='string'&&c.treasury.toLowerCase()===TREASURY_WALLET_ADDRESS;}

export async function admin(){
  const user=await getChatGPTUser();
  const email=(env as any).ADMIN_EMAIL;
  if(!email||!user||user.email.toLowerCase()!==email.toLowerCase())throw new Error('Admin access requires the configured administrator account.');
  return user;
}

export async function initialize(){
  const database=db(),now=Date.now();
  const seeds=INITIAL_PRICES.map((price,i)=>database.prepare('INSERT OR IGNORE INTO slots (id,price) VALUES (?,?)').bind(i+1,price));
  await database.batch([
    ...seeds,
    database.prepare("INSERT OR IGNORE INTO auction_campaign (id,status,duration_seconds,target_units,threshold_units,created_at) VALUES (1,'UPCOMING',?,?,?,?)").bind(AUCTION_DURATION_MS/1000,TARGET_UNITS.toString(),THRESHOLD_UNITS.toString(),now),
    database.prepare('UPDATE slots SET order_id=NULL,expires=NULL WHERE expires IS NOT NULL AND expires<?').bind(now),
    database.prepare("UPDATE sponsorships SET status='EXPIRED',updated_at=? WHERE reserved_until<? AND status IN ('RESERVED','PAYMENT_PENDING')").bind(now,now),
    database.prepare("UPDATE payments SET status='EXPIRED' WHERE status='PENDING' AND transaction_hash IS NULL AND sponsorship_id IN (SELECT id FROM sponsorships WHERE status='EXPIRED')"),
  ]);
  if((env as any).MANUAL_AUCTION_ENABLED==='1' && ready(await config())){
    await database.prepare("UPDATE auction_campaign SET status='LIVE',starts_at=?,ends_at=NULL WHERE id=1 AND status='UPCOMING' AND starts_at IS NULL").bind(now).run();
  }
}

export async function closeManualAuction(now=Date.now()){
  if((env as any).MANUAL_AUCTION_ENABLED!=='1')throw new Error('Manual closing is not enabled.');
  const result=await db().prepare("UPDATE auction_campaign SET ends_at=? WHERE id=1 AND status='LIVE' AND ends_at IS NULL").bind(now).run();
  if(!result.meta.changes)throw new Error('The campaign is not open for manual closing.');
  return settleCampaign(now);
}

export async function campaign(){
  await initialize();
  return db().prepare('SELECT * FROM auction_campaign WHERE id=1').first();
}

function displayUnits(value:string|bigint){
  const units=typeof value==='bigint'?value:BigInt(value);
  return formatUsdcUnits(units,units%BigInt(1_000_000)===BigInt(0)?0:2);
}

export async function queueNotification(input:{
  id:string;
  sponsorId:string;
  sponsorshipId:string;
  paymentId?:string|null;
  type:string;
  recipient:string;
  subject:string;
  body:string;
}){
  await db().prepare(`INSERT OR IGNORE INTO notifications
    (id,sponsor_id,sponsorship_id,payment_id,type,recipient,subject,body,status,created_at)
    VALUES(?,?,?,?,?,?,?,?,'PENDING',?)`)
    .bind(input.id,input.sponsorId,input.sponsorshipId,input.paymentId||null,input.type,input.recipient,input.subject,input.body,Date.now()).run();
}

export async function dispatchNotification(id:string){
  const row:any=await db().prepare("SELECT * FROM notifications WHERE id=? AND status!='SENT'").bind(id).first();
  if(!row)return false;
  if(!emailTypeEnabled(row.type))return false;
  const sent=await sendSponsorEmail(row.recipient,row.subject,row.body,row.type,row.id);
  if(sent){
    await db().prepare("UPDATE notifications SET status='SENT',sent_at=?,last_error=NULL WHERE id=?").bind(Date.now(),id).run();
    return true;
  }
  await db().prepare("UPDATE notifications SET last_error=? WHERE id=? AND status!='SENT'").bind('Email submission failed. Check Resend configuration and retry.',id).run();
  return false;
}

async function campaignResultNotificationStatements(successful:boolean,now:number){
  const {results}=await db().prepare(`SELECT sp.id AS sponsorship_id,sp.slot_number,p.amount_units,sp.claim_price_units,
    s.id AS sponsor_id,s.project_name,s.email,p.id AS payment_id,p.token,p.chain
    FROM slots sl
    JOIN sponsorships sp ON sp.id=sl.holder_sponsorship_id
    JOIN sponsors s ON s.id=sp.sponsor_id
    JOIN payments p ON p.sponsorship_id=sp.id
    WHERE p.status='CONFIRMED'`).all();
  return (results as any[]).map(row=>{
    const id=`campaign-${successful?'success':'refund'}:${row.sponsorship_id}`;
    const copy=campaignResultEmail({project:row.project_name,slot:row.slot_number,amountUnits:row.amount_units,successful});
    return db().prepare(`INSERT OR IGNORE INTO notifications
      (id,sponsor_id,sponsorship_id,payment_id,type,recipient,subject,body,status,created_at)
      SELECT ?,?,?,?,?,?,?,?,'PENDING',?
      WHERE EXISTS(SELECT 1 FROM auction_campaign WHERE id=1 AND status=?)
      AND EXISTS(SELECT 1 FROM slots WHERE holder_sponsorship_id=?)
      AND EXISTS(SELECT 1 FROM payments WHERE id=? AND status='CONFIRMED')`)
      .bind(id,row.sponsor_id,row.sponsorship_id,row.payment_id,successful?'CAMPAIGN_SUCCESS':'CAMPAIGN_REFUND',row.email,copy.subject,copy.body,now,successful?'SUCCESSFUL':'REFUNDED',row.sponsorship_id,row.payment_id);
  });
}

export async function settleCampaign(now=Date.now()){
  let current:any=await db().prepare('SELECT * FROM auction_campaign WHERE id=1').first();
  if(!current)return null;
  if(current.status==='LIVE'&&current.ends_at!==null&&now>=current.ends_at){
    await db().batch([
      db().prepare("UPDATE auction_campaign SET status='CLOSED' WHERE id=1 AND status='LIVE' AND ends_at<=?").bind(now),
      db().prepare('UPDATE slots SET order_id=NULL,expires=NULL WHERE order_id IS NOT NULL'),
      db().prepare("UPDATE sponsorships SET status='EXPIRED',updated_at=? WHERE status='RESERVED'").bind(now),
      db().prepare("UPDATE payments SET status='EXPIRED' WHERE status='PENDING' AND transaction_hash IS NULL"),
    ]);
    current=await db().prepare('SELECT * FROM auction_campaign WHERE id=1').first();
  }
  if(current?.status==='CLOSED'&&!current.finalized_at){
    const totals:any=await db().prepare(`SELECT COUNT(*) AS holder_count,
      COALESCE(SUM(CAST(p.amount_units AS INTEGER)),0) AS total_units
      FROM slots sl JOIN payments p ON p.sponsorship_id=sl.holder_sponsorship_id WHERE p.status='CONFIRMED'`).first();
    const totalUnits=BigInt(String(totals?.total_units||0));
    const successful=totalUnits>=BigInt(current.threshold_units);
    const finalStatus=successful?'SUCCESSFUL':'REFUNDED';
    const statements=[
      db().prepare("UPDATE auction_campaign SET status=?,final_value_units=?,final_holder_count=?,finalized_at=? WHERE id=1 AND status='CLOSED'").bind(finalStatus,totalUnits.toString(),Number(totals?.holder_count||0),now),
      successful
        ? db().prepare("UPDATE sponsorships SET status='FINAL_HOLDER',updated_at=? WHERE id IN (SELECT holder_sponsorship_id FROM slots WHERE holder_sponsorship_id IS NOT NULL)").bind(now)
        : db().prepare("UPDATE sponsorships SET status='REFUND_PENDING',updated_at=? WHERE id IN (SELECT holder_sponsorship_id FROM slots WHERE holder_sponsorship_id IS NOT NULL)").bind(now),
    ];
    if(!successful)statements.push(db().prepare(`UPDATE payments SET refund_status='REFUND_PENDING',refund_amount_units=amount_units,refund_updated_at=?
      WHERE status='CONFIRMED' AND refund_status='NONE' AND sponsorship_id IN (SELECT holder_sponsorship_id FROM slots WHERE holder_sponsorship_id IS NOT NULL)`).bind(now));
    statements.push(...await campaignResultNotificationStatements(successful,now));
    await db().batch(statements);
    current=await db().prepare('SELECT * FROM auction_campaign WHERE id=1').first();
  }
  // The outbox is committed with settlement; a later request can resume a send
  // interrupted after commit without recreating or changing the campaign result.
  if(current?.finalized_at){
    const {results}=await db().prepare("SELECT id FROM notifications WHERE type IN ('CAMPAIGN_SUCCESS','CAMPAIGN_REFUND') AND status!='SENT'").all();
    for(const row of results as any[])try{await dispatchNotification(row.id);}catch{console.error('Campaign result email remains queued for admin retry.');}
  }
  return current;
}

export async function inventory(){
  await initialize();
  const now=Date.now();
  const [c,settled]=await Promise.all([config(),settleCampaign(now)]);
  const campaignRow:any=settled || await db().prepare('SELECT * FROM auction_campaign WHERE id=1').first();
  const state=effectiveAuctionStatus(campaignRow.status as AuctionStatus,campaignRow.ends_at,now);
  const [{results},historyRows]=await Promise.all([db().prepare(`SELECT
    sl.id,sl.price,sl.disabled,sl.order_id,sl.expires,sl.current_price_units,sl.holder_sponsorship_id,sl.claim_count,
    hs.status AS holder_status,s.project_name,s.logo_url,s.logo_status,s.x_handle,s.website,
    hp.status AS holder_payment_status,hp.refund_status,hp.amount_units AS holder_amount_units
    FROM slots sl
    LEFT JOIN sponsorships hs ON hs.id=sl.holder_sponsorship_id
    LEFT JOIN sponsors s ON s.id=hs.sponsor_id
    LEFT JOIN payments hp ON hp.sponsorship_id=hs.id
    ORDER BY sl.id`).all(),
  db().prepare(`SELECT sp.slot_number,sp.claim_price_units
    FROM sponsorships sp JOIN payments p ON p.sponsorship_id=sp.id
    WHERE p.status='CONFIRMED' AND sp.claim_sequence IS NOT NULL
    ORDER BY sp.slot_number,sp.claim_sequence`).all()]);
  const histories=new Map<number,string[]>();
  for(const row of historyRows.results as any[]){
    const values=histories.get(row.slot_number)||[];
    values.push(displayUnits(row.claim_price_units));
    histories.set(row.slot_number,values);
  }
  const paymentReady=ready(c);
  const slots=results.map((row:any)=>{
    const initialUnits=initialPriceUnits(row.id);
    const currentUnits=row.current_price_units?BigInt(row.current_price_units):null;
    const nextUnits=claimPriceUnits(initialUnits,currentUnits);
    const checkoutInProgress=Boolean(row.order_id&&row.expires&&row.expires>now);
    const held=Boolean(row.holder_sponsorship_id&&currentUnits!==null);
    const status=row.disabled?'PAUSED':held?'HELD':'AVAILABLE';
    return {
      id:row.id,
      price:row.price,
      position:positions[row.id-1],
      status,
      startingPriceUnits:initialUnits.toString(),
      startingPrice:displayUnits(initialUnits),
      currentPriceUnits:currentUnits?.toString()||null,
      paidUnits:row.holder_amount_units||'0',
      currentPrice:currentUnits===null?null:displayUnits(currentUnits),
      claimPriceUnits:nextUnits.toString(),
      claimPrice:displayUnits(nextUnits),
      claimCount:Number(row.claim_count||0),
      history:histories.get(row.id)||[],
      holder:held?{project:row.project_name,x:row.x_handle}:null,
      project:held?row.project_name:null,
      logo:held&&row.holder_payment_status==='CONFIRMED'&&row.logo_status==='APPROVED'&&row.logo_url?'/api/logo/'+row.logo_url:null,
      x:held?row.x_handle:null,
      website:held?row.website:null,
      checkoutInProgress,
      canClaim:state==='LIVE'&&paymentReady&&!row.disabled&&!checkoutInProgress,
      refundStatus:held?row.refund_status:null,
    };
  });
  const raisedUnits=slots.reduce((total:bigint,slot:any)=>total+BigInt(slot.paidUnits||0),BigInt(0));
  const count=slots.filter((slot:any)=>slot.holder).length;
  const targetUnits=BigInt(campaignRow.target_units);
  const thresholdUnits=BigInt(campaignRow.threshold_units);
  return {
    slots,
    qrPaymentsReady:(env as any).QR_CHECKOUT_ENABLED==='1',
    raised:Number(raisedUnits)/1_000_000,
    raisedUnits:raisedUnits.toString(),
    raisedDisplay:displayUnits(raisedUnits),
    count,
    target:Number(targetUnits)/1_000_000,
    targetUnits:targetUnits.toString(),
    targetDisplay:displayUnits(targetUnits),
    threshold:Number(thresholdUnits)/1_000_000,
    thresholdUnits:thresholdUnits.toString(),
    thresholdDisplay:displayUnits(thresholdUnits),
    policy:c.policy,
    paymentsReady:paymentReady,
    claimsOpen:state==='LIVE'&&paymentReady,
    serverNow:now,
    auction:{
      status:state,
      storedStatus:campaignRow.status,
      startsAt:campaignRow.starts_at,
      endsAt:campaignRow.ends_at,
      durationSeconds:campaignRow.duration_seconds,
      finalValueUnits:campaignRow.final_value_units,
      finalValue:campaignRow.final_value_units?displayUnits(campaignRow.final_value_units):null,
      finalHolderCount:campaignRow.final_holder_count,
      finalizedAt:campaignRow.finalized_at,
    },
  };
}

export async function rpc(c:any,method:string,params:any[]){
  return readRpc(c,method,params,async()=>{
    await consumeBudget((env as any).DB,'rpc:global',1800);
    await consumeBudget((env as any).DB,`rpc:chain:${Number(c.chainId)}`,900);
  }) as Promise<any>;
}

export function validateConfig(c:any){
  if(!Number.isInteger(c.target)||c.target!==2200)throw new Error('Campaign target must remain $2,200.');
  if(!ready(c))throw new Error('The treasury must be Manish’s configured receiving wallet: '+TREASURY_WALLET_ADDRESS);
  if(!Number.isInteger(c.confirmations)||c.confirmations<1||c.confirmations>100)throw new Error('Confirmations must be between 1 and 100.');
  if(!Number.isInteger(c.reservationMinutes)||c.reservationMinutes<5||c.reservationMinutes>60)throw new Error('Reservation duration must be between 5 and 60 minutes.');
  if(!Number.isInteger(c.maxUploadMB)||c.maxUploadMB<1||c.maxUploadMB>10)throw new Error('Logo limit must be between 1 and 10 MB.');
  const rpcUrl=new URL(c.rpc),explorerUrl=new URL(c.explorer);
  for(const url of [rpcUrl,explorerUrl])if(url.protocol!=='https:'||url.username||url.password||url.hostname==='localhost'||/^(127\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname))throw new Error('Use public HTTPS network URLs.');
}

export async function sendSponsorEmail(to:string,subject:string,text:string,type?:string,notificationId?:string){
  const key=(env as any).RESEND_API_KEY,from=(env as any).SPONSOR_FROM_EMAIL;
  return sendTransactionalEmail({key,from,to,subject,text,type,notificationId});
}
