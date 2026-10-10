import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpile(readFileSync('lib/payment-networks.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const {PAYMENT_NETWORKS,paymentRail}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
assert.deepEqual(PAYMENT_NETWORKS.map(n=>n.id),[1,42161,137,8453,5042]);
let checks=1;
for(const network of PAYMENT_NETWORKS){
  for(const asset of network.tokens){
    const rail=paymentRail(String(network.id),asset.symbol);
    assert.equal(rail.network.id,network.id);assert.equal(rail.asset.address,asset.address);
    assert.equal(asset.decimals,6);assert.match(asset.address,/^0x[0-9a-fA-F]{40}$/);
    checks+=4;
  }
}
for(const [chain,token] of [[1,'USDT'],[42161,'USDT'],[137,'USDT'],[8453,'USDT'],[5042,'USDT'],[5042002,'USDC'],[421614,'USDC'],[10,'USDC'],[56,'USDT'],[1,'ETH'],[1,'usdt'],[1,'0xdAC17F958D2ee523a2206206994597C13D831ec7']]){
  assert.throws(()=>paymentRail(chain,token));checks++;
}
console.log(`${checks} network allowlist and token amount checks passed.`);
