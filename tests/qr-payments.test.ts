import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { env } from './runtime.mjs';
import { database } from './database.mjs';
import { initialize, inventory, settleCampaign } from '../lib/campaign';
import { POST } from '../app/api/[...path]/route';
import { cancelCheckout } from '../lib/checkout-cancellation';
import { monitorPayments, qrPaymentDetails, verifyPayment, verifyRefund } from '../lib/payment';
import { allocateQrAmount, exactUsdcAmount, qrPriceAdjustment, qrPaymentUri } from '../lib/qr-payment';
import { PAYMENT_NETWORKS, TREASURY_WALLET_ADDRESS } from '../lib/payment-networks';

const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40);
const network=PAYMENT_NETWORKS.find(item=>item.id===8453)!;
const token=network.tokens[0].address,treasury=TREASURY_WALLET_ADDRESS;
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64);
const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic=(address:string)=>'0x'+address.slice(2).toLowerCase().padStart(64,'0');
const originalFetch=globalThis.fetch;
let db:ReturnType<typeof database>,transaction:any,receipt:any,block:any;
let balance=BigInt(1000000000),head=120;
beforeEach(async()=>{
  db=database();transaction=null;receipt=null;block=null;balance=BigInt(1000000000);head=120;
  Object.assign(env,{DB:db,UNIQUE_AMOUNT_QR_ENABLED:'1',MANUAL_AUCTION_ENABLED:undefined,TREASURY_WALLET_ADDRESS:treasury,BUCKET:{put:async()=>{},delete:async()=>{}}});
  await initialize();
  db.sqlite.prepare("UPDATE auction_campaign SET status='LIVE',starts_at=?,ends_at=? WHERE id=1").run(Date.now()-60000,Date.now()+3600000);
  globalThis.fetch=async(_input,init)=>{
    const {method,params}=JSON.parse(String(init?.body));
    const value=method==='eth_chainId'?'0x2105':method==='eth_blockNumber'?'0x'+head.toString(16):method==='eth_call'?(params[0].data==='0x313ce567'?'0x6':'0x'+balance.toString(16)):method==='eth_getLogs'?(receipt?.logs||[]):method==='eth_getTransactionByHash'?transaction:method==='eth_getTransactionReceipt'?receipt:block;
    return Response.json({jsonrpc:'2.0',id:1,result:value});
  };
});
afterEach(()=>{globalThis.fetch=originalFetch;delete (env as {UNIQUE_AMOUNT_QR_ENABLED?:string}).UNIQUE_AMOUNT_QR_ENABLED;db.sqlite.close();});
function form(slot='1',payer=wallet){
  const data=new FormData();
  for(const [key,value]of Object.entries({slot,chainId:'8453',token:'USDC',project:'QR Brand',x:'@qrbrand',email:'qr@example.test',contact:'QR',wallet:payer,terms:'accepted'}))data.set(key,value);
  data.set('logo',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'logo.png',{type:'image/png'}));return data;
}
async function reserve(slot='1',ip='192.0.2.1',payer=wallet,origin:string|null='https://site.test'){
  const headers:Record<string,string>={'cf-connecting-ip':ip};if(origin)headers.origin=origin;
  const response=await POST(new Request('https://site.test/api/checkout/qr',{method:'POST',headers,body:form(slot,payer)}),{params:Promise.resolve({path:['checkout','qr']})});
  return {status:response.status,value:await response.json() as any};
}
function transfer(amountUnits:string,payer=wallet,tx=hash){
  const number=head+1,blockNumber='0x'+number.toString(16);
  transaction={hash:tx,from:payer,to:token,value:'0x0',input:'0xa9059cbb'+treasury.slice(2).padStart(64,'0')+BigInt(amountUnits).toString(16).padStart(64,'0'),blockHash,blockNumber};
  receipt={transactionHash:tx,status:'0x1',blockHash,blockNumber,logs:[{address:token,topics:[transferTopic,topic(payer),topic(treasury)],data:'0x'+BigInt(amountUnits).toString(16),transactionHash:tx,blockHash,removed:false}]};
  block={number:blockNumber,hash:blockHash,timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)};head=number+20;
}
test('QR request encodes contract, chain, treasury and integer units with no rounding',async()=>{
  const uri=qrPaymentUri({chainId:8453,tokenAddress:token,treasury,amountUnits:'350000137'});
  assert.equal(uri,`ethereum:${token}@8453/transfer?address=${treasury}&uint256=350000137`);
  assert.equal(exactUsdcAmount('350000137'),'350.000137');
  assert.match(await QRCode.toDataURL(uri),/^data:image\/png;base64,iVBOR/);
});
test('QR checkout needs no signature, preserves nominal price and discounts by less than one USDC with at most three decimals',async()=>{
  const r=await reserve();assert.equal(r.status,200);
  assert.equal(r.value.paymentMode,'qr');assert.equal(r.value.claimPriceUnits,'350000000');
  const discount=BigInt(r.value.claimPriceUnits)-BigInt(r.value.priceUnits);assert.ok(discount>0&&discount<BigInt(1000000));
  assert.equal(BigInt(r.value.priceUnits)%BigInt(1000),BigInt(0));assert.match(r.value.price,/^349\.\d{1,3}$/);
  assert.equal(r.value.priceAdjustment,qrPriceAdjustment(r.value.claimPriceUnits,r.value.priceUnits));
  assert.equal(r.value.price,exactUsdcAmount(r.value.priceUnits));assert.ok(r.value.paymentUri.includes('uint256='+r.value.priceUnits));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM checkout_authorizations').get()!.n,0);
});
test('existing signed reserve route still rejects unsigned requests',async()=>{
  const r=await POST(new Request('https://site.test/api/reserve',{method:'POST',headers:{origin:'https://site.test'},body:form()}),{params:Promise.resolve({path:['reserve']})});assert.equal(r.status,400);
});
test('QR checkout fails closed when disabled, cross-origin, closed or underfunded',async()=>{
  delete (env as {UNIQUE_AMOUNT_QR_ENABLED?:string}).UNIQUE_AMOUNT_QR_ENABLED;assert.equal((await reserve()).status,404);(env as {UNIQUE_AMOUNT_QR_ENABLED?:string}).UNIQUE_AMOUNT_QR_ENABLED='1';
  assert.equal((await reserve('1','192.0.2.2',wallet,null)).status,403);
  assert.equal((await reserve('1','192.0.2.2',wallet,'https://evil.test')).status,403);
  const insecure=await POST(new Request('http://site.test/api/checkout/qr',{method:'POST',headers:{origin:'http://site.test'},body:form()}),{params:Promise.resolve({path:['checkout','qr']})});assert.equal(insecure.status,403);
  balance=BigInt(349000000);assert.equal((await reserve()).status,400);
  db.sqlite.prepare("UPDATE auction_campaign SET status='UPCOMING' WHERE id=1").run();assert.equal((await reserve('1','192.0.2.3')).status,409);
});
test('client lease and atomic slot reservation prevent parallel QR hoarding',async()=>{
  const results=await Promise.all([reserve('1','192.0.2.1'),reserve('2','192.0.2.1',other)]);
  assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===429).length,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sponsorships').get()!.n,1);
});
test('amount allocation skips collisions and never reuses a cancelled or expired amount',async()=>{
  const input={id:'first',chainId:8453,tokenAddress:token,treasury,baseUnits:BigInt(350000000),clientKey:'first',reservedUntil:100};
  const a=await allocateQrAmount(db,input,0,136);
  const b=await allocateQrAmount(db,{...input,id:'second',clientKey:'second'},1000,136);
  assert.equal(a,BigInt(349863000));assert.equal(b,BigInt(349862000));
  assert.throws(()=>db.sqlite.prepare('DELETE FROM qr_payment_amounts').run());
  assert.throws(()=>db.sqlite.prepare("UPDATE qr_payment_amounts SET amount_units='1'").run());
});
test('automatic discovery confirms exact discounted payment once and counts only funds received',async()=>{
  const r=await reserve();transfer(r.value.priceUnits);
  const counts=await monitorPayments();assert.equal(counts.succeeded,1);
  assert.equal(db.sqlite.prepare('SELECT status FROM payments').get()!.status,'CONFIRMED');
  assert.equal((await inventory()).raisedUnits,r.value.priceUnits);
  assert.equal((await verifyPayment({id:r.value.id,secret:r.value.secret})).price,r.value.price);
  assert.equal(db.sqlite.prepare('SELECT claim_count FROM slots WHERE id=1').get()!.claim_count,1);
});
test('rounded amount, different sender and native transfers cannot claim the slot',async()=>{
  const r=await reserve();transfer('350000000');
  await assert.rejects(()=>verifyPayment({id:r.value.id,secret:r.value.secret,tx:hash}),/exact token amount/);
  transfer(r.value.priceUnits,other);await assert.rejects(()=>verifyPayment({id:r.value.id,secret:r.value.secret,tx:hash}),/sender/);
  transfer(r.value.priceUnits);transaction.value='0x1';await assert.rejects(()=>verifyPayment({id:r.value.id,secret:r.value.secret,tx:hash}),/native value/);
  assert.equal(db.sqlite.prepare('SELECT holder_sponsorship_id FROM slots WHERE id=1').get()!.holder_sponsorship_id,null);
});
test('payment after QR cancellation is discovered for a full manual refund, never a holder',async()=>{
  const r=await reserve();await cancelCheckout({id:r.value.id,secret:r.value.secret});transfer(r.value.priceUnits);
  const result=await monitorPayments();assert.equal(result.succeeded,1);
  const row=db.sqlite.prepare('SELECT status,refund_status,refund_amount_units FROM payments').get()!;
  assert.equal(row.status,'LATE_CONFIRMED');assert.equal(row.refund_status,'REFUND_PENDING');assert.equal(row.refund_amount_units,r.value.priceUnits);
  assert.equal(db.sqlite.prepare('SELECT holder_sponsorship_id FROM slots WHERE id=1').get()!.holder_sponsorship_id,null);
});
test('old expired QR payments remain monitored beyond one hour',async()=>{
  const r=await reserve();db.sqlite.prepare('UPDATE sponsorships SET reserved_until=? WHERE id=?').run(Date.now()-7200000,r.value.id);
  db.sqlite.prepare("UPDATE payments SET status='EXPIRED'").run();transfer(r.value.priceUnits);
  assert.equal((await monitorPayments()).succeeded,1);assert.equal(db.sqlite.prepare('SELECT status FROM payments').get()!.status,'LATE_CONFIRMED');
});
test('eligible refund verifies the entire discounted QR amount',async()=>{
  const r=await reserve();transfer(r.value.priceUnits);await verifyPayment({id:r.value.id,secret:r.value.secret,tx:hash});
  const payment:any=db.sqlite.prepare('SELECT * FROM payments').get();payment.refund_amount_units=r.value.priceUnits;
  receipt.logs[0].topics=[transferTopic,topic(treasury),topic(wallet)];await verifyRefund(payment,hash);
  receipt.logs[0].data='0x'+(350000000).toString(16);await assert.rejects(()=>verifyRefund(payment,hash),/full original token amount/);
});

