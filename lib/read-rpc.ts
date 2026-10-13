import { PAYMENT_NETWORKS } from './payment-networks';

// Public read endpoints only. No wallet keys or transaction submission.
export const RPC_ALTERNATES: Record<number, string[]> = {
  1: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
  42161: ['https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc'],
  137: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'],
  8453: ['https://base-rpc.publicnode.com', 'https://base.drpc.org', 'https://mainnet.base.org'],
  5042: ['https://rpc.drpc.mainnet.arc.io', 'https://rpc.quicknode.mainnet.arc.io', 'https://rpc.mainnet.arc.io'],
};
const READ_METHODS = new Set(['eth_chainId','eth_call','eth_blockNumber','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getLogs']);

async function request(endpoint: string, method: string, params: unknown[],budget?:()=>Promise<void>,signal?:AbortSignal) {
  signal?.throwIfAborted();
  if(budget)await budget();
  signal?.throwIfAborted();
  const response = await fetch(endpoint, {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}), signal:signal?AbortSignal.any([signal,AbortSignal.timeout(4000)]):AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json() as {jsonrpc?:string;id?:number;result?:unknown;error?:{code?:number}};
  if (body.error) throw new Error(`RPC ${body.error.code ?? 'error'}`);
  if (body.jsonrpc!=='2.0' || body.id!==1 || !Object.hasOwn(body,'result')) throw new Error('Invalid RPC response');
  if (body.result===null && !['eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber'].includes(method)) throw new Error('Missing RPC result');
  return body.result;
}

// Checkout preparation only. Verification continues to use the sequential reader.
// A slow primary no longer delays trying a chain-verified alternate.
export async function readFastRpc(config:{rpc:string;chainId:number},method:string,params:unknown[],budget?:()=>Promise<void>){
  if(!['eth_chainId','eth_call','eth_blockNumber'].includes(method))throw new Error('Only checkout network preparation reads are allowed.');
  const network=PAYMENT_NETWORKS.find(item=>item.id===config.chainId);
  if(!network)throw new Error('Unsupported checkout network.');
  const endpoints=[...new Set([config.rpc,...RPC_ALTERNATES[network.id]])];
  const controller=new AbortController();
  let rateLimitReject!:(error:unknown)=>void;
  const rateLimit=new Promise<never>((_,reject)=>{rateLimitReject=reject;});
  const attempts=endpoints.map(async(endpoint,index)=>{
    try{
      if(index)await new Promise<void>((resolve,reject)=>{
        const stop=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
        const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',stop);resolve();},index*250);
        controller.signal.addEventListener('abort',stop,{once:true});
      });
      const chain=await request(endpoint,'eth_chainId',[],budget,controller.signal);
      if(Number(chain)!==network.id)throw new Error('Wrong RPC chain');
      return method==='eth_chainId'?chain:await request(endpoint,method,params,budget,controller.signal);
    }catch(error){if((error as any)?.status===429){rateLimitReject(error);controller.abort();}throw error;}
  });
  try{return await Promise.race([Promise.any(attempts),rateLimit]);}
  catch(error){if((error as any)?.status===429)throw error;throw new Error(`${network.name} verification is temporarily unavailable across its providers. Please retry. Your payment status has not changed.`);}
  finally{controller.abort();}
}

export async function readRpc(config: {rpc:string;chainId?:number}, method:string, params:unknown[],budget?:()=>Promise<void>) {
  if (!READ_METHODS.has(method)) throw new Error('Only payment verification reads are allowed.');
  const expected = Number(config.chainId);
  const network = PAYMENT_NETWORKS.find(item=>item.id===expected);
  const endpoints = [...new Set([config.rpc, ...(network ? RPC_ALTERNATES[network.id] : [])])];
  for (const [index,endpoint] of endpoints.entries()) {
    try {
      // Every alternate must identify as the originally selected chain.
      if (index>0 && Number(await request(endpoint,'eth_chainId',[],budget))!==expected) throw new Error('Wrong RPC chain');
      const result = await request(endpoint,method,params,budget);
      if (method==='eth_chainId' && network && Number(result)!==expected) throw new Error('Wrong RPC chain');
      return result;
    } catch (error) {
      if((error as any)?.status===429)throw error;
      // No wallet, parameters, payment hash, credentials or endpoint query in logs.
      let host='invalid';try {host=new URL(endpoint).hostname;}catch{}
      const raw=error instanceof Error?error.message:'';
      const reason=/^(HTTP \d{3}|RPC -?\d+|Wrong RPC chain|Invalid RPC response|Missing RPC result)$/.test(raw)?raw:'Transport failure';
      console.warn(JSON.stringify({event:'payment_rpc_unavailable',chainId:network?.id??null,method,provider:host,reason}));
    }
  }
  throw new Error(`${network?.name || 'Network'} verification is temporarily unavailable across its providers. Please retry. Your payment status has not changed.`);
}
