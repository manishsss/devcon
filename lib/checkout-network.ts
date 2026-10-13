type Read = (method:string,params:unknown[])=>Promise<unknown>;
function identity(chainId:unknown,decimals:unknown,input:{chainId:number;decimals:number}){
  if(Number(chainId)!==input.chainId)throw new Error('The selected network is unavailable. No payment has been requested.');
  if(Number(decimals)!==input.decimals)throw new Error('Token validation failed. No payment has been requested.');
}
export function checkoutBlock(head:unknown){
  const startBlock=Number(head);
  if(!/^0x[0-9a-f]+$/i.test(String(head))||!Number.isSafeInteger(startBlock)||startBlock<0)throw new Error('The network returned an invalid block height. No payment has been requested.');
  return startBlock;
}
export async function checkoutNetworkIdentity(read:Read,input:{chainId:number;tokenAddress:string;decimals:number}){
  const [chainId,decimals]=await Promise.all([read('eth_chainId',[]),read('eth_call',[{to:input.tokenAddress,data:'0x313ce567'},'latest'])]);
  identity(chainId,decimals,input);return input.chainId;
}
export async function checkoutNetwork(read:Read,input:{chainId:number;tokenAddress:string;decimals:number;wallet:string;requiredUnits:bigint;qr:boolean}){
  const [chainId,decimals,head,balance]=await Promise.all([
    read('eth_chainId',[]),
    read('eth_call',[{to:input.tokenAddress,data:'0x313ce567'},'latest']),
    read('eth_blockNumber',[]),
    input.qr?Promise.resolve(input.requiredUnits):read('eth_call',[{to:input.tokenAddress,data:'0x70a08231'+input.wallet.slice(2).toLowerCase().padStart(64,'0')},'latest']),
  ]);
  identity(chainId,decimals,input);
  if(BigInt(String(balance))<input.requiredUnits)throw new Error('Your wallet needs enough USDC on the selected network before reserving this spot.');
  return checkoutBlock(head);
}
