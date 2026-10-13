import {beforeEach,afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from './database.mjs';
import {env,backgroundTasks} from './runtime.mjs';
import {initialize} from '../lib/campaign';
import {runPaymentMonitor,runBackgroundMonitor,monitoringHealth} from '../lib/payment-monitor';
import {POST,GET} from '../app/api/[...path]/route';
let db:ReturnType<typeof database>;
beforeEach(async()=>{db=database();Object.assign(env,{DB:db,MAINTENANCE_TOKEN:'x'.repeat(64)});await initialize();});
afterEach(async()=>{await Promise.allSettled(backgroundTasks.splice(0));delete (env as any).MAINTENANCE_TOKEN;db.sqlite.close();});
function pending(id='p',created=Date.now()-7200000,method='WALLET'){
  const units=method==='QR'?'349999000':'350000000';
  db.sqlite.prepare("INSERT INTO sponsors(id,project_name,x_handle,contact_name,email,wallet_address,logo_url,created_at) VALUES(?,?,'x','test','test@example.com',?,'logo',?)").run(id,id,id,created);
  db.sqlite.prepare("INSERT INTO sponsorships(id,secret,slot_number,position,price_usd,claim_price_units,sponsor_id,reserved_until,terms_accepted,created_at,updated_at,status) VALUES(?,'private',1,'Front',350,'350000000',?,?,1,?,?,'EXPIRED')").run(id,id,created+300000,created,created);
  if(method==='QR')db.sqlite.prepare("INSERT INTO qr_payment_amounts VALUES(8453,'token','treasury',?,?,?)").run(units,id,created);
  db.sqlite.prepare("INSERT INTO payments(id,sponsor_id,sponsorship_id,slot_id,wallet_address,token,token_contract,chain,chain_id,amount,amount_usd,amount_units,verification_config,created_at,status,payment_method) VALUES(?,?,?,1,?,'USDC','token','Base',8453,'350',350,?,'{}',?,'EXPIRED',?)").run(id,id,id,id,units,created,method);
}
test('older expired payments remain monitored; failures are sanitized, persisted, backed off and cleared on recovery',async()=>{
  pending();const now=Date.now();
  const failed=await runPaymentMonitor(db,async()=>{throw Error('RPC https://provider.example/?key=private wallet details');},now);
  assert.equal(failed.failed,1);
  const p:any=db.sqlite.prepare('SELECT * FROM payments').get();assert.equal(p.verification_error,'VERIFICATION_UNAVAILABLE');assert.equal(p.verification_attempts,1);assert.ok(p.verification_next_at>now);
  assert.equal((await runPaymentMonitor(db,async()=>{},now+1)).processed,0);
  assert.equal((await runPaymentMonitor(db,async()=>({status:'PENDING'}),now+60001)).succeeded,1);
  assert.equal(db.sqlite.prepare('SELECT verification_error FROM payments').get()!.verification_error,null);
});
test('bounded batches rotate fairly and never touch terminal payment or refund records',async()=>{
  const now=Date.now();for(let i=0;i<10;i++)pending('p'+i,now-7200000+i);
  const seen:string[]=[];const verify=async(body:any)=>{seen.push(body.id);return {status:'PENDING'};};
  assert.equal((await runPaymentMonitor(db,verify,now)).processed,8);
  assert.equal((await runPaymentMonitor(db,verify,now+1)).processed,2);
  assert.equal(new Set(seen).size,10);
  db.sqlite.prepare("UPDATE payments SET status='CONFIRMED',refund_status='REFUNDED' WHERE id='p0'").run();
  await runPaymentMonitor(db,verify,now+700000);
  const p:any=db.sqlite.prepare("SELECT status,refund_status FROM payments WHERE id='p0'").get();assert.equal(p.status,'CONFIRMED');assert.equal(p.refund_status,'REFUNDED');
});
test('active verification leases defer processing and expired leases can be retried',async()=>{
  pending();const now=Date.now();db.sqlite.prepare("UPDATE payments SET verification_lock='active',verification_lock_until=?").run(now+50000);
  assert.equal((await runPaymentMonitor(db,async()=>{},now)).processed,0);
  assert.equal((await runPaymentMonitor(db,async()=>{},now+50001)).processed,1);
  db.sqlite.prepare("UPDATE payments SET verification_next_at=NULL,verification_lock_until=NULL").run();
  assert.equal((await runPaymentMonitor(db,async()=>{},now+60000)).processed,0);
  assert.equal((await monitoringHealth(db)).backlog.legacy_locks,1);
});
test('overlapping monitor runs skip safely and only scheduler calls update scheduler health',async()=>{
  pending();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const first=runBackgroundMonitor(db,async()=>{await gate;return {status:'PENDING'};},'admin');
  await new Promise(r=>setImmediate(r));
  assert.equal((await runBackgroundMonitor(db,async()=>{throw Error('Should not run');},'scheduler')).skipped,true);
  release();await first;
  const health=await monitoringHealth(db);assert.ok(health.state.last_finished_at);assert.equal(health.schedulerStale,false);
  db.sqlite.prepare('UPDATE payment_monitor_state SET last_scheduled_at=NULL').run();
  await runBackgroundMonitor(db,async()=>{},'admin');assert.equal((await monitoringHealth(db)).schedulerStale,true);
});
test('scheduler endpoint denies missing and invalid credentials, requires POST and records an authenticated empty run',async()=>{
  const context={params:Promise.resolve({path:['maintenance','monitor']})};
  for(const authorization of ['', 'Bearer wrong']){
    const response=await POST(new Request('https://site.test/api/maintenance/monitor',{method:'POST',headers:{authorization}}),context);assert.equal(response.status,403);
  }
  assert.equal((await GET(new Request('https://site.test/api/maintenance/monitor'),context)).status,405);
  assert.equal((await monitoringHealth(db)).state.last_started_at,null);
  const response=await POST(new Request('https://site.test/api/maintenance/monitor',{method:'POST',headers:{authorization:'Bearer '+'x'.repeat(64)}}),context);
  assert.equal(response.status,200);assert.equal(((await response.json()) as any).processed,0);assert.equal((await monitoringHealth(db)).schedulerStale,false);
});

test('cancelled QR payments remain in monitoring and backlog while unpaid cancelled wallet payments are excluded',async()=>{
  pending('qr',Date.now()-7200000,'QR');pending('wallet');
  db.sqlite.prepare("UPDATE payments SET status='CANCELLED'").run();
  assert.equal((await monitoringHealth(db)).backlog.unresolved,1);
  const seen:string[]=[];
  await runPaymentMonitor(db,async body=>{seen.push(body.id);return {status:'PENDING'};});
  assert.deepEqual(seen,['qr']);
});

test('an expired monitor lease is recovered and a healthy scheduler run releases its lock',async()=>{
  pending();const now=Date.now();
  db.sqlite.prepare("UPDATE payment_monitor_state SET lock_token='crashed-worker',lock_until=?,last_scheduled_at=? WHERE id=1").run(now-1,now-240000);
  assert.equal((await monitoringHealth(db,now)).schedulerStale,true);
  assert.equal((await runBackgroundMonitor(db,async()=>({status:'PENDING'}),'scheduler',now)).processed,1);
  const state=db.sqlite.prepare('SELECT * FROM payment_monitor_state').get()!;
  assert.equal(state.lock_token,null);assert.equal(state.lock_until,null);
  assert.equal((await monitoringHealth(db)).schedulerStale,false);
});

test('inventory returns live slot data before its slow payment monitor finishes',async()=>{
  pending();
  const originalFetch=globalThis.fetch;let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  globalThis.fetch=async()=>{await gate;return Response.json({jsonrpc:'2.0',id:1,result:'0x2105'});};
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const response=await Promise.race([
      GET(new Request('https://site.test/api/inventory'),{params:Promise.resolve({path:['inventory']})}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Inventory waited for payment monitoring')),1000);}),
    ]);
    assert.equal(response.status,200);assert.equal(((await response.json()) as any).slots.length,8);
    assert.ok(response.headers.get('server-timing')?.includes('inventory;dur='));
    assert.equal(backgroundTasks.length,1);
  }finally{
    if(timer)clearTimeout(timer);release();await Promise.allSettled(backgroundTasks.splice(0));globalThis.fetch=originalFetch;
  }
});
