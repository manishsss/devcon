import { beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from './runtime.mjs';
import { database } from './database.mjs';
import { initialize, inventory } from '../lib/campaign';
import { paymentPreflight, verifyPayment, verifyRefund } from '../lib/payment';
import { PAYMENT_NETWORKS } from '../lib/payment-networks';

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

afterEach(() => { globalThis.fetch = originalFetch; db.sqlite.close(); });

function seed(id = 'claim', slot = 1, payer = wallet) {
  const now = Date.now();
  const network = PAYMENT_NETWORKS.find(item => item.id === 8453)!;
  const verification = { ...network, chainId: 8453, treasury, startBlock: 99 };
  db.sqlite.prepare("INSERT INTO sponsors(id,project_name,x_handle,contact_name,email,wallet_address,logo_url,created_at) VALUES(?,?,'@brand','Brand','brand@example.com',?,'logo',?)").run(id, id, payer, now);
  db.sqlite.prepare("INSERT INTO sponsorships(id,secret,slot_number,position,price_usd,claim_price_units,sponsor_id,reserved_until,terms_accepted,created_at,updated_at) VALUES(?,'secret',?,'Front',350,'350000000',?,?,1,?,?)").run(id, slot, id, now + 900_000, now - 10_000, now);
  db.sqlite.prepare("INSERT INTO payments(id,sponsor_id,sponsorship_id,slot_id,wallet_address,token,token_contract,chain,chain_id,amount,amount_usd,amount_units,verification_config,created_at) VALUES(?,?,?,?,?,'USDC',?,'Base',8453,'350',350,'350000000',?,?)").run(id, id, id, slot, payer, network.tokens[0].address, JSON.stringify(verification), now);
  db.sqlite.prepare('UPDATE slots SET order_id=?,expires=? WHERE id=?').run(id, now + 900_000, slot);
}

test('a valid USDC payment publishes its logo only after confirmation, and retries are idempotent', async () => {
  seed();
  assert.equal((await inventory()).slots[0].logo, null);
  assert.equal((await verifyPayment({ id: 'claim', secret: 'secret', tx: hash })).status, 'CONFIRMED');
  assert.equal((await inventory()).slots[0].logo, '/api/logo/logo');
  assert.equal((await verifyPayment({ id: 'claim', secret: 'secret', tx: hash })).status, 'CONFIRMED');
  assert.equal(db.sqlite.prepare('SELECT claim_count FROM slots WHERE id=1').get()!.claim_count, 1);
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
  seed(); seed('other', 2);
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
    seed();chainId=network.id;head=100+network.confirmations;
    const token=network.tokens[0].address;
    transaction.to=token;receipt.to=token;receipt.logs[0].address=token;
    const snapshot={...network,chainId:network.id,treasury,startBlock:99};
    db.sqlite.prepare("UPDATE payments SET chain_id=?,chain=?,token_contract=?,verification_config=? WHERE id='claim'").run(network.id,network.name,token,JSON.stringify(snapshot));
    assert.equal((await verifyPayment({id:'claim',secret:'secret',tx:hash})).status,'CONFIRMED');
  });
}

test('an outbid holder receives a full refund obligation while the new logo takes the spot',async()=>{
  seed();await verifyPayment({id:'claim',secret:'secret',tx:hash});
  seed('challenger');
  db.sqlite.prepare("UPDATE sponsorships SET claim_price_units='525000000',previous_holder_sponsorship_id='claim' WHERE id='challenger'").run();
  db.sqlite.prepare("UPDATE payments SET amount_units='525000000' WHERE id='challenger'").run();
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
