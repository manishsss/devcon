import { verifyMessage, type Address, type Hex } from 'viem';
import { db } from './campaign';

// Bind the signature to all submitted brand details, including the exact logo.
export async function checkoutDigest(form: FormData, origin: string, treasury: string, priceUnits: string) {
  const fields = ['slot','chainId','token','project','x','website','contact','email','wallet','description','terms'];
  const logo = form.get('logo') as File;
  const logoHash = await crypto.subtle.digest('SHA-256', await logo.arrayBuffer());
  const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
  const value = JSON.stringify([origin,treasury.toLowerCase(),priceUnits,...fields.map(key => String(form.get(key) || '').trim()),hex(logoHash)]);
  return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
}

export async function createAuthorization(input: { wallet: string; digest: string; origin: string; project: string; slot: number; network: string; chainId: number; price: string; treasury: string; expiresAt: number }) {
  const id = crypto.randomUUID();
  const message = [
    'Authorize a Devcon sponsorship checkout',
    `Website: ${input.origin}`,
    `Project: ${input.project}`,
    `Slot: ${input.slot}`,
    `Payment: ${input.price} USDC on ${input.network} (chain ${input.chainId})`,
    `Recipient: ${input.treasury}`,
    `Wallet: ${input.wallet}`,
    `Expires: ${new Date(input.expiresAt).toISOString()}`,
    `Nonce: ${id}`,
    `Checkout digest: ${input.digest}`,
    'This signature proves wallet ownership and authorizes one reservation. It does not transfer funds or approve token spending.',
  ].join('\n');
  await db().prepare('DELETE FROM checkout_authorizations WHERE expires_at<?').bind(Date.now()).run();
  await db().prepare('INSERT INTO checkout_authorizations(id,wallet_address,intent_hash,message,expires_at) VALUES(?,?,?,?,?)')
    .bind(id,input.wallet.toLowerCase(),input.digest,message,input.expiresAt).run();
  return { id,message,expiresAt:input.expiresAt };
}

export async function verifyAuthorization(form: FormData, wallet: string, digest: string) {
  const id = String(form.get('authorization') || '');
  const signature = String(form.get('signature') || '');
  if(!/^[0-9a-f-]{36}$/i.test(id)||!/^0x[0-9a-f]{130}$/i.test(signature))throw new Error('Sign the checkout message with your payment wallet before reserving.');
  const challenge: { wallet_address: string; intent_hash: string; message: string; expires_at: number; consumed_by: string | null } | null = await db().prepare('SELECT * FROM checkout_authorizations WHERE id=?').bind(id).first();
  if(!challenge||challenge.consumed_by||challenge.expires_at<=Date.now()||challenge.wallet_address!==wallet.toLowerCase()||challenge.intent_hash!==digest)throw new Error('The checkout authorization expired, was used, or no longer matches these details. Sign again.');
  if(!await verifyMessage({address:wallet as Address,message:challenge.message,signature:signature as Hex}))throw new Error('The signature does not belong to the payment wallet.');
  return id;
}