test('takeover prices use nominal amount while the full previous QR amount is refunded',async()=>{
  const first=await reserve();transfer(first.value.priceUnits);await verifyPayment({id:first.value.id,secret:first.value.secret,tx:hash});
  const next=await reserve('1','192.0.2.2',other);assert.equal(next.status,200);assert.equal(next.value.claimPriceUnits,'525000000');
  const newHash='0x'+'c'.repeat(64);transfer(next.value.priceUnits,other,newHash);await verifyPayment({id:next.value.id,secret:next.value.secret,tx:newHash});
  const previous=db.sqlite.prepare('SELECT refund_amount_units,refund_status FROM payments WHERE sponsorship_id=?').get(first.value.id)!;
  assert.equal(previous.refund_amount_units,first.value.priceUnits);assert.equal(previous.refund_status,'REFUND_PENDING');
  assert.equal((await inventory()).raisedUnits,next.value.priceUnits);
});

test('a different invoice cannot insert a payment using another QR amount',async()=>{
  const first=await reserve();await cancelCheckout({id:first.value.id,secret:first.value.secret});
  const second=await reserve('2','192.0.2.2',other);assert.equal(second.status,200);
  assert.throws(()=>db.sqlite.prepare(`INSERT INTO payments(id,sponsor_id,sponsorship_id,slot_id,wallet_address,token,token_contract,chain,chain_id,amount,amount_usd,amount_units,verification_config,created_at)
    SELECT 'collision',sponsor_id,sponsorship_id,slot_id,wallet_address,token,token_contract,chain,chain_id,amount,amount_usd,?,verification_config,created_at FROM payments WHERE sponsorship_id=?`).run(first.value.priceUnits,second.value.id),/another QR checkout/);
});

