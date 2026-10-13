import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFastRpc} from '../lib/read-rpc';
const original=globalThis.fetch;
afterEach(()=>{globalThis.fetch=original;});
const response=(value:unknown)=>Response.json({jsonrpc:'2.0',id:1,result:value});

test('a stalled primary cannot block a verified fallback during checkout preparation',{timeout:2000},async()=>{
 let primaryCancelled=false;const calls:{url:string;method:string}[]=[];
 globalThis.fetch=async(input,init)=>{
  const {method}=JSON.parse(String(init?.body));calls.push({url:String(input),method});
  if(String(input)==='https://stalled.example')return new Promise((_,reject)=>{init?.signal?.addEventListener('abort',()=>{primaryCancelled=true;reject(new DOMException('Cancelled','AbortError'));});});
  return response(method==='eth_chainId'?'0x2105':'0x123');
 };
 assert.equal(await readFastRpc({rpc:'https://stalled.example',chainId:8453},'eth_blockNumber',[]),'0x123');
 assert.ok(primaryCancelled);assert.deepEqual(calls.slice(1).map(x=>x.method),['eth_chainId','eth_blockNumber']);
});
test('wrong-chain providers cannot supply preparation data',{timeout:2000},async()=>{
 const calls:{url:string;method:string}[]=[];
 globalThis.fetch=async(input,init)=>{
  const {method}=JSON.parse(String(init?.body));const url=String(input);calls.push({url,method});
  if(url==='https://bad.example')return response('0x1');
  return response(method==='eth_chainId'?'0x2105':'0x6');
 };
 assert.equal(await readFastRpc({rpc:'https://bad.example',chainId:8453},'eth_call',[{to:'token'},'latest']),'0x6');
 assert.ok(calls.filter(x=>x.url==='https://bad.example').every(x=>x.method==='eth_chainId'));
});
test('RPC budgets and read-only restrictions remain enforced',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return response('0x2105');};
 await assert.rejects(readFastRpc({rpc:'https://rpc.example',chainId:8453},'eth_chainId',[],async()=>{throw Object.assign(Error('Request limit reached'),{status:429});}),(error:any)=>error.status===429);
 assert.equal(calls,0);
 await assert.rejects(readFastRpc({rpc:'https://rpc.example',chainId:8453},'eth_sendRawTransaction',[]),/Only checkout/);assert.equal(calls,0);
});
