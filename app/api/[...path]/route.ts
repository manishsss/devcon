/* eslint-disable @typescript-eslint/no-explicit-any */
import { cancelCheckout } from '@/lib/checkout-cancellation';
import { queueSponsorCancellation } from '@/lib/sponsor-cancellation';
import { recordVerifiedRefund } from '@/lib/refund-confirmation';
import { env } from 'cloudflare:workers';
import {paymentPreflight,verifyPayment,monitorPayments} from '@/lib/payment';
import {admin,closeManualAuction,config,db,defaults,dispatchNotification,initialize,inventory,positions,ready,rpc,settleCampaign,sendSponsorEmail,validateConfig} from '@/lib/campaign';
import {AUCTION_DURATION_MS,USDC_SCALE,claimPriceUnits,formatUsdcUnits,initialPriceUnits} from '@/lib/auction';
import { paymentRail } from '@/lib/payment-networks';
import { checkoutDigest,createAuthorization,verifyAuthorization } from '@/lib/checkout-authorization';

export const dynamic='force-dynamic';
const json=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const sameOrigin=(request:Request)=>{const origin=request.headers.get('origin');return !origin||new URL(origin).origin===new URL(request.url).origin;};
const normalizeUrl=(value:string)=>value&&!/^https?:\/\//i.test(value)?'https://'+value:value;
const displayUnits=(units:bigint)=>formatUsdcUnits(units,units%USDC_SCALE===BigInt(0)?0:2);

async function limitedForm(request:Request,maxBytes:number){
  if(Number(request.headers.get('content-length')||0)>maxBytes)throw new Error('The uploaded request is too large.');
  const reader=request.body?.getReader();
  if(!reader)throw new Error('Sponsor details are required.');
  const chunks:Uint8Array<ArrayBuffer>[]=[];
  let size=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>maxBytes){await reader.cancel();throw new Error('The uploaded request is too large.');}
    chunks.push(new Uint8Array(value));
  }
  return new Response(new Blob(chunks),{headers:{'content-type':request.headers.get('content-type')||''}}).formData();
}

async function validateLogo(file:File,maxUploadMB:number){
  if(!file||!file.size)throw new Error('Upload a PNG, JPG or SVG logo.');
  if(file.size>maxUploadMB*1048576)throw new Error(`Logo must be under ${maxUploadMB} MB.`);
  const bytes=new Uint8Array(await file.arrayBuffer());
  let mime='';
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)mime='image/png';
  else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
  else{
    const svg=new TextDecoder().decode(bytes);
    if(!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)||/<(script|foreignObject|iframe|image|use|style|a)\b|\bon\w+\s*=|href\s*=|url\s*\(|<!DOCTYPE|<!ENTITY/i.test(svg))throw new Error('Use a static SVG without links, scripts or embedded resources.');
    mime='image/svg+xml';
  }
  return {bytes,mime};
}

async function adminPayload(){
  await monitorPayments();
  const publicInventory=await inventory();
  const slots=await db().prepare('SELECT * FROM slots ORDER BY id').all();
  const claims=await db().prepare(`SELECT
    sp.id AS sponsorshipId,sp.slot_number AS slotId,sp.position,sp.claim_price_units AS claimPriceUnits,sp.previous_holder_sponsorship_id AS previousHolderSponsorshipId,sp.claim_sequence AS claimSequence,sp.is_challenge AS isChallenge,sp.status AS sponsorshipStatus,sp.reserved_until AS reservedUntil,sp.created_at AS createdAt,
    s.id AS sponsorId,s.project_name AS project,s.contact_name AS contact,s.x_handle AS x,s.email,s.website,s.wallet_address AS wallet,s.logo_url AS logo,s.logo_status AS logoStatus,s.description,
    p.id AS paymentId,p.status AS paymentStatus,p.transaction_hash AS tx,p.confirmations,p.chain,p.chain_id AS chainId,p.token,p.amount,p.amount_units AS amountUnits,p.confirmed_at AS confirmedAt,p.refund_status AS refundStatus,p.refund_amount_units AS refundAmountUnits,p.refund_transaction_hash AS refundTx,p.refund_note AS refundNote,p.refund_error AS refundError,p.refund_updated_at AS refundUpdatedAt,json_extract(p.verification_config,'$.explorer') AS explorer
    FROM sponsorships sp
    JOIN sponsors s ON s.id=sp.sponsor_id
    JOIN payments p ON p.sponsorship_id=sp.id
    ORDER BY sp.slot_number,sp.created_at DESC`).all();
  const notifications=await db().prepare(`SELECT id,type,recipient,subject,status,last_error AS lastError,created_at AS createdAt,sent_at AS sentAt,sponsorship_id AS sponsorshipId
    FROM notifications ORDER BY created_at DESC LIMIT 100`).all();
  return {
    config:await config(),
    slots:slots.results,
    claims:claims.results,
    notifications:notifications.results,
    inventory:publicInventory,
    emailDeliveryReady:Boolean((env as any).RESEND_API_KEY&&(env as any).SPONSOR_FROM_EMAIL),
  };
}

