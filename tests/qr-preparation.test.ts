import {test} from 'node:test';
import assert from 'node:assert/strict';
import {QrPreparationCache,qrPreparationCache} from '../lib/qr-preparation';

test('QR preparation shares concurrent reads, expires after 20 seconds, and isolates configuration keys',async()=>{
 let now=1000,calls=0,release!:(n:number)=>void;
 const cache=new QrPreparationCache(()=>now);
 const one=cache.get('rail',()=>{calls++;return new Promise(resolve=>{release=resolve;});});
 const two=cache.get('rail',async()=>{calls++;return 999;});
 await Promise.resolve();assert.equal(calls,1);release(100);
 assert.equal(await one,100);assert.equal(await two,100);
 assert.equal(await cache.get('rail',async()=>{calls++;return 200;}),100);
 assert.equal(await cache.get('changed-rpc',async()=>200),200);
 now=21000;assert.equal(await cache.get('rail',async()=>{calls++;return 300;}),300);assert.equal(calls,2);
});
test('failed preparation is not cached and different database bindings do not share entries',async()=>{
 const cache=new QrPreparationCache();await assert.rejects(cache.get('rail',async()=>{throw Error('RPC unavailable');}));
 assert.equal(await cache.get('rail',async()=>400),400);
 assert.notEqual(qrPreparationCache({}),qrPreparationCache({}));
});
