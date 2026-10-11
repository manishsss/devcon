import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from './runtime.mjs';
import { database } from './database.mjs';
import { initialize, inventory } from '../lib/campaign';
import { queueSponsorCancellation } from '../lib/sponsor-cancellation';
import { POST } from '../app/api/[...path]/route';
import { projectLink } from '../lib/project-link';

async function fixture() {
 const db=database();Object.assign(env,{DB:db});await initialize();
 db.sqlite.prepare("UPDATE auction_campaign SET status='LIVE',starts_at=?,ends_at=NULL").run(Date.now());
 const now=Date.now();
 db.sqlite.prepare("INSERT INTO sponsors(id,project_name,x_handle,website,contact_name,email,wallet_address,logo_url,logo_status,created_at) VALUES('s','Brand','@brand','https://brand.example','Name','a@example.com','0x1111111111111111111111111111111111111111','logo','APPROVED',?)").run(now);
 db.sqlite.prepare("INSERT INTO sponsorships(id,secret,slot_number,position,price_usd,claim_price_units,sponsor_id,reserved_until,terms_accepted,created_at,updated_at,status,claim_sequence) VALUES('sp','secret',1,'Front',350,'350000000','s',?,1,?,?,'CURRENT_HOLDER',1)").run(now+60000,now,now);
 db.sqlite.prepare("INSERT INTO payments(id,sponsor_id,sponsorship_id,slot_id,wallet_address,token,token_contract,chain,chain_id,amount,amount_usd,amount_units,verification_config,created_at,status,confirmed_at) VALUES('p','s','sp',1,'0x1111111111111111111111111111111111111111','USDC','token','Base',8453,'350',350,'350000000','{}',?,'CONFIRMED',?)").run(now,now);
 db.sqlite.prepare("UPDATE slots SET holder_sponsorship_id='sp',current_price_units='350000000',claim_count=1 WHERE id=1").run();
 return db;
}

test('cancellation queues full refund atomically, removes current funds, and preserves history; concurrent retries are harmless',async()=>{
 const db=await fixture();try{
  assert.equal((await inventory()).slots[0].website,'https://brand.example');
  await Promise.all([queueSponsorCancellation('p','Unsuitable logo'),queueSponsorCancellation('p','Unsuitable logo')]);
  const p:any=db.sqlite.prepare("SELECT * FROM payments WHERE id='p'").get();
  assert.equal(p.status,'CONFIRMED');assert.equal(p.refund_status,'REFUND_PENDING');assert.equal(p.refund_amount_units,'350000000');assert.equal(p.refund_transaction_hash,null);assert.ok(p.refund_eligible_at);
  assert.equal((await inventory()).raised,0);assert.equal((await inventory()).slots[0].claimPrice,'350');assert.equal((await inventory()).slots[0].claimCount,1);
  assert.equal(db.sqlite.prepare("SELECT status FROM sponsorships WHERE id='sp'").get()!.status,'REFUND_PENDING');
  assert.equal(db.sqlite.prepare("SELECT logo_status FROM sponsors WHERE id='s'").get()!.logo_status,'REJECTED');
 }finally{db.sqlite.close();}
});

for(const condition of ['active checkout','unconfirmed','not current holder','closed'])test(`cancellation refuses ${condition} without changing refund or ownership`,async()=>{
 const db=await fixture();try{
  if(condition==='active checkout')db.sqlite.prepare("UPDATE slots SET order_id='sp',expires=? WHERE id=1").run(Date.now()+60000);
  if(condition==='unconfirmed')db.sqlite.prepare("UPDATE payments SET status='PENDING' WHERE id='p'").run();
  if(condition==='not current holder')db.sqlite.prepare('UPDATE slots SET holder_sponsorship_id=NULL,current_price_units=NULL WHERE id=1').run();
  if(condition==='closed')db.sqlite.prepare("UPDATE auction_campaign SET status='CLOSED'").run();
  await assert.rejects(queueSponsorCancellation('p','Unsuitable'));
  assert.equal(db.sqlite.prepare("SELECT refund_status FROM payments WHERE id='p'").get()!.refund_status,'NONE');
  assert.equal(db.sqlite.prepare("SELECT logo_status FROM sponsors WHERE id='s'").get()!.logo_status,'APPROVED');
 }finally{db.sqlite.close();}
});

test('an already outbid refund request does not reject its historical logo or rewrite sponsorship status',async()=>{
 const db=await fixture();try{
  db.sqlite.prepare("UPDATE payments SET refund_status='REFUND_PENDING' WHERE id='p'").run();
  db.sqlite.prepare("UPDATE sponsorships SET status='OUTBID' WHERE id='sp'").run();
  db.sqlite.prepare('UPDATE slots SET holder_sponsorship_id=NULL,current_price_units=NULL WHERE id=1').run();
  await queueSponsorCancellation('p','Retry');
  assert.equal(db.sqlite.prepare("SELECT status FROM sponsorships WHERE id='sp'").get()!.status,'OUTBID');
  assert.equal(db.sqlite.prepare("SELECT logo_status FROM sponsors WHERE id='s'").get()!.logo_status,'APPROVED');
 }finally{db.sqlite.close();}
});

test('project destination prefers a safe website, falls back to X, and rejects executable URLs',()=>{
 assert.equal(projectLink({website:'https://brand.example',x:'@brand'}),'https://brand.example/');
 assert.equal(projectLink({x:'@brand'}),'https://x.com/brand');
 assert.equal(projectLink({website:'javascript:alert(1)',x:'https://x.com/brand'}),'https://x.com/brand');
 assert.equal(projectLink({website:'javascript:alert(1)',x:'bad handle'}),null);
});


test('public requests cannot queue a sponsor refund',async()=>{
 const db=await fixture();try{
  const response=await POST(new Request('https://devcon.example/api/admin/cancel-sponsor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paymentId:'p',reason:'Unauthorized'})}),{params:Promise.resolve({path:['admin','cancel-sponsor']})});
  assert.ok(response.status>=400);
  assert.equal(db.sqlite.prepare("SELECT refund_status FROM payments WHERE id='p'").get()!.refund_status,'NONE');
  assert.equal(db.sqlite.prepare('SELECT holder_sponsorship_id FROM slots WHERE id=1').get()!.holder_sponsorship_id,'sp');
 }finally{db.sqlite.close();}
});
