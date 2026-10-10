import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source=readFileSync('lib/payment.ts','utf8').split('export async function verifyRefund')[1];
const js=ts.transpile(`async function verifyRefund${source}`,{target:ts.ScriptTarget.ES2022});
const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const treasury=`0x${'1'.repeat(40)}`,wallet=`0x${'2'.repeat(40)}`,token=`0x${'3'.repeat(40)}`;
const addressTopic=address=>`0x${address.slice(2).padStart(64,'0')}`;
const payment={confirmed_at:100000,refund_eligible_at:100000,chain_id:8453,token_contract:token,wallet_address:wallet,refund_amount_units:'350000000',verification_config:JSON.stringify({treasury,confirmations:12})};
let chain=8453,head=111,receipt;
const reset=()=>{chain=8453;head=111;receipt={status:'0x1',blockNumber:'0x64',logs:[{address:token,topics:[topic,addressTopic(treasury),addressTopic(wallet)],data:'0x14dc9380'}]};};
const rpc=async(_,method)=>method==='eth_chainId'?chain:method==='eth_blockNumber'?head:method==='eth_getBlockByNumber'?{timestamp:'0x65'}:receipt;
const verify=new Function('rpc','TRANSFER_TOPIC','addressFromTopic',`${js};return verifyRefund;`)(rpc,topic,value=>`0x${value.slice(-40)}`);
reset();await verify(payment,'hash');
for(const mutate of [()=>chain=1,()=>receipt=null,()=>receipt.status='0x0',()=>head=105,()=>receipt.logs[0].data='0x1',()=>receipt.logs[0].address=wallet,()=>receipt.logs[0].topics[2]=addressTopic(treasury),()=>receipt.logs.push(receipt.logs[0])]){
  reset();mutate();await assert.rejects(()=>verify(payment,'hash'));
}
const networksJs=ts.transpile(readFileSync('lib/payment-networks.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const {PAYMENT_NETWORKS}=await import('data:text/javascript;base64,'+Buffer.from(networksJs).toString('base64'));
let checks=9;
for(const network of PAYMENT_NETWORKS)for(const asset of network.tokens){
  reset();chain=network.id;receipt.logs[0].address=asset.address;
  const original={...payment,chain_id:network.id,token_contract:asset.address};
  await verify(original,'hash');checks++;
  chain=network.id===1?8453:1;
  await assert.rejects(()=>verify(original,'hash'));checks++;
  chain=network.id;receipt.logs[0].address=token;
  await assert.rejects(()=>verify(original,'hash'));checks++;
}
console.log(`${checks} refund receipt and cross-network validation checks passed.`);