test('listed-price balance can pay discounted QR without extra funds; underfunded attempts do not burn a lease',async()=>{
  balance=BigInt(349000000);assert.equal((await reserve()).status,400);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM qr_payment_amounts').get()!.n,0);
  balance=BigInt(350000000);const r=await reserve();assert.equal(r.status,200);assert.ok(BigInt(r.value.priceUnits)<balance);
});

test('QR rate limits, unknown secrets and maintenance credentials fail closed',async()=>{
  const r=await reserve();await assert.rejects(()=>verifyPayment({id:r.value.id,secret:'wrong',tx:hash}),/unavailable/);
  await reserve('2');assert.equal((await reserve('3')).status,429);
  const request=new Request('https://site.test/api/maintenance/monitor',{method:'POST'});
  assert.equal((await POST(request,{params:Promise.resolve({path:['maintenance','monitor']})})).status,403);
});

test('restored QR details come from server records and stop being payable after cancellation',async()=>{
  const r=await reserve();const details=await qrPaymentDetails({id:r.value.id,secret:r.value.secret,treasury:other,amountUnits:'1'});
  assert.equal(details.treasury,treasury);assert.equal(details.priceUnits,r.value.priceUnits);assert.equal(details.qrPayable,true);
  assert.equal(details.paymentUri,r.value.paymentUri);assert.equal(details.wallet,wallet);
  await assert.rejects(()=>qrPaymentDetails({id:r.value.id,secret:'wrong'}),/unavailable/);
  await cancelCheckout({id:r.value.id,secret:r.value.secret});assert.equal((await qrPaymentDetails({id:r.value.id,secret:r.value.secret})).qrPayable,false);
});

