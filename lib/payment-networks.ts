export type PaymentToken = { symbol: 'USDC'; label: string; address: string; decimals: 6 };
export const TREASURY_WALLET_ADDRESS = '0x7c7ddb2c72725563816d5adc7137043d831ebcbe';
export type PaymentNetwork = { id: number; name: string; rpc: string; explorer: string; gas: string; confirmations: number; tokens: PaymentToken[] };
const token=(symbol:'USDC',address:string,label:string=symbol):PaymentToken=>({symbol,label,address,decimals:6});

// Issuer registries verified 2026-10-10. Arc's ERC-20 interface uses 6 decimals.
// https://developers.circle.com/stablecoins/usdc-contract-addresses
// https://docs.arc.io/arc/references/connect-to-arc
export const PAYMENT_NETWORKS:PaymentNetwork[]=[
  {id:1,name:'Ethereum',rpc:'https://ethereum-rpc.publicnode.com',explorer:'https://etherscan.io/tx/',gas:'ETH',confirmations:12,tokens:[token('USDC','0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')]},
  {id:42161,name:'Arbitrum',rpc:'https://arb1.arbitrum.io/rpc',explorer:'https://arbiscan.io/tx/',gas:'ETH',confirmations:64,tokens:[token('USDC','0xaf88d065e77c8cC2239327C5EDb3A432268e5831')]},
  {id:137,name:'Polygon',rpc:'https://polygon-bor-rpc.publicnode.com',explorer:'https://polygonscan.com/tx/',gas:'POL',confirmations:64,tokens:[token('USDC','0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359')]},
  {id:8453,name:'Base',rpc:'https://base-rpc.publicnode.com',explorer:'https://basescan.org/tx/',gas:'ETH',confirmations:12,tokens:[token('USDC','0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')]},
  {id:5042,name:'Arc',rpc:'https://rpc.drpc.mainnet.arc.io',explorer:'https://explorer.arc.io/tx/',gas:'USDC',confirmations:12,tokens:[token('USDC','0x3600000000000000000000000000000000000000')]},
];

export const QR_PAYMENT_NETWORKS = PAYMENT_NETWORKS.filter(network => network.id !== 5042);

export function paymentRail(chainId:unknown,symbol:unknown){
  const network=PAYMENT_NETWORKS.find(item=>item.id===Number(chainId));
  const asset=network?.tokens.find(item=>item.symbol===symbol);
  if(!network||!asset)throw new Error('Choose a supported network and token combination.');
  return {network,asset};
}
