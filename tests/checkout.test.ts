import { beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from './runtime.mjs';
import { database } from './database.mjs';
import { initialize } from '../lib/campaign';
import { POST } from '../app/api/[...path]/route';

// Public test-only signing keys. They never hold real funds.
const account = privateKeyToAccount('0x' + '1'.repeat(64) as `0x${string}`);
const attacker = privateKeyToAccount('0x' + '2'.repeat(64) as `0x${string}`);
const originalFetch = globalThis.fetch;
let db: ReturnType<typeof database>;
let uploads: Map<string, Uint8Array>;

beforeEach(async () => {
  db = database();
  uploads = new Map();
  Object.assign(env, { DB: db, TREASURY_WALLET_ADDRESS: '0x7c7ddb2c72725563816d5adc7137043d831ebcbe', BUCKET: { async put(key: string, bytes: Uint8Array) { uploads.set(key, bytes); }, async delete(key: string) { uploads.delete(key); } } });
  await initialize();
  db.sqlite.prepare("UPDATE auction_campaign SET status='LIVE',starts_at=?,ends_at=? WHERE id=1").run(Date.now() - 60_000, Date.now() + 3600_000);
  globalThis.fetch = async (_input, init) => {
    const { method, params } = JSON.parse(String(init?.body));
    const result = method === 'eth_chainId' ? '0x2105' : method === 'eth_blockNumber' ? '0x64' : params?.[0]?.data === '0x313ce567' ? '0x6' : '0x' + (1000_000_000).toString(16);
    return Response.json({ jsonrpc: '2.0', id: 1, result });
  };
});
afterEach(() => { globalThis.fetch = originalFetch; db.sqlite.close(); });

function form(slot = '1') {
  const body = new FormData();
  for (const [key, value] of Object.entries({ slot, chainId: '8453', token: 'USDC', project: 'Test Brand', x: '@testbrand', website: 'https://example.com', contact: 'Test', email: 'test@example.com', wallet: account.address, terms: 'accepted' })) body.set(key, value);
  body.set('logo', new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'logo.png', { type: 'image/png' }));
  return body;
}
async function post(endpoint: string, body: FormData) {
  return POST(new Request(`https://site.test/api/${endpoint}`, { method: 'POST', headers: { origin: 'https://site.test' }, body }), { params: Promise.resolve({ path: endpoint.split('/') }) });
}
async function authorize(body: FormData, signer = account) {
  const response = await post('checkout/authorize', body);
  assert.equal(response.status, 200);
  const challenge = await response.json() as {id:string;message:string};
  body.set('authorization', challenge.id);
  body.set('signature', await signer.signMessage({ message: challenge.message }));
  return challenge;
}

test('a public wallet address alone cannot reserve or redirect another payer’s sponsorship', async () => {
  const response = await post('reserve', form());
  assert.equal(response.status, 400);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM sponsorships').get()!.count, 0);
});

test('a signed checkout reserves exactly its quoted amount and Manish’s wallet', async () => {
  const body = form(); await authorize(body);
  const response = await post('reserve', body);
  assert.equal(response.status, 200);
  const reservation = await response.json() as {treasury:string;priceUnits:string};
  assert.equal(reservation.treasury, '0x7c7ddb2c72725563816d5adc7137043d831ebcbe');
  assert.equal(reservation.priceUnits, '350000000');
  assert.equal(uploads.size, 1);
});

test('a signed wallet with insufficient USDC cannot lock a slot or upload a logo',async()=>{
  const body=form();await authorize(body);
  const normalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const {method,params}=JSON.parse(String(init?.body));
    if(method==='eth_call'&&params[0].data.startsWith('0x70a08231'))return Response.json({jsonrpc:'2.0',id:1,result:'0x0'});
    return normalFetch(input,init);
  };
  const response=await post('reserve',body);
  assert.equal(response.status,400);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM sponsorships').get()!.count,0);
  assert.equal(db.sqlite.prepare('SELECT order_id FROM slots WHERE id=1').get()!.order_id,null);
  assert.equal(uploads.size,0);
});

test('a signature from another wallet cannot reserve', async () => {
  const body = form(); await authorize(body, attacker);
  assert.equal((await post('reserve', body)).status, 400);
});

test('a signed authorization cannot be reused for another slot or brand', async () => {
  const body = form(); await authorize(body);
  body.set('slot', '2');
  assert.equal((await post('reserve', body)).status, 400);
  body.set('slot', '1'); body.set('project', 'Stolen Brand');
  assert.equal((await post('reserve', body)).status, 400);
});

test('replayed or concurrent signed reservations create one checkout', async () => {
  const body = form(); await authorize(body);
  const responses = await Promise.all([post('reserve', body), post('reserve', body)]);
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM sponsorships').get()!.count, 1);
  assert.equal(uploads.size, 1);
});

test('expired signatures and quotes with a changed price cannot reserve', async () => {
  const body = form(); const challenge = await authorize(body);
  db.sqlite.prepare('UPDATE checkout_authorizations SET expires_at=? WHERE id=?').run(Date.now()-1,challenge.id);
  assert.equal((await post('reserve', body)).status,400);
  await authorize(body);
  db.sqlite.prepare("UPDATE slots SET current_price_units='350000000',holder_sponsorship_id='previous' WHERE id=1").run();
  assert.equal((await post('reserve', body)).status,400);
});

test('an unsigned upload cannot bypass the logo policy', async () => {
  const body=form();body.set('logo',new File(['<svg><script>alert(1)</script></svg>'],'logo.svg',{type:'image/svg+xml'}));
  assert.equal((await post('checkout/authorize',body)).status,400);
  assert.equal(uploads.size,0);
});

test('the server ignores a client-supplied price and treasury', async () => {
  const body=form();body.set('priceUnits','1');body.set('treasury',attacker.address);
  await authorize(body);
  const response=await post('reserve',body);
  assert.equal(response.status,200);
  const result=await response.json() as {priceUnits:string;treasury:string};
  assert.equal(result.priceUnits,'350000000');
  assert.equal(result.treasury,'0x7c7ddb2c72725563816d5adc7137043d831ebcbe');
});

test('a misconfigured treasury fails closed', async () => {
  Object.assign(env,{TREASURY_WALLET_ADDRESS:attacker.address});
  assert.equal((await post('checkout/authorize',form())).status,503);
  Object.assign(env,{TREASURY_WALLET_ADDRESS:'0x7c7ddb2c72725563816d5adc7137043d831ebcbe'});
});

test('closed auctions reject new authorizations', async () => {
  db.sqlite.prepare('UPDATE auction_campaign SET ends_at=? WHERE id=1').run(Date.now()-1);
  assert.equal((await post('checkout/authorize',form())).status,409);
});

test('one funded wallet cannot hold multiple unpaid spots through separate signatures',async()=>{
  const first=form(),second=form('2');await authorize(first);await authorize(second);
  const responses=await Promise.all([post('reserve',first),post('reserve',second)]);
  assert.equal(responses.filter(response=>response.status===200).length,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM sponsorships').get()!.count,1);
  assert.equal(uploads.size,1);
});
