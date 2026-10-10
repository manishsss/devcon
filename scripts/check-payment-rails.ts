import { PAYMENT_NETWORKS, TREASURY_WALLET_ADDRESS } from '../lib/payment-networks';

// Read-only deployment check. Does not connect a wallet or send transactions.
let failed=false;
await Promise.all(PAYMENT_NETWORKS.map(async network=>{
  const rpc=process.env[`CHAIN_RPC_URL_${network.id}`]||network.rpc;
  const call=async(method:string,params:unknown[])=>{
    const response=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`RPC HTTP ${response.status}`);
    const body=await response.json() as {result:unknown;error?:{message:string}};
    if(body.error)throw new Error(body.error.message);
    return body.result;
  };
  try{
    const [chainId,decimals,head]=await Promise.all([
      call('eth_chainId',[]),
      call('eth_call',[{to:network.tokens[0].address,data:'0x313ce567'},'latest']),
      call('eth_blockNumber',[]),
    ]);
    if(Number(chainId)!==network.id||Number(decimals)!==6||!/^0x[0-9a-f]+$/i.test(String(head)))throw new Error('Chain identity, token decimals or block head did not match');
    console.log(`${network.name}: OK · chain ${network.id} · USDC decimals 6 · head ${Number(head)}`);
  }catch(error){failed=true;console.error(`${network.name}: FAILED · ${error instanceof Error?error.message:'RPC unavailable'}`);}
}));
console.log(`Recipient: ${TREASURY_WALLET_ADDRESS}`);
if(failed)process.exitCode=1;
