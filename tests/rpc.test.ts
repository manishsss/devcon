import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readRpc, RPC_ALTERNATES } from '../lib/read-rpc';
import { PAYMENT_NETWORKS } from '../lib/payment-networks';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const response=(result:unknown)=>Response.json({jsonrpc:'2.0',id:1,result});
for(const network of PAYMENT_NETWORKS)test(`${network.name}: failed primary falls back to a chain-verified provider without changing call parameters`,async()=>{
 const calls:{url:string;method:string;params:unknown[]}[]=[];
 const params=[{to:network.tokens[0].address,data:'0x313ce567'},'latest'];
 globalThis.fetch=async(input,init)=>{
  const body=JSON.parse(String(init?.body));calls.push({url:String(input),...body});
  if(String(input)==='https://unavailable.example')return new Response('',{status:503});
  return response(body.method==='eth_chainId'?'0x'+network.id.toString(16):'0x6');
 };
 assert.equal(await readRpc({rpc:'https://unavailable.example',chainId:network.id},'eth_call',params),'0x6');
 assert.equal(calls[1].method,'eth_chainId');assert.deepEqual(calls[2].params,params);
 assert.equal(calls[2].url,RPC_ALTERNATES[network.id][0]);
});

for(const failure of ['rate limit','RPC error','invalid JSON','timeout','missing result'])test(`recovers from ${failure}`,async()=>{
 globalThis.fetch=async(input,init)=>{
  if(String(input)==='https://unavailable.example'){
   if(failure==='rate limit')return new Response('',{status:429});
   if(failure==='RPC error')return Response.json({error:{code:-32005}});
   if(failure==='invalid JSON')return new Response('<html>Blocked</html>');
   if(failure==='missing result')return Response.json({jsonrpc:'2.0',id:1});
   throw new DOMException('Timed out','TimeoutError');
  }
  return response(JSON.parse(String(init?.body)).method==='eth_chainId'?'0x2105':'0x123');
 };
 assert.equal(await readRpc({rpc:'https://unavailable.example',chainId:8453},'eth_blockNumber',[]),'0x123');
});

test('wrong-chain alternates cannot supply token data',async()=>{
 const methods:string[]=[];
 globalThis.fetch=async(_input,init)=>{const {method}=JSON.parse(String(init?.body));methods.push(method);return method==='eth_chainId'?response('0x1'):new Response('',{status:503});};
 await assert.rejects(readRpc({rpc:'https://unavailable.example',chainId:8453},'eth_call',[]),/temporarily unavailable/);
 assert.equal(methods.filter(x=>x==='eth_call').length,1);
});

test('all failed providers fail closed; transaction submission is forbidden',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:503});};
 await assert.rejects(readRpc({rpc:RPC_ALTERNATES[8453][0],chainId:8453},'eth_chainId',[]));
 assert.equal(calls,RPC_ALTERNATES[8453].length);
 await assert.rejects(readRpc({rpc:RPC_ALTERNATES[8453][0],chainId:8453},'eth_sendRawTransaction',[]),/Only payment verification reads/);
 assert.equal(calls,RPC_ALTERNATES[8453].length);
});

test('a pending receipt remains pending instead of being replaced by another provider',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return response(null);};
 assert.equal(await readRpc({rpc:RPC_ALTERNATES[8453][0],chainId:8453},'eth_getTransactionReceipt',['0xhash']),null);
 assert.equal(calls,1);
});
