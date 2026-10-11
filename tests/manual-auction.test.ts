import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from './runtime.mjs';
import { database } from './database.mjs';
import { initialize, inventory, settleCampaign, closeManualAuction } from '../lib/campaign';

test('manual activation opens purchases without a deadline and initialization never resets it', async () => {
  const db=database();
  Object.assign(env,{DB:db,MANUAL_AUCTION_ENABLED:'1'});
  try {
    await initialize();
    const first:any=db.sqlite.prepare('SELECT * FROM auction_campaign').get();
    assert.equal(first.status,'LIVE');assert.equal(first.ends_at,null);
    assert.equal((await inventory()).claimsOpen,true);
    assert.equal((await settleCampaign(Date.now()+10*86400000)).status,'LIVE');
    await initialize();
    assert.equal(db.sqlite.prepare('SELECT starts_at FROM auction_campaign').get()!.starts_at,first.starts_at);
    const results=await Promise.allSettled([closeManualAuction(),closeManualAuction()]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await inventory()).claimsOpen,false);
    await initialize();assert.equal(db.sqlite.prepare('SELECT status FROM auction_campaign').get()!.status,'REFUNDED');
  } finally {delete (env as any).MANUAL_AUCTION_ENABLED;db.sqlite.close();}
});

test('manual close is refused when manual mode is disabled', async()=>{
  const db=database();Object.assign(env,{DB:db});
  try{await initialize();await assert.rejects(closeManualAuction());assert.equal((await inventory()).claimsOpen,false);}
  finally{db.sqlite.close();}
});
