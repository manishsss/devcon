import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkoutNetwork} from '../lib/checkout-network';
const input={chainId:8453,tokenAddress:'0x'+'a'.repeat(40),decimals:6,wallet:'0x'+'b'.repeat(40),requiredUnits:BigInt(350000000),qr:true};

test('QR network reads all start before any finishes, without requesting a wallet balance',async()=>{
 const calls:string[]=[];let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const result=checkoutNetwork(async method=>{calls.push(method);await gate;return method==='eth_chainId'?'0x2105':method==='eth_call'?'0x6':'0x64';},input);
 assert.deepEqual(calls,['eth_chainId','eth_call','eth_blockNumber']);
 release();assert.equal(await result,100);
});

test('wallet network reads include a balance check and preserve insufficient-balance rejection',async()=>{
 const calls:unknown[][]=[];
 await assert.rejects(checkoutNetwork(async(method,params)=>{
  calls.push(params);
  return method==='eth_chainId'?'0x2105':method==='eth_blockNumber'?'0x64':(params[0] as any).data==='0x313ce567'?'0x6':'0x0';
 },{...input,qr:false}),/enough USDC/);
 assert.equal(calls.length,4);
});

for(const failure of ['chain','decimals','head'])test(`parallel checkout still rejects invalid ${failure}`,async()=>{
 await assert.rejects(checkoutNetwork(async method=>method==='eth_chainId'?(failure==='chain'?'0x1':'0x2105'):method==='eth_call'?(failure==='decimals'?'0x12':'0x6'):(failure==='head'?'bad':'0x64'),input));
});
