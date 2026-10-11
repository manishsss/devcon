import { beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from './runtime.mjs';
import { database } from './database.mjs';
import { dispatchNotification, initialize, inventory } from '../lib/campaign';
import { paymentPreflight, verifyPayment, verifyRefund } from '../lib/payment';
import { cancelCheckout } from '../lib/checkout-cancellation';
import { PAYMENT_NETWORKS } from '../lib/payment-networks';
import { recordVerifiedRefund } from '../lib/refund-confirmation';

const treasury = '0x7c7ddb2c72725563816d5adc7137043d831ebcbe';
const wallet = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
const hash = '0x' + 'a'.repeat(64);
const blockHash = '0x' + 'b'.repeat(64);
const topic = (address: string) => '0x' + address.slice(2).padStart(64, '0');
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const originalFetch = globalThis.fetch;
let db: ReturnType<typeof database>;
let transaction: any;
let receipt: any;
let block: any;
let head: number;
let chainId: number;

beforeEach(async () => {
  db = database();
  Object.assign(env, { DB: db, TREASURY_WALLET_ADDRESS: treasury });
  await initialize();
  const now = Date.now();
  db.sqlite.prepare("UPDATE auction_campaign SET status='LIVE', starts_at=?,ends_at=? WHERE id=1").run(now - 60_000, now + 3600_000);
  const network = PAYMENT_NETWORKS.find(item => item.id === 8453)!;
  const token = network.tokens[0].address;
  chainId = network.id;
  head = 120;
  transaction = { hash, from: wallet, to: token, value: '0x0', blockHash, blockNumber: '0x64', input: `0xa9059cbb${treasury.slice(2).padStart(64, '0')}${(350_000_000).toString(16).padStart(64, '0')}` };
  receipt = { transactionHash: hash, from: wallet, to: token, status: '0x1', blockNumber: '0x64', blockHash, logs: [{ address: token, topics: [transferTopic, topic(wallet), topic(treasury)], data: '0x' + (350_000_000).toString(16).padStart(64, '0'), transactionHash: hash, blockHash, blockNumber: '0x64', removed: false }] };
  block = { number: '0x64', hash: blockHash, timestamp: '0x' + Math.floor(now / 1000).toString(16) };
  globalThis.fetch = async (_input, init) => {
    const { method } = JSON.parse(String(init?.body));
    const results: Record<string, unknown> = { eth_chainId: '0x' + chainId.toString(16), eth_getTransactionByHash: transaction, eth_getTransactionReceipt: receipt, eth_getBlockByNumber: block, eth_blockNumber: '0x' + head.toString(16), eth_getLogs: receipt?.logs ?? [] };
    return Response.json({ jsonrpc: '2.0', id: 1, result: results[method] });
  };
});

afterEach(() => { globalThis.fetch = originalFetch; delete (env as any).RESEND_API_KEY; delete (env as any).SPONSOR_FROM_EMAIL; db.sqlite.close(); });

function seed(id = 'claim', slot = 1, payer = wallet, networkId = 8453, amount = 350, previous: string | null = null) {
  const now = Date.now();
  const network = PAYMENT_NETWORKS.find(item => item.id === networkId)!;
  const verification = { ...network, chainId: networkId, treasury, startBlock: 99 };
  db.sqlite.prepare("INSERT INTO sponsors(id,project_name,x_handle,contact_name,email,wallet_address,logo_url,created_at) VALUES(?,?,'@brand','Brand','brand@example.com',?,'logo',?)").run(id, id, payer, now);
  db.sqlite.prepare("INSERT INTO sponsorships(id,secret,slot_number,position,price_usd,claim_price_units,previous_holder_sponsorship_id,sponsor_id,reserved_until,terms_accepted,created_at,updated_at) VALUES(?,'secret',?,'Front',?,?,?,?,?,1,?,?)").run(id, slot, amount, String(amount*1000000), previous, id, now + 900_000, now - 10_000, now);
  db.sqlite.prepare("INSERT INTO payments(id,sponsor_id,sponsorship_id,slot_id,wallet_address,token,token_contract,chain,chain_id,amount,amount_usd,amount_units,verification_config,created_at) VALUES(?,?,?,?,?,'USDC',?,?,?,?,?,?,?,?)").run(id, id, id, slot, payer, network.tokens[0].address, network.name, network.id, String(amount), amount, String(amount*1000000), JSON.stringify(verification), now);
  db.sqlite.prepare('UPDATE slots SET order_id=?,expires=? WHERE id=?').run(id, now + 900_000, slot);
}

test('a valid USDC payment publishes its logo only after confirmation, and retries are idempotent', async () => {
  seed();
  assert.equal((await inventory()).slots[0].logo, null);
  assert.equal((await verifyPayment({ id: 'claim', secret: 'secret', tx: hash })).status, 'CONFIRMED');
  assert.equal((await inventory()).slots[0].logo, '/api/logo/logo');
  assert.equal((await verifyPayment({ id: 'claim', secret: 'secret', tx: hash })).status, 'CONFIRMED');
  assert.equal(db.sqlite.prepare('SELECT claim_count FROM slots WHERE id=1').get()!.claim_count, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type='PAYMENT_CONFIRMED'").get()!.n, 1);
});

test('concurrent confirmation sends only the first copy and later retries do not resend', async () => {
  seed();
  Object.assign(env, { RESEND_API_KEY: 'test-only-key', SPONSOR_FROM_EMAIL: 'Manish <campaign@devcon.manishh.xyz>' });
  const rpcFetch = globalThis.fetch;
  const emails: any[] = [];
  globalThis.fetch = async (url, init) => {
    if (url === 'https://api.resend.com/emails') {
      emails.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return Response.json({ id: 'test-email-id' });
    }
    return rpcFetch(url, init);
  };
  await Promise.all([verifyPayment({ id: 'claim', secret: 'secret', tx: hash }), verifyPayment({ id: 'claim', secret: 'secret', tx: hash })]);
  await verifyPayment({ id: 'claim', secret: 'secret', tx: hash });
  await dispatchNotification('payment-confirmed:claim');
  assert.equal(emails.length, 1);
  assert.equal(emails[0].body.subject, 'Your Devcon spot is confirmed');
  assert.equal(emails[0].headers.get('Idempotency-Key'), 'payment-confirmed:claim');
  assert.ok(emails[0].body.text.includes('350 USDC'));
  assert.equal(db.sqlite.prepare("SELECT status FROM notifications WHERE id='payment-confirmed:claim'").get()!.status, 'SENT');
});

test('provider rejection preserves confirmed ownership and a visible retryable notification', async () => {
  seed();
  Object.assign(env, { RESEND_API_KEY: 'test-only-key', SPONSOR_FROM_EMAIL: 'Manish <campaign@devcon.manishh.xyz>' });
  const rpcFetch = globalThis.fetch;
  let accepted = false;
  const keys: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (url !== 'https://api.resend.com/emails') return rpcFetch(url, init);
    keys.push(new Headers(init?.headers).get('Idempotency-Key')!);
    return accepted ? Response.json({ id: 'retry-email-id' }) : Response.json({ error: 'provider rejected' }, { status: 403 });
  };
  assert.equal((await verifyPayment({ id: 'claim', secret: 'secret', tx: hash })).status, 'CONFIRMED');
  const notification = db.sqlite.prepare("SELECT * FROM notifications WHERE id='payment-confirmed:claim'").get()!;
  assert.equal(notification.status, 'PENDING');
  assert.ok(notification.last_error);
  accepted = true;
  assert.equal(await dispatchNotification('payment-confirmed:claim'), true);
  assert.deepEqual(keys, ['payment-confirmed:claim', 'payment-confirmed:claim']);
});

test('unconfirmed and failed payments never queue a holder confirmation', async () => {
  seed(); head = 100;
  await verifyPayment({ id: 'claim', secret: 'secret', tx: hash });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type='PAYMENT_CONFIRMED'").get()!.n, 0);
  head = 120; receipt.status = '0x0'; receipt.logs = [];
  await verifyPayment({ id: 'claim', secret: 'secret', tx: hash });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type='PAYMENT_CONFIRMED'").get()!.n, 0);
});

test('confirmed takeover emails the previous holder the pending refund copy and the new holder a confirmation',async()=>{
  seed();await verifyPayment({id:'claim',secret:'secret',tx:hash});
  seed('replacement',1,other,8453,525,'claim');
  const newHash='0x'+'c'.repeat(64);
  transaction={...transaction,hash:newHash,from:other,input:`0xa9059cbb${treasury.slice(2).padStart(64,'0')}${(525000000).toString(16).padStart(64,'0')}`};
  receipt={...receipt,transactionHash:newHash,from:other,logs:[{...receipt.logs[0],transactionHash:newHash,topics:[transferTopic,topic(other),topic(treasury)],data:'0x'+(525000000).toString(16).padStart(64,'0')}]};
  Object.assign(env,{RESEND_API_KEY:'test-only-key',SPONSOR_FROM_EMAIL:'Manish <campaign@devcon.manishh.xyz>'});
  const rpcFetch=fetch,messages:any[]=[];
  globalThis.fetch=async(url,init)=>{
    if(url==='https://api.resend.com/emails'){messages.push(JSON.parse(String(init?.body)));return Response.json({id:'test-email'});}
    return rpcFetch(url,init);
  };
  await verifyPayment({id:'replacement',secret:'secret',tx:newHash});
  assert.equal(messages.length,2);
  const outbid=messages.find(item=>item.subject.includes('outbid'));
  assert.ok(outbid.text.includes('Hey claim,'));
  assert.ok(outbid.text.includes('Your payment: 350 USDC'));
  assert.ok(outbid.text.includes('New claim amount: 525 USDC'));
  assert.ok(outbid.text.includes('Refund status: Pending'));
  await verifyPayment({id:'replacement',secret:'secret',tx:newHash});assert.equal(messages.length,2);
});

test('refund confirmation is queued only after full on-chain verification and duplicate recording keeps one receipt',async()=>{
  seed();await verifyPayment({id:'claim',secret:'secret',tx:hash});
  db.sqlite.prepare("UPDATE payments SET refund_status='REFUND_PENDING',refund_amount_units=amount_units,refund_eligible_at=confirmed_at WHERE id='claim'").run();
  const payment:any=db.sqlite.prepare("SELECT * FROM payments WHERE id='claim'").get();
  const refundHash='0x'+'d'.repeat(64);
  receipt={...receipt,transactionHash:refundHash,logs:[{...receipt.logs[0],transactionHash:refundHash,topics:[transferTopic,topic(treasury),topic(other)]}]};
  await assert.rejects(recordVerifiedRefund(payment,refundHash,'test'),/original payment wallet/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type='REFUND_CONFIRMED'").get()!.n,0);
  assert.equal(db.sqlite.prepare("SELECT refund_status FROM payments WHERE id='claim'").get()!.refund_status,'REFUND_PENDING');
  receipt.logs[0].topics[2]=topic(wallet);head=100;
  await assert.rejects(recordVerifiedRefund(payment,refundHash,'test'),/confirmations/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type='REFUND_CONFIRMED'").get()!.n,0);
  head=120;
  Object.assign(env,{RESEND_API_KEY:'test-only-key',SPONSOR_FROM_EMAIL:'Manish <campaign@devcon.manishh.xyz>'});
  const rpcFetch=fetch,messages:any[]=[],keys:string[]=[];
  globalThis.fetch=async(url,init)=>{
    if(url==='https://api.resend.com/emails'){
      keys.push(new Headers(init?.headers).get('Idempotency-Key')!);messages.push(JSON.parse(String(init?.body)));return Response.json({id:'test-email'});
    }
    return rpcFetch(url,init);
  };
  await Promise.all([recordVerifiedRefund(payment,refundHash,'test'),recordVerifiedRefund(payment,refundHash,'test')]);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type='REFUND_CONFIRMED'").get()!.n,1);
  assert.equal(db.sqlite.prepare("SELECT refund_status FROM payments WHERE id='claim'").get()!.refund_status,'REFUNDED');
  for(const message of messages){assert.ok(message.text.includes(wallet));assert.ok(message.text.includes(refundHash));assert.ok(message.text.includes('350 USDC'));}
  assert.ok(keys.every(key=>key==='refund-confirmed:claim'));
  const sent=messages.length;await recordVerifiedRefund(payment,refundHash,'test');assert.equal(messages.length,sent);
});

for (const [name, tamper] of [
  ['wrong sender', () => { transaction.from = other; }],
  ['wrong token', () => { transaction.to = other; }],
  ['wrong amount', () => { transaction.input = transaction.input.slice(0, -1) + '1'; }],
  ['wrong recipient', () => { receipt.logs[0].topics[2] = topic(other); }],
  ['wrong chain', () => { chainId = 1; }],
  ['missing transfer', () => { receipt.logs = []; }],
  ['removed transfer', () => { receipt.logs[0].removed = true; }],
  ['noncanonical receipt', () => { block.hash = '0x' + 'c'.repeat(64); }],
] as const) {
  test(`rejects ${name} without displaying a logo`, async () => {
    seed(); tamper();
    await assert.rejects(verifyPayment({ id: 'claim', secret: 'secret', tx: hash }));
    assert.equal((await inventory()).slots[0].logo, null);
  });
}

test('failed transactions do not claim a spot', async () => {
  seed(); receipt.status = '0x0';
  assert.equal((await verifyPayment({ id: 'claim', secret: 'secret', tx: hash })).status, 'FAILED');
  assert.equal((await inventory()).slots[0].logo, null);
});

test('a failed transaction keeps its reservation until its canonical receipt has enough confirmations',async()=>{
  seed();receipt.status='0x0';receipt.logs=[];head=100;
  assert.equal((await verifyPayment({id:'claim',secret:'secret',tx:hash})).status,'CONFIRMING');
  assert.equal(db.sqlite.prepare('SELECT order_id FROM slots WHERE id=1').get()!.order_id,'claim');
  block.hash='0x'+'c'.repeat(64);head=120;
  await assert.rejects(verifyPayment({id:'claim',secret:'secret',tx:hash}));
  assert.equal(db.sqlite.prepare('SELECT order_id FROM slots WHERE id=1').get()!.order_id,'claim');
  block.hash=blockHash;
  assert.equal((await verifyPayment({id:'claim',secret:'secret',tx:hash})).status,'FAILED');
  assert.equal(db.sqlite.prepare('SELECT order_id FROM slots WHERE id=1').get()!.order_id,null);
});

test('a transfer from before checkout cannot create a claim or a new refund obligation',async()=>{
  seed();
  const payment:any=db.sqlite.prepare("SELECT verification_config FROM payments WHERE id='claim'").get();
  const snapshot=JSON.parse(payment.verification_config);snapshot.startBlock=100;
  db.sqlite.prepare("UPDATE payments SET verification_config=? WHERE id='claim'").run(JSON.stringify(snapshot));
  await assert.rejects(verifyPayment({id:'claim',secret:'secret',tx:hash}));
  assert.equal((await inventory()).slots[0].logo,null);
  assert.equal(db.sqlite.prepare("SELECT refund_status FROM payments WHERE id='claim'").get()!.refund_status,'NONE');
});

test('one transaction cannot pay for two spots', async () => {
  seed();
  await verifyPayment({ id: 'claim', secret: 'secret', tx: hash });
  seed('other', 2);
  await verifyPayment({ id: 'claim', secret: 'secret', tx: hash });
  await assert.rejects(verifyPayment({ id: 'other', secret: 'secret', tx: hash }));
  assert.equal((await inventory()).slots[1].logo, null);
});

test('a stale verifier cannot downgrade a concurrently confirmed payment', async () => {
  seed();
  const normalFetch = globalThis.fetch;
  let release!: () => void;
  let arrived!: () => void;
  const waiting = new Promise<void>(resolve => { arrived = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  let intercepted = false;
  globalThis.fetch = async (input, init) => {
    if (JSON.parse(String(init?.body)).method === 'eth_blockNumber' && !intercepted) {
      intercepted = true; arrived(); await resume;
      return Response.json({ jsonrpc: '2.0', id: 1, result: '0x64' });
    }
    return normalFetch(input, init);
  };
  const stale = verifyPayment({ id: 'claim', secret: 'secret', tx: hash });
  await waiting;
  await verifyPayment({ id: 'claim', secret: 'secret', tx: hash });
  release(); await stale;
  assert.equal(db.sqlite.prepare("SELECT status FROM payments WHERE id='claim'").get()!.status, 'CONFIRMED');
});

test('a pending transaction waits for the receipt and required confirmations',async()=>{
  seed();const mined=receipt;receipt=null;transaction.blockHash=null;transaction.blockNumber=null;
  assert.equal((await verifyPayment({id:'claim',secret:'secret',tx:hash})).status,'PAYMENT_DETECTED');
  receipt=mined;transaction.blockHash=blockHash;transaction.blockNumber='0x64';head=100;
  assert.equal((await verifyPayment({id:'claim',secret:'secret',tx:hash})).status,'CONFIRMING');
  assert.equal((await inventory()).slots[0].logo,null);
  head=120;
  assert.equal((await verifyPayment({id:'claim',secret:'secret',tx:hash})).status,'CONFIRMED');
});

test('an expired payment is recorded for refund without taking the spot',async()=>{
  seed();db.sqlite.prepare('UPDATE sponsorships SET reserved_until=? WHERE id=?').run(Date.now()-1000,'claim');
  assert.equal((await verifyPayment({id:'claim',secret:'secret',tx:hash})).status,'LATE_CONFIRMED');
  assert.equal((await inventory()).slots[0].logo,null);
  assert.equal(db.sqlite.prepare("SELECT refund_status FROM payments WHERE id='claim'").get()!.refund_status,'REFUND_PENDING');
});

test('an unknown checkout secret cannot read or confirm a payment',async()=>{
  seed();await assert.rejects(verifyPayment({id:'claim',secret:'wrong',tx:hash}));
});

test('preflight permits the reserved payment and blocks a second or expired payment',async()=>{
  seed();assert.equal((await paymentPreflight({id:'claim',secret:'secret'})).treasury,treasury);
  await verifyPayment({id:'claim',secret:'secret',tx:hash});
  await assert.rejects(paymentPreflight({id:'claim',secret:'secret'}));
});

for(const network of PAYMENT_NETWORKS){
  test(`verifies canonical 6-decimal USDC on ${network.name}`,async()=>{
    seed('claim',1,wallet,network.id);chainId=network.id;head=100+network.confirmations;
    const token=network.tokens[0].address;
    transaction.to=token;receipt.to=token;receipt.logs[0].address=token;
    const snapshot={...network,chainId:network.id,treasury,startBlock:99};
    assert.equal((await verifyPayment({id:'claim',secret:'secret',tx:hash})).status,'CONFIRMED');
  });
}

test('an outbid holder receives a full refund obligation while the new logo takes the spot',async()=>{
  seed();await verifyPayment({id:'claim',secret:'secret',tx:hash});
  seed('challenger',1,wallet,8453,525,'claim');
  const nextHash='0x'+'d'.repeat(64);
  transaction.hash=nextHash;receipt.transactionHash=nextHash;receipt.logs[0].transactionHash=nextHash;
  transaction.input=`0xa9059cbb${treasury.slice(2).padStart(64,'0')}${(525_000_000).toString(16).padStart(64,'0')}`;
  receipt.logs[0].data='0x'+(525_000_000).toString(16).padStart(64,'0');
  assert.equal((await verifyPayment({id:'challenger',secret:'secret',tx:nextHash})).status,'CONFIRMED');
  assert.equal((await inventory()).slots[0].project,'challenger');
  assert.equal(db.sqlite.prepare("SELECT refund_amount_units FROM payments WHERE id='claim'").get()!.refund_amount_units,'350000000');
  assert.equal(db.sqlite.prepare("SELECT status FROM sponsorships WHERE id='claim'").get()!.status,'OUTBID');
});

test('refund verification requires the exact return transfer, canonical block and confirmations',async()=>{
  seed();await verifyPayment({id:'claim',secret:'secret',tx:hash});
  const payment:any=db.sqlite.prepare("SELECT * FROM payments WHERE id='claim'").get();
  receipt.logs[0].topics=[transferTopic,topic(treasury),topic(wallet)];
  await verifyRefund(payment,hash);
  receipt.logs[0].topics[2]=topic(other);
  await assert.rejects(verifyRefund(payment,hash));
  receipt.logs[0].topics[2]=topic(wallet);receipt.logs[0].removed=true;
  await assert.rejects(verifyRefund(payment,hash));
});

test('manual auction accepts a confirmed claim with no deadline and preflight blocks after closing',async()=>{
  seed();db.sqlite.prepare('UPDATE auction_campaign SET ends_at=NULL').run();
  assert.equal((await paymentPreflight({id:'claim',secret:'secret'})).treasury,treasury);
  assert.equal((await verifyPayment({id:'claim',secret:'secret',tx:hash})).status,'CONFIRMED');
  seed('other',2);
  db.sqlite.prepare("UPDATE auction_campaign SET status='CLOSED'").run();
  await assert.rejects(paymentPreflight({id:'other',secret:'secret'}));
});


test('a cancellation refund cannot reuse a transfer made before refund eligibility',async()=>{
  seed();await verifyPayment({id:'claim',secret:'secret',tx:hash});
  const payment:any=db.sqlite.prepare("SELECT * FROM payments WHERE id='claim'").get();
  payment.refund_eligible_at=Number(block.timestamp)*1000+10000;
  receipt.logs[0].topics=[transferTopic,topic(treasury),topic(wallet)];
  await assert.rejects(verifyRefund(payment,hash),/predates refund eligibility/);
  block.timestamp='0x'+Math.ceil(payment.refund_eligible_at/1000).toString(16);
  await verifyRefund(payment,hash);
});


test('a transfer explicitly verified after cancellation is refundable and never takes the released spot',async()=>{
 seed();assert.equal((await cancelCheckout({id:'claim',secret:'secret'})).released,true);
 assert.equal((await verifyPayment({id:'claim',secret:'secret'})).status,'CANCELLED');
 const result=await verifyPayment({id:'claim',secret:'secret',tx:hash});
 assert.equal(result.status,'LATE_CONFIRMED');assert.equal(result.refundStatus,'REFUND_PENDING');
 assert.equal((await inventory()).slots[0].holder,null);
});

test('simultaneous cancellation and confirmation cannot create a cancelled owner or lose a confirmed payment',async()=>{
 seed();const [cancelled,verified]=await Promise.all([cancelCheckout({id:'claim',secret:'secret'}),verifyPayment({id:'claim',secret:'secret',tx:hash})]);
 assert.ok(['CONFIRMED','LATE_CONFIRMED'].includes(verified.status));
 const slot:any=db.sqlite.prepare('SELECT * FROM slots WHERE id=1').get();
 if(cancelled.released){assert.equal(slot.holder_sponsorship_id,null);assert.equal(verified.refundStatus,'REFUND_PENDING');}
 else{assert.equal(slot.holder_sponsorship_id,'claim');assert.equal(verified.status,'CONFIRMED');}
});
