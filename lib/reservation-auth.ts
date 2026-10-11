import { verifyMessage } from 'viem';

// Bind the signed intent to all submitted fields and the exact uploaded logo.
export async function reservationDigest(form: FormData) {
  const fields = ['slot','chainId','token','project','x','website','contact','email','wallet','description','terms'];
  const logo = form.get('logo') as File;
  if (!logo || typeof logo.arrayBuffer !== 'function') throw new Error('Upload a logo.');
  const logoHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await logo.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const payload = JSON.stringify([...fields.map(k=>[k,String(form.get(k)||'').trim()]),['logo',logoHash]]);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function reservationMessage(value:{origin:string;id:string;wallet:string;slot:number;chain:number;token:string;amount:string;treasury:string;expires:number;digest:string}) {
  return `Devcon sponsorship reservation\nSite: ${value.origin}\nReservation: ${value.id}\nWallet: ${value.wallet.toLowerCase()}\nSpot: ${value.slot}\nChain: ${value.chain}\nToken: ${value.token.toLowerCase()}\nAmount (USDC units): ${value.amount}\nTreasury: ${value.treasury.toLowerCase()}\nExpires: ${value.expires}\nSubmitted details: ${value.digest}\nThis signature authorizes only this reservation. It does not transfer funds.`;
}
export async function verifyReservationSignature(wallet:string,message:string,signature:string) {
  if(!/^0x[0-9a-fA-F]{130}$/.test(signature)||!await verifyMessage({address:wallet as `0x${string}`,message,signature:signature as `0x${string}`})) throw new Error('Wallet signature does not authorize this reservation.');
}