async function route(request:Request,context:any){
  try{
    const {path}=await context.params;
    const endpoint=path.join('/');
    if(request.method!=='GET'&&!sameOrigin(request))return json({error:'Invalid request origin.'},403);

    if(request.method==='GET'&&endpoint==='inventory'){
      await monitorPayments();
      return json(await inventory());
    }

    if(request.method==='GET'&&path[0]==='logo'){
      const sponsor:any=await db().prepare(`SELECT s.logo_url
        FROM sponsors s
        JOIN sponsorships sp ON sp.sponsor_id=s.id
        JOIN payments p ON p.sponsorship_id=sp.id
        JOIN slots sl ON sl.holder_sponsorship_id=sp.id
        WHERE s.logo_url=? AND s.logo_status='APPROVED' AND p.status='CONFIRMED'`).bind(path[1]).first();
      if(!sponsor)return json({error:'Logo unavailable.'},404);
      const object=await (env as any).BUCKET.get(sponsor.logo_url);
      if(!object)return json({error:'Logo unavailable.'},404);
      return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/png','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
    }

    if(path[0]==='admin-logo'){
      await admin();
      const sponsor:any=await db().prepare('SELECT id,logo_url FROM sponsors WHERE id=?').bind(path[1]).first();
      if(!sponsor)return json({error:'Sponsor unavailable.'},404);
      if(request.method==='GET'){
        const object=await (env as any).BUCKET.get(sponsor.logo_url);
        if(!object)return json({error:'Logo unavailable.'},404);
        return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/png','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
      }
      const current=await config(),form=await request.formData(),file=form.get('logo') as File;
      const {bytes,mime}=await validateLogo(file,current.maxUploadMB);
      await (env as any).BUCKET.put(sponsor.logo_url,bytes,{httpMetadata:{contentType:mime}});
      await db().prepare("UPDATE sponsors SET logo_status='APPROVED' WHERE id=?").bind(sponsor.id).run();
      return json({ok:true});
    }

    if(endpoint.startsWith('admin')){
      await admin();
      await initialize();
      await settleCampaign();
      if(request.method==='GET')return json(await adminPayload());
      const body:any=await request.json();
      if(endpoint==='admin/config'){
        const campaign:any=await db().prepare('SELECT status FROM auction_campaign WHERE id=1').first();
        if(campaign?.status!=='UPCOMING')throw new Error('Payment configuration is locked after the auction launches.');
        const existing=await config();
        const next={...existing,treasury:String(body.treasury||'').trim(),reservationMinutes:Number(body.reservationMinutes),maxUploadMB:Number(body.maxUploadMB),policy:String(body.policy||existing.policy),target:2200};
        validateConfig(next);
        delete (next as any).rpcByChain;
        await db().prepare('INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').bind(JSON.stringify(next)).run();
        return json({ok:true});
      }
      if(endpoint==='admin/auction/close'){
        return json({ok:true,auction:await closeManualAuction()});
      }
      if(endpoint==='admin/auction/launch'){
        const current=await config();
        validateConfig(current);
        const now=Date.now(),endsAt=(env as any).MANUAL_AUCTION_ENABLED==='1'?null:now+AUCTION_DURATION_MS;
        const result=await db().prepare("UPDATE auction_campaign SET status='LIVE',starts_at=?,ends_at=? WHERE id=1 AND status='UPCOMING' AND starts_at IS NULL").bind(now,endsAt).run();
        if(!result.meta.changes)throw new Error('The auction has already been launched and cannot be restarted.');
        return json({ok:true,startsAt:now,endsAt});
      }
      if(endpoint==='admin/slot'){
        if(!Number.isInteger(body.id)||body.id<1||body.id>8)throw new Error('Invalid slot.');
        const result=await db().prepare('UPDATE slots SET disabled=? WHERE id=? AND order_id IS NULL').bind(body.disabled?1:0,body.id).run();
        if(!result.meta.changes)throw new Error('A slot with an active checkout cannot be changed.');
        return json({ok:true});
      }
      if(endpoint==='admin/review'){
        if(!['APPROVED','REJECTED','REPLACEMENT_REQUESTED'].includes(body.action))throw new Error('Invalid logo review action.');
        const sponsor:any=await db().prepare('SELECT * FROM sponsors WHERE id=?').bind(body.sponsorId).first();
        if(!sponsor)throw new Error('Sponsor unavailable.');
        await db().prepare('UPDATE sponsors SET logo_status=? WHERE id=?').bind(body.action,sponsor.id).run();
        const human=body.action==='APPROVED'?'approved':body.action==='REJECTED'?'rejected':'marked for replacement';
        const emailSent=await sendSponsorEmail(sponsor.email,'Devcon sponsorship logo update',`Your uploaded logo was ${human}. Contact Manish if a replacement is needed.`);
        return json({ok:true,emailSent});
      }
      if(endpoint==='admin/cancel-sponsor') return json(await queueSponsorCancellation(String(body.paymentId||''),String(body.reason||'')));
      if(endpoint==='admin/refund'){
        if(!['REFUND_PROCESSING','REFUNDED','REFUND_FAILED'].includes(body.status))throw new Error('Choose a valid refund status.');
        const payment:any=await db().prepare("SELECT p.*,sp.status AS sponsorship_status FROM payments p JOIN sponsorships sp ON sp.id=p.sponsorship_id WHERE p.id=? AND p.refund_status!='NONE'").bind(body.paymentId).first();
        if(!payment)throw new Error('This payment is not queued for a refund.');
        if(payment.refund_status==='REFUNDED')throw new Error('A completed refund cannot be changed.');
        const note=String(body.note||'').trim();
        const refundTx=String(body.refundTx||'').trim().toLowerCase();
        if(body.status==='REFUNDED'&&!/^0x[0-9a-fA-F]{64}$/.test(refundTx))throw new Error('Record the confirmed on-chain refund transaction hash.');
        if(body.status==='REFUND_FAILED'&&!note)throw new Error('Record why the refund failed.');
        if(body.status==='REFUNDED'){
          await recordVerifiedRefund(payment,refundTx,note);
          return json({ok:true});
        }
        const now=Date.now();
        await db().batch([
          db().prepare(`UPDATE payments SET refund_status=?,refund_transaction_hash=?,refund_note=?,refund_error=?,refund_updated_at=? WHERE id=? AND refund_status!='REFUNDED'`)
            .bind(body.status,refundTx||null,note||null,body.status==='REFUND_FAILED'?note:null,now,payment.id),
          db().prepare('UPDATE sponsorships SET updated_at=? WHERE id=?').bind(now,payment.sponsorship_id),
        ]);
        return json({ok:true});
      }
      if(endpoint==='admin/notification/retry'){
        const sent=await dispatchNotification(String(body.id||''));
        return json({ok:true,emailSent:sent});
      }
      return json({error:'Admin action not found.'},404);
    }

    if(request.method==='POST'&&['reserve','checkout/authorize'].includes(endpoint)){
      await initialize();
      const now=Date.now();
      const campaign:any=await settleCampaign(now);
      const current=await config();
      if(!ready(current))return json({error:'Payment configuration is incomplete. The private administrator must configure the treasury before the auction can launch.'},503);
      if(campaign?.status!=='LIVE'||(campaign.ends_at!==null&&now>=campaign.ends_at))return json({error:campaign?.status==='UPCOMING'?'The four-day auction has not launched yet.':'The auction is closed. No new claims are accepted.'},409);
      const form=await limitedForm(request,(current.maxUploadMB*1048576)+65536),slotNumber=Number(form.get('slot'));
      const {network,asset}=paymentRail(form.get('chainId'),form.get('token'));
      const rail={rpc:current.rpcByChain[network.id],chainId:network.id};
      if(!Number.isInteger(slotNumber)||slotNumber<1||slotNumber>8)throw new Error('Choose one of the eight sponsorship slots.');
      const values={
        project:String(form.get('project')||'').trim(),
        x:String(form.get('x')||'').trim(),
        website:normalizeUrl(String(form.get('website')||'').trim()),
        contact:String(form.get('contact')||'').trim(),
        email:String(form.get('email')||'').trim(),
        wallet:String(form.get('wallet')||'').trim().toLowerCase(),
        description:String(form.get('description')||'').trim(),
      };
      if(!values.project||!values.x||!values.contact||!values.email||!values.wallet)throw new Error('Complete every required sponsor field.');
      if(Object.values(values).some(value=>value.length>500))throw new Error('Sponsor details are too long.');
      if(!/^@[A-Za-z0-9_]{1,15}$/.test(values.x))throw new Error('Enter a valid X handle beginning with @.');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))throw new Error('Enter a valid email address.');
      if(values.website&&!/^https:\/\/[^\s]+$/i.test(values.website))throw new Error('Enter a valid HTTPS project website.');
      if(!/^0x[0-9a-fA-F]{40}$/.test(values.wallet))throw new Error('Enter a valid EVM payment wallet address.');
      if(form.get('terms')!=='accepted')throw new Error('Confirm that this is a sponsorship claim payment, not a donation.');
      const {bytes,mime}=await validateLogo(form.get('logo') as File,current.maxUploadMB);

      const slot:any=await db().prepare('SELECT price,disabled,order_id,current_price_units,holder_sponsorship_id,claim_count FROM slots WHERE id=?').bind(slotNumber).first();
      if(!slot||slot.disabled)return json({error:'This spot is paused.'},409);
      if(slot.order_id)return json({error:'Another project is already checking out this spot. Try again when that reservation expires.'},409);
      const startingUnits=initialPriceUnits(slotNumber);
      const currentUnits=slot.current_price_units?BigInt(slot.current_price_units):null;
      const requiredUnits=claimPriceUnits(startingUnits,currentUnits);
      const priceDisplay=displayUnits(requiredUnits);
      const origin=new URL(request.url).origin;
      const digest=await checkoutDigest(form,origin,current.treasury,requiredUnits.toString());
      if(endpoint==='checkout/authorize')return json(await createAuthorization({wallet:values.wallet,digest,origin,treasury:current.treasury,price:priceDisplay,project:values.project,slot:slotNumber,network:network.name,chainId:network.id,expiresAt:Math.min(Date.now()+300000,campaign.ends_at??Infinity)}));
      const authorizationId=await verifyAuthorization(form,values.wallet,digest);
      if(Number(await rpc(rail,'eth_chainId',[]))!==network.id)throw new Error('The selected network is unavailable. No payment has been requested.');
      if(Number(await rpc(rail,'eth_call',[{to:asset.address,data:'0x313ce567'},'latest']))!==asset.decimals)throw new Error('Token validation failed. No payment has been requested.');
      const balance=BigInt(await rpc(rail,'eth_call',[{to:asset.address,data:'0x70a08231'+values.wallet.slice(2).toLowerCase().padStart(64,'0')},'latest']));
      if(balance<requiredUnits)throw new Error('Your wallet needs at least '+priceDisplay+' USDC on '+network.name+' before reserving this spot.');
      const sponsorId=crypto.randomUUID(),sponsorshipId=crypto.randomUUID(),paymentId=crypto.randomUUID(),secret=crypto.randomUUID();
      const createdAt=Date.now(),reservedUntil=Math.min(createdAt+current.reservationMinutes*60000,campaign.ends_at??Infinity),logoKey=sponsorId;
      if(reservedUntil<=createdAt)return json({error:'The auction is closed.'},409);
      const startBlock=Number(await rpc(rail,'eth_blockNumber',[]));
      const snapshot={startBlock,scanBlock:startBlock,chainName:network.name,chainId:network.id,rpc:rail.rpc,explorer:network.explorer,tokenAddress:asset.address,token:asset.symbol,treasury:current.treasury,decimals:asset.decimals,confirmations:network.confirmations};
      await (env as any).BUCKET.put(logoKey,bytes,{httpMetadata:{contentType:mime}});
      try{await db().batch([
        db().prepare('UPDATE checkout_authorizations SET consumed_by=? WHERE id=? AND consumed_by IS NULL AND expires_at>?').bind(sponsorshipId,authorizationId,createdAt),
        db().prepare(`UPDATE slots SET order_id=?,expires=? WHERE id=? AND order_id IS NULL AND disabled=0
          AND holder_sponsorship_id IS ? AND current_price_units IS ?
          AND EXISTS(SELECT 1 FROM checkout_authorizations WHERE id=? AND consumed_by=?)
          AND NOT EXISTS(SELECT 1 FROM sponsorships sp JOIN payments p ON p.sponsorship_id=sp.id
            WHERE LOWER(p.wallet_address)=? AND sp.status IN ('RESERVED','PAYMENT_PENDING') AND sp.reserved_until>?)
          AND EXISTS(SELECT 1 FROM auction_campaign WHERE id=1 AND status='LIVE' AND (ends_at IS NULL OR ends_at>?))`)
          .bind(sponsorshipId,reservedUntil,slotNumber,slot.holder_sponsorship_id||null,slot.current_price_units||null,authorizationId,sponsorshipId,values.wallet,createdAt,createdAt),
        db().prepare('INSERT INTO sponsors(id,project_name,x_handle,website,contact_name,email,wallet_address,logo_url,logo_status,description,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM slots WHERE id=? AND order_id=?)').bind(sponsorId,values.project,values.x,values.website||null,values.contact,values.email,values.wallet,logoKey,'PENDING_REVIEW',values.description,createdAt,slotNumber,sponsorshipId),
        db().prepare("INSERT INTO sponsorships(id,secret,slot_number,position,price_usd,claim_price_units,previous_holder_sponsorship_id,is_challenge,status,sponsor_id,reserved_until,terms_accepted,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,'RESERVED',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM slots WHERE id=? AND order_id=?)").bind(sponsorshipId,secret,slotNumber,positions[slotNumber-1],Number(requiredUnits/USDC_SCALE),requiredUnits.toString(),slot.holder_sponsorship_id||null,slot.holder_sponsorship_id?1:0,sponsorId,reservedUntil,1,createdAt,createdAt,slotNumber,sponsorshipId),
        db().prepare("INSERT INTO payments(id,sponsor_id,sponsorship_id,slot_id,wallet_address,token,token_contract,chain,chain_id,amount,amount_usd,amount_units,status,confirmations,verification_config,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING',0,?,? WHERE EXISTS(SELECT 1 FROM slots WHERE id=? AND order_id=?)").bind(paymentId,sponsorId,sponsorshipId,slotNumber,values.wallet,asset.symbol,asset.address,network.name,network.id,priceDisplay,Number(requiredUnits/USDC_SCALE),requiredUnits.toString(),JSON.stringify(snapshot),createdAt,slotNumber,sponsorshipId),
      ]);}catch(error){await (env as any).BUCKET.delete(logoKey);throw error;}
      const held:any=await db().prepare('SELECT order_id FROM slots WHERE id=?').bind(slotNumber).first();
      if(held?.order_id!==sponsorshipId){
        await db().batch([
          db().prepare('DELETE FROM payments WHERE id=?').bind(paymentId),
          db().prepare('DELETE FROM sponsorships WHERE id=?').bind(sponsorshipId),
          db().prepare('DELETE FROM sponsors WHERE id=?').bind(sponsorId),
        ]);
        await (env as any).BUCKET.delete(logoKey);
        return json({error:'This spot was reserved first, or your wallet already has an active checkout. Finish that payment or wait for its reservation to expire.'},409);
      }
      return json({
        id:sponsorshipId,secret,reservedUntil,price:priceDisplay,priceUnits:requiredUnits.toString(),position:positions[slotNumber-1],
        currentPrice:currentUnits===null?null:displayUnits(currentUnits),isChallenge:Boolean(slot.holder_sponsorship_id),
        project:values.project,wallet:values.wallet,treasury:current.treasury,chainName:network.name,chainId:network.id,
        token:asset.symbol,tokenLabel:asset.label,tokenAddress:asset.address,decimals:asset.decimals,explorer:network.explorer,gas:network.gas,
      });
    }

    if(request.method==='POST'&&endpoint==='verify'){
      const body=await request.json();
      return json(await verifyPayment(body));
    }
    if(request.method==='POST'&&endpoint==='checkout/cancel')return json(await cancelCheckout(await request.json()));
    if(request.method==='POST'&&endpoint==='checkout/preflight')return json(await paymentPreflight(await request.json()));
    return json({error:'Not found.'},404);
  }catch(error:any){
    console.error('Campaign request failed',error?.message);
    return json({error:error?.message||'Request unavailable. Please try again.'},400);
  }
}

export const GET=route;
export const POST=route;
