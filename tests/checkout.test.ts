import { beforeEach, afterEach, test } from 'node:test';
import { PNG } from 'pngjs';
import { encode as encodeJpeg } from 'jpeg-js';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from './runtime.mjs';
import { database } from './database.mjs';
import { PAYMENT_NETWORKS } from '../lib/payment-networks';
import { inventory, initialize } from '../lib/campaign';
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
  body.set('logo', new File([new Uint8Array(PNG.sync.write(new PNG({width:1,height:1})))], 'logo.png', { type: 'image/png' }));
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

test('the live authorization route rejects all SVG, fake PNG headers and oversized dimensions before creating a challenge or uploading',async()=>{
  const huge=new PNG({width:2049,height:1});
  for(const logo of [new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'],'plain.svg',{type:'image/svg+xml'}),new File([new Uint8Array([137,80,78,71,13,10,26,10])],'fake.png',{type:'image/png'}),new File([new Uint8Array(PNG.sync.write(huge))],'huge.png',{type:'image/png'})]){
    const body=form();body.set('logo',logo);assert.equal((await post('checkout/authorize',body)).status,400);
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM checkout_authorizations').get()!.n,0);assert.equal(uploads.size,0);
});

test('the live reserve route decodes a genuine JPEG and stores only a freshly encoded PNG',async()=>{
  const body=form(),jpeg=encodeJpeg({width:1,height:1,data:Buffer.from([0,0,0,255])},90).data;
  body.set('logo',new File([new Uint8Array(jpeg)],'logo.jpg',{type:'image/jpeg'}));
  await authorize(body);assert.equal((await post('reserve',body)).status,200);
  const bytes=[...uploads.values()][0];assert.ok(Buffer.from(bytes).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  assert.equal(PNG.sync.read(Buffer.from(bytes)).width,1);
});

test('authorization rate limits return 429 before more decoding, RPC or challenge creation',async()=>{
  for(let i=0;i<6;i++)assert.equal((await post('checkout/authorize',form())).status,200);
  const before=db.sqlite.prepare('SELECT COUNT(*) n FROM checkout_authorizations').get()!.n;
  const response=await post('checkout/authorize',form());assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM checkout_authorizations').get()!.n,before);assert.equal(uploads.size,0);
});

test('streamed verification requests exceeding the JSON limit return 413 without changing financial records',async()=>{
  const before=db.sqlite.prepare('SELECT COUNT(*) n FROM payments').get()!.n;
  const request=new Request('https://site.test/api/verify',{method:'POST',headers:{origin:'https://site.test','content-type':'application/json'},body:JSON.stringify({padding:'x'.repeat(20000)})});
  const response=await POST(request,{params:Promise.resolve({path:['verify']})});assert.equal(response.status,413);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM payments').get()!.n,before);
});

test('the live global authorization cap remains effective across rotating client IP headers',async()=>{
  const clock=Date.now,now=clock();Date.now=()=>now;
  try{
    for(let i=0;i<49;i++){
      const body=form('0');
      const response=await POST(new Request('https://site.test/api/checkout/authorize',{method:'POST',headers:{origin:'https://site.test','cf-connecting-ip':`203.0.113.${i}`},body}),{params:Promise.resolve({path:['checkout','authorize']})});
      assert.equal(response.status,i<48?400:429);
    }
    assert.equal(uploads.size,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM payments').get()!.n,0);
  }finally{Date.now=clock;}
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
  db.sqlite.prepare("INSERT INTO sponsors(id,project_name,x_handle,contact_name,email,wallet_address,logo_url,created_at) VALUES('previous','Previous','@previous','Previous','previous@example.com','0x1111111111111111111111111111111111111111','logo',0)").run();
  db.sqlite.prepare("INSERT INTO sponsorships(id,secret,slot_number,position,price_usd,sponsor_id,reserved_until,created_at,updated_at) VALUES('previous','previous',1,'Front',350,'previous',0,0,0)").run();
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


for(const network of PAYMENT_NETWORKS)test(`${network.name} signed checkout recovers when the configured primary RPC returns HTTP 503`,async()=>{
 const body=form();body.set('chainId',String(network.id));await authorize(body);
 const normalFetch=globalThis.fetch;
 (env as any)[`CHAIN_RPC_URL_${network.id}`]='https://unavailable.example';
 globalThis.fetch=async(input,init)=>{
  if(String(input)==='https://unavailable.example')return new Response('',{status:503});
  if(JSON.parse(String(init?.body)).method==='eth_chainId')return Response.json({jsonrpc:'2.0',id:1,result:'0x'+network.id.toString(16)});
  return normalFetch(input,init);
 };
 let response:Response;
 try { response=await post('reserve',body); } finally { delete (env as any)[`CHAIN_RPC_URL_${network.id}`]; }
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM sponsorships').get()!.count,1);
 assert.equal(uploads.size,1);
});


test('new reservations last five minutes even when saved settings still contain fifteen',async()=>{
 (env as any).RESERVATION_MINUTES='5';
 try {
  db.sqlite.prepare('INSERT INTO settings(id,value) VALUES(1,?)').run(JSON.stringify({reservationMinutes:15}));
  const body=form();await authorize(body);
  assert.equal((await post('reserve',body)).status,200);
  const reservation:any=db.sqlite.prepare('SELECT created_at,reserved_until FROM sponsorships').get();
  assert.equal(reservation.reserved_until-reservation.created_at,5*60000);
 }finally{delete (env as any).RESERVATION_MINUTES;}
});


async function cancelReservation(id:string,secret:string){
 return POST(new Request('https://site.test/api/checkout/cancel',{method:'POST',headers:{origin:'https://site.test','content-type':'application/json'},body:JSON.stringify({id,secret})}),{params:Promise.resolve({path:['checkout','cancel']})});
}

test('cancel releases an unpaid reservation immediately; concurrent retries cannot release a later checkout',async()=>{
 const body=form();await authorize(body);
 const reserved=await (await post('reserve',body)).json() as {id:string;secret:string};
 const cancellations=await Promise.all([cancelReservation(reserved.id,reserved.secret),cancelReservation(reserved.id,reserved.secret)]);
 for(const response of cancellations){assert.equal(response.status,200);assert.equal((await response.json() as any).released,true);}
 assert.equal((await inventory()).slots[0].checkoutInProgress,false);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM payments').get()!.count,1);
 assert.equal(db.sqlite.prepare('SELECT status FROM payments').get()!.status,'CANCELLED');
 const next=form();await authorize(next);assert.equal((await post('reserve',next)).status,200);
 const newOrder=db.sqlite.prepare('SELECT order_id FROM slots WHERE id=1').get()!.order_id;
 await cancelReservation(reserved.id,reserved.secret);
 assert.equal(db.sqlite.prepare('SELECT order_id FROM slots WHERE id=1').get()!.order_id,newOrder);
});

for(const state of ['PAYMENT_DETECTED','CONFIRMING','CONFIRMED','hash bound'])test(`cancel refuses to release a ${state} payment`,async()=>{
 const body=form();await authorize(body);const reserved=await (await post('reserve',body)).json() as any;
 if(state==='hash bound')db.sqlite.prepare("UPDATE payments SET transaction_hash=?").run('0x'+'a'.repeat(64));
 else db.sqlite.prepare('UPDATE payments SET status=?').run(state);
 const response=await cancelReservation(reserved.id,reserved.secret);
 assert.equal((await response.json() as any).released,false);
 assert.equal(db.sqlite.prepare('SELECT order_id FROM slots WHERE id=1').get()!.order_id,reserved.id);
});

test('an incorrect cancellation secret cannot release another reservation',async()=>{
 const body=form();await authorize(body);const reserved=await (await post('reserve',body)).json() as any;
 assert.equal((await cancelReservation(reserved.id,'wrong')).status,400);
 assert.equal(db.sqlite.prepare('SELECT order_id FROM slots WHERE id=1').get()!.order_id,reserved.id);
});


test('cancelling an expired unpaid checkout also releases its payer intent without touching a newer reservation',async()=>{
 const body=form();await authorize(body);const reserved=await (await post('reserve',body)).json() as any;
 db.sqlite.prepare("UPDATE sponsorships SET reserved_until=? WHERE id=?").run(Date.now()-1,reserved.id);
 await initialize();
 assert.equal(db.sqlite.prepare('SELECT status FROM payments').get()!.status,'EXPIRED');
 assert.equal((await (await cancelReservation(reserved.id,reserved.secret)).json() as any).released,true);
 const next=form();await authorize(next);assert.equal((await post('reserve',next)).status,200);
});


test('QR checkout is disabled by default and unsigned wallet checkout remains rejected',async()=>{
  const body=form();body.set('paymentMethod','QR');
  assert.equal((await post('reserve',body)).status,409);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM payments').get()!.n,0);
});

test('Arc is rejected for QR reservations and remains supported for signed wallet checkout',async()=>{
  (env as any).QR_CHECKOUT_ENABLED='1';
  try{
    const qr=form();qr.set('chainId','5042');qr.set('paymentMethod','QR');
    const rejected=await post('reserve',qr);
    assert.equal(rejected.status,400);assert.match(((await rejected.json()) as {error:string}).error,/connected-wallet/);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM qr_payment_amounts').get()!.n,0);
    const rpcFetch=globalThis.fetch;
    globalThis.fetch=async(input,init)=>{
      if(JSON.parse(String(init?.body)).method==='eth_chainId')return Response.json({jsonrpc:'2.0',id:1,result:'0x13b2'});
      return rpcFetch(input,init);
    };
    const wallet=form();wallet.set('chainId','5042');
    await authorize(wallet);
    const response=await post('reserve',wallet);assert.equal(response.status,200);
    assert.equal(((await response.json()) as {chainId:number}).chainId,5042);
    assert.equal(db.sqlite.prepare('SELECT payment_method FROM payments').get()!.payment_method,'WALLET');
  }finally{delete (env as any).QR_CHECKOUT_ENABLED;}
});
test('QR reserves an exact discounted amount without a signature; client prices are ignored',async()=>{
  (env as any).QR_CHECKOUT_ENABLED='1';
  try{
    const body=form();body.set('paymentMethod','QR');body.set('amount','1');body.set('price','1');
    const response=await post('reserve',body);assert.equal(response.status,200);
    const result:any=await response.json();assert.equal(result.paymentMethod,'QR');assert.equal(result.price,'349.999');assert.equal(result.claimPrice,'350');assert.equal(result.priceUnits,'349999000');
    const payment=db.sqlite.prepare('SELECT * FROM payments').get()!;assert.equal(payment.amount_units,'349999000');assert.equal(payment.payment_method,'QR');
    assert.equal(db.sqlite.prepare('SELECT claim_price_units FROM sponsorships').get()!.claim_price_units,'350000000');
    const cancel=await POST(new Request('https://site.test/api/checkout/cancel',{method:'POST',headers:{origin:'https://site.test','content-type':'application/json'},body:JSON.stringify(result)}),{params:Promise.resolve({path:['checkout','cancel']})});assert.equal(cancel.status,200);
    const retry=form();retry.set('paymentMethod','QR');const next:any=await (await post('reserve',retry)).json();assert.equal(next.price,'349.998');
  }finally{delete (env as any).QR_CHECKOUT_ENABLED;}
});
test('concurrent QR reservations cannot acquire the same spot or amount',async()=>{
 (env as any).QR_CHECKOUT_ENABLED='1';try{
  const a=form(),b=form();a.set('paymentMethod','QR');b.set('paymentMethod','QR');b.set('wallet',attacker.address);
  const responses=await Promise.all([post('reserve',a),post('reserve',b)]);
  assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM payments').get()!.n,1);
  const values=db.sqlite.prepare('SELECT amount_units FROM qr_payment_amounts').all();assert.equal(new Set(values.map(x=>x.amount_units)).size,values.length);
 }finally{delete (env as any).QR_CHECKOUT_ENABLED;}
});

test('payment-disabled staging cannot create wallet or QR reservations',async()=>{
 (env as any).PAYMENTS_DISABLED='1';(env as any).QR_CHECKOUT_ENABLED='1';try{
  const body=form();body.set('paymentMethod','QR');assert.equal((await post('reserve',body)).status,503);
  assert.equal((await post('checkout/authorize',form())).status,503);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM payments').get()!.n,0);
 }finally{delete (env as any).PAYMENTS_DISABLED;delete (env as any).QR_CHECKOUT_ENABLED;}
});

test('QR prewarming creates no reservation and a warmed reservation still uses server pricing',async()=>{
 (env as any).QR_CHECKOUT_ENABLED='1';
 const rpcFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;return rpcFetch(input,init);};
 try{
  const warm=()=>POST(new Request('https://site.test/api/checkout/prepare',{method:'POST',headers:{origin:'https://site.test','content-type':'application/json'},body:JSON.stringify({chainId:8453,token:'USDC'})}),{params:Promise.resolve({path:['checkout','prepare']})});
  assert.equal((await warm()).status,200);const preparedCalls=calls;
  assert.ok(preparedCalls>0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sponsorships').get()!.n,0);assert.equal(uploads.size,0);
  assert.equal((await warm()).status,200);assert.equal(calls,preparedCalls);
  const body=form();body.set('paymentMethod','QR');body.set('amount','1');
  const reserved=await post('reserve',body);assert.equal(reserved.status,200);
  assert.equal(((await reserved.json()) as any).claimPrice,'350');assert.equal(calls,preparedCalls+2,'reservation must still read a fresh chain identity and block head');
 }finally{delete (env as any).QR_CHECKOUT_ENABLED;}
});
