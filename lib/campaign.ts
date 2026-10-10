/* eslint-disable @typescript-eslint/no-explicit-any */
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { PAYMENT_NETWORKS } from './payment-networks';
import { TREASURY_WALLET_ADDRESS } from './payment-networks';
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
  rpc:'https://mainnet.base.org',
  explorer:'https://basescan.org/tx/',
  usdc:BASE_USDC,
  usdcDecimals:6,
  confirmations:12,
  reservationMinutes:15,
  maxUploadMB:5,
  policy:"The four-day campaign must reach at least 50% of the $2,200 target ($1,100). If it does not, every confirmed current sponsorship payment is queued for a full refund and the fundraiser closes. Sponsors who are successfully outbid are always eligible for a full refund of their confirmed claim payment."
};
export const positions=['Front · Upper Left','Front · Upper Right','Front · Lower Left','Front · Lower Right','Back · Upper Left','Back · Upper Right','Back · Lower Left','Back · Lower Right'];

export function db(){if(!(env as any).DB)throw new Error('Sponsorship inventory is temporarily unavailable. Please try again.');return (env as any).DB;}

export async function config(){
  const row:any=await db().prepare('SELECT value FROM settings WHERE id=1').first();
  const saved=row?JSON.parse(row.value):{};
  const runtime:any=env;
  return {
    ...defaults,
    ...saved,
    policy:defaults.policy,
    treasury:runtime.TREASURY_WALLET_ADDRESS||saved.treasury||defaults.treasury,
    rpcByChain:Object.fromEntries(PAYMENT_NETWORKS.map(network=>[network.id,runtime[`CHAIN_RPC_URL_${network.id}`]||(network.id===8453?(runtime.CHAIN_RPC_URL||saved.rpc||network.rpc):network.rpc)])),
    chainName:runtime.SUPPORTED_CHAIN||saved.chainName||defaults.chainName,
    chainId:Number(runtime.SUPPORTED_CHAIN_ID||saved.chainId||defaults.chainId),
    rpc:runtime.CHAIN_RPC_URL||saved.rpc||defaults.rpc,
    explorer:runtime.BASE_EXPLORER_URL||saved.explorer||defaults.explorer,
    usdc:runtime.USDC_CONTRACT_ADDRESS||saved.usdc||defaults.usdc,
  };
}

export function ready(c:any){return typeof c.treasury==='string'&&c.treasury.toLowerCase()===TREASURY_WALLET_ADDRESS;}

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
  const sent=await sendSponsorEmail(row.recipient,row.subject,row.body);
  if(sent){
    await db().prepare("UPDATE notifications SET status='SENT',sent_at=?,last_error=NULL WHERE id=?").bind(Date.now(),id).run();
    return true;
  }
  await db().prepare("UPDATE notifications SET status='PENDING',last_error=? WHERE id=?").bind('Email delivery is not configured or the provider rejected the request.',id).run();
  return false;
}

async function queueCampaignRefundNotifications(){
  const {results}=await db().prepare(`SELECT sp.id AS sponsorship_id,sp.slot_number,sp.claim_price_units,
    s.id AS sponsor_id,s.email,p.id AS payment_id,p.token,p.chain
    FROM slots sl
    JOIN sponsorships sp ON sp.id=sl.holder_sponsorship_id
    JOIN sponsors s ON s.id=sp.sponsor_id
    JOIN payments p ON p.sponsorship_id=sp.id
    WHERE p.status='CONFIRMED'`).all();
  for(const row of results as any[]){
    const id=`campaign-refund:${row.sponsorship_id}`;
    await queueNotification({
      id,
      sponsorId:row.sponsor_id,
      sponsorshipId:row.sponsorship_id,
      paymentId:row.payment_id,
      type:'CAMPAIGN_REFUND',
      recipient:row.email,
      subject:'Devcon campaign refund update',
      body:`The Devcon campaign did not reach its $1,100 minimum funding threshold. Your confirmed Slot ${String(row.slot_number).padStart(2,'0')} payment of $${displayUnits(row.claim_price_units)} ${row.token} on ${row.chain} is marked REFUND_PENDING. You will receive another update when the on-chain refund is recorded.`,
    });
    await dispatchNotification(id);
  }
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
      COALESCE(SUM(CAST(current_price_units AS INTEGER)),0) AS total_units
      FROM slots WHERE holder_sponsorship_id IS NOT NULL`).first();
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
    await db().batch(statements);
    if(!successful)await queueCampaignRefundNotifications();
    current=await db().prepare('SELECT * FROM auction_campaign WHERE id=1').first();
  }
  return current;
}

export async function inventory(){
  await initialize();
  const now=Date.now();
  const c=await config();
  const campaignRow:any=await settleCampaign(now) || await db().prepare('SELECT * FROM auction_campaign WHERE id=1').first();
  const state=effectiveAuctionStatus(campaignRow.status as AuctionStatus,campaignRow.ends_at,now);
  const {results}=await db().prepare(`SELECT
    sl.id,sl.price,sl.disabled,sl.order_id,sl.expires,sl.current_price_units,sl.holder_sponsorship_id,sl.claim_count,
    hs.status AS holder_status,s.project_name,s.logo_url,s.logo_status,s.x_handle,
    hp.status AS holder_payment_status,hp.refund_status
    FROM slots sl
    LEFT JOIN sponsorships hs ON hs.id=sl.holder_sponsorship_id
    LEFT JOIN sponsors s ON s.id=hs.sponsor_id
    LEFT JOIN payments hp ON hp.sponsorship_id=hs.id
    ORDER BY sl.id`).all();
  const historyRows=await db().prepare(`SELECT sp.slot_number,sp.claim_price_units
    FROM sponsorships sp JOIN payments p ON p.sponsorship_id=sp.id
    WHERE p.status='CONFIRMED' AND sp.claim_sequence IS NOT NULL
    ORDER BY sp.slot_number,sp.claim_sequence`).all();
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
      currentPrice:currentUnits===null?null:displayUnits(currentUnits),
      claimPriceUnits:nextUnits.toString(),
      claimPrice:displayUnits(nextUnits),
      claimCount:Number(row.claim_count||0),
      history:histories.get(row.id)||[],
      holder:held?{project:row.project_name,x:row.x_handle}:null,
      project:held?row.project_name:null,
      logo:held&&row.holder_payment_status==='CONFIRMED'&&row.logo_status==='APPROVED'&&row.logo_url?'/api/logo/'+row.logo_url:null,
      x:held?row.x_handle:null,
      checkoutInProgress,
      canClaim:state==='LIVE'&&paymentReady&&!row.disabled&&!checkoutInProgress,
      refundStatus:held?row.refund_status:null,
    };
  });
  const raisedUnits=slots.reduce((total:bigint,slot:any)=>total+BigInt(slot.currentPriceUnits||0),BigInt(0));
  const count=slots.filter((slot:any)=>slot.holder).length;
  const targetUnits=BigInt(campaignRow.target_units);
  const thresholdUnits=BigInt(campaignRow.threshold_units);
  return {
    slots,
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
  const response=await fetch(c.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Network verification unavailable. Try again.');
  const result:any=await response.json();
  if(result.error)throw new Error('Blockchain verification failed.');
  return result.result;
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

export async function sendSponsorEmail(to:string,subject:string,text:string){
  const key=(env as any).RESEND_API_KEY,from=(env as any).SPONSOR_FROM_EMAIL;
  if(!key||!from)return false;
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({from,to:[to],subject,text})});
    return response.ok;
  }catch{return false;}
}
