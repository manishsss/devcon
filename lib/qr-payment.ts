const TAG_COUNT = 999;
const MILLI_USDC_UNITS = BigInt(1000);

export function exactUsdcAmount(units: bigint | string) {
  const value = BigInt(units);
  if (value <= BigInt(0)) throw new Error('Payment amount must be positive.');
  const fraction = (value % BigInt(1000000)).toString().padStart(6, '0').replace(/0+$/, '');
  return `${value / BigInt(1000000)}${fraction ? '.' + fraction : ''}`;
}

export function qrPriceAdjustment(baseUnits: bigint | string, amountUnits: bigint | string) {
  const difference = BigInt(amountUnits) - BigInt(baseUnits);
  return difference === BigInt(0) ? '0' : `${difference < BigInt(0) ? '-' : '+'}${exactUsdcAmount(difference < BigInt(0) ? -difference : difference)}`;
}

export function qrPaymentUri(input: { chainId: number; tokenAddress: string; treasury: string; amountUnits: string }) {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0 ||
      ![input.tokenAddress, input.treasury].every(address => /^0x[0-9a-fA-F]{40}$/.test(address)) ||
      !/^[1-9][0-9]*$/.test(input.amountUnits)) throw new Error('Invalid QR payment request.');
  // EIP-681 ERC-20 transfer request: token contract, explicit chain and micro-units.
  return `ethereum:${input.tokenAddress}@${input.chainId}/transfer?address=${input.treasury}&uint256=${input.amountUnits}`;
}

export async function qrClientKey(request: Request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function allocateQrAmount(database: any, input: {
  id: string; chainId: number; tokenAddress: string; treasury: string;
  baseUnits: bigint; clientKey: string; reservedUntil: number;
}, now = Date.now(), start = crypto.getRandomValues(new Uint32Array(1))[0] % TAG_COUNT) {
  if (input.baseUnits < BigInt(1000000)) throw new Error('QR sponsorship price must be at least 1 USDC.');
  // Round the candidate ceiling up, then subtract whole milli-USDC steps.
  // Even fractional takeover prices produce exact amounts strictly below the
  // listed price, with a discount below 1 USDC and at most three decimals.
  const ceiling = (input.baseUnits + MILLI_USDC_UNITS - BigInt(1)) / MILLI_USDC_UNITS * MILLI_USDC_UNITS;
  const client = await database.prepare('SELECT id FROM qr_payment_amounts WHERE client_key=? AND reserved_until>? LIMIT 1')
    .bind(input.clientKey, now).first();
  if (client) throw Object.assign(new Error('This connection already requested a QR checkout. Wait for its expiry before requesting another.'), { status: 429 });
  for (let attempt = 0; attempt < 64; attempt++) {
    const units = ceiling - BigInt((start + attempt) % TAG_COUNT + 1) * MILLI_USDC_UNITS;
    const result = await database.prepare(`INSERT OR IGNORE INTO qr_payment_amounts
      (id,chain_id,token_contract,treasury,amount_units,base_units,client_key,reserved_until,created_at)
      SELECT ?,?,?,?,?,?,?,?,?
      WHERE NOT EXISTS(SELECT 1 FROM payments WHERE chain_id=? AND lower(token_contract)=? AND amount_units=?)
      AND NOT EXISTS(SELECT 1 FROM qr_payment_amounts WHERE client_key=? AND reserved_until>?)`)
      .bind(input.id, input.chainId, input.tokenAddress.toLowerCase(), input.treasury.toLowerCase(), units.toString(), input.baseUnits.toString(), input.clientKey, input.reservedUntil, now,
        input.chainId, input.tokenAddress.toLowerCase(), units.toString(), input.clientKey, now).run();
    if (result.meta.changes) return units;
    if (await database.prepare('SELECT id FROM qr_payment_amounts WHERE client_key=? AND reserved_until>? LIMIT 1').bind(input.clientKey, now).first()) {
      throw Object.assign(new Error('This connection already requested a QR checkout. Wait for its expiry.'), { status: 429 });
    }
  }
  throw Object.assign(new Error('No unique QR amount is available. Please try again later.'), { status: 503 });
}