test('three-decimal allocation supports the requested example and fractional takeover prices without rounding old requests',async()=>{
  const input={id:'example',chainId:8453,tokenAddress:token,treasury,baseUnits:BigInt(350000000),clientKey:'example',reservedUntil:100};
  assert.equal(exactUsdcAmount(await allocateQrAmount(db,input,0,67)),'349.932');
  const fractional=await allocateQrAmount(db,{...input,id:'fractional',clientKey:'fractional',baseUnits:BigInt(350000137)},0,0);
  assert.equal(exactUsdcAmount(fractional),'350');
  assert.equal(qrPriceAdjustment('350000137',fractional),'-0.000137');
  assert.equal(exactUsdcAmount('350000137'),'350.000137');
  assert.equal(qrPriceAdjustment('350000000','350000137'),'+0.000137');
  await assert.rejects(()=>allocateQrAmount(db,{...input,baseUnits:BigInt(0)},0,0),/at least 1 USDC/);
});

test('exhausted three-decimal pool fails closed without changing precision or reusing history',async()=>{
  const insert=db.sqlite.prepare('INSERT INTO qr_payment_amounts(id,chain_id,token_contract,treasury,amount_units,base_units,client_key,reserved_until,created_at) VALUES(?,8453,?,?,?,\'350000000\',?,0,0)');
  for(let tag=1;tag<=999;tag++)insert.run('old-'+tag,token.toLowerCase(),treasury.toLowerCase(),String(350000000-tag*1000),'old-'+tag);
  await assert.rejects(()=>allocateQrAmount(db,{id:'new',chainId:8453,tokenAddress:token,treasury,baseUnits:BigInt(350000000),clientKey:'new',reservedUntil:2000},1000,0),(error:any)=>error.status===503);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM qr_payment_amounts').get()!.n,999);
});

test('campaign settlement does not clear a funding threshold using the unpaid QR discount',async()=>{
  const r=await reserve();transfer(r.value.priceUnits);await verifyPayment({id:r.value.id,secret:r.value.secret,tx:hash});
  db.sqlite.prepare("UPDATE auction_campaign SET status='CLOSED',threshold_units='350000000'").run();
  const result=await settleCampaign();
  assert.equal(result.status,'REFUNDED');assert.equal(result.final_value_units,r.value.priceUnits);
  assert.equal(db.sqlite.prepare('SELECT refund_amount_units FROM payments').get()!.refund_amount_units,r.value.priceUnits);
});
