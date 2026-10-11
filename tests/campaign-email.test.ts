import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from './runtime.mjs';
import { database } from './database.mjs';
import { initialize, settleCampaign } from '../lib/campaign';

for(const successful of [true,false])test(`manual settlement queues and sends ${successful?'final sponsor':'funding refund'} copy once, only to current confirmed holders`,async()=>{
  const db=database(),originalFetch=fetch;
  Object.assign(env,{DB:db,RESEND_API_KEY:'test-only-key',SPONSOR_FROM_EMAIL:'Manish <campaign@devcon.manishh.xyz>'});
  const messages:any[]=[];
  globalThis.fetch=async(_url,init)=>{messages.push(JSON.parse(String(init?.body)));return Response.json({id:'test-email'});};
  try{
    await initialize();
    const now=Date.now();
    db.sqlite.prepare("UPDATE auction_campaign SET status='LIVE',starts_at=?,ends_at=NULL").run(now);
    const entries=successful?[[1,350],[2,350],[7,200],[8,200]]:[[1,350],[2,350],[3,300]];
    for(const [slot,price]of entries){
      const id='holder-'+slot;
      db.sqlite.prepare("INSERT INTO sponsors(id,project_name,x_handle,contact_name,email,wallet_address,logo_url,created_at) VALUES(?,?,'@brand','Name',?,'wallet','logo',?)").run(id,id,id+'@example.com',now);
      db.sqlite.prepare("INSERT INTO sponsorships(id,secret,slot_number,position,price_usd,claim_price_units,sponsor_id,reserved_until,terms_accepted,created_at,updated_at,status,claim_sequence) VALUES(?,'secret',?,'Front',?,?,?, ?,1,?,?,'CURRENT_HOLDER',1)").run(id,slot,price,String(price*1000000),id,now,now,now);
      db.sqlite.prepare("INSERT INTO payments(id,sponsor_id,sponsorship_id,slot_id,wallet_address,token,token_contract,chain,chain_id,amount,amount_usd,amount_units,verification_config,created_at,status,confirmed_at) VALUES(?,?,?,?,'wallet','USDC','token','Base',8453,?,?,?,'{}',?,'CONFIRMED',?)").run(id,id,id,slot,String(price),price,String(price*1000000),now,now);
      db.sqlite.prepare('UPDATE slots SET holder_sponsorship_id=?,current_price_units=?,claim_count=1 WHERE id=?').run(id,String(price*1000000),slot);
    }
    // Historical outbid sponsor is intentionally excluded from campaign results.
    db.sqlite.prepare("INSERT INTO sponsors(id,project_name,x_handle,contact_name,email,wallet_address,logo_url,created_at) VALUES('old','Old project','@old','Name','old@example.com','old-wallet','logo',?)").run(now);
    db.sqlite.prepare("INSERT INTO sponsorships(id,secret,slot_number,position,price_usd,claim_price_units,sponsor_id,reserved_until,terms_accepted,created_at,updated_at,status,claim_sequence) VALUES('old','secret',1,'Front',350,'350000000','old',?,1,?,?,'OUTBID',1)").run(now,now,now);
    db.sqlite.prepare("INSERT INTO payments(id,sponsor_id,sponsorship_id,slot_id,wallet_address,token,token_contract,chain,chain_id,amount,amount_usd,amount_units,verification_config,created_at,status,confirmed_at,refund_status) VALUES('old','old','old',1,'old-wallet','USDC','token','Base',8453,'350',350,'350000000','{}',?,'CONFIRMED',?,'REFUNDED')").run(now,now);
    db.sqlite.prepare("UPDATE auction_campaign SET ends_at=?,status='CLOSED'").run(now);
    const results=await Promise.all([settleCampaign(now),settleCampaign(now)]);
    assert.equal(results[0].status,successful?'SUCCESSFUL':'REFUNDED');
    const type=successful?'CAMPAIGN_SUCCESS':'CAMPAIGN_REFUND';
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM notifications WHERE type=?').get(type)!.n,entries.length);
    // Concurrent sends carry stable provider keys; a provider handles any overlap.
    assert.ok(messages.length>=entries.length);
    for(const message of messages){assert.ok(message.text.includes(successful?'final sponsor':'Refund status: Pending'));assert.ok(!message.to.includes('old@example.com'));}
    const sent=messages.length;await settleCampaign(now+1000);assert.equal(messages.length,sent);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE status='SENT'").get()!.n,entries.length);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type='REFUND_CONFIRMED'").get()!.n,0);
    if(!successful)assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM payments WHERE refund_status='REFUND_PENDING'").get()!.n,entries.length);
  }finally{globalThis.fetch=originalFetch;delete (env as any).RESEND_API_KEY;delete (env as any).SPONSOR_FROM_EMAIL;db.sqlite.close();}
});
