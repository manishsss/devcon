export const USDC_SCALE = BigInt(1_000_000);
export const AUCTION_DURATION_MS = 4 * 24 * 60 * 60 * 1000;
export const TARGET_UNITS = BigInt(2_200) * USDC_SCALE;
export const THRESHOLD_UNITS = TARGET_UNITS / BigInt(2);
export const INITIAL_PRICES = [350, 350, 300, 300, 250, 250, 200, 200] as const;

export type AuctionStatus = 'UPCOMING' | 'LIVE' | 'CLOSED' | 'REFUNDED' | 'SUCCESSFUL';

export function dollarsToUnits(value: number) {
  if (!Number.isInteger(value) || value < 0) throw new Error('USDC dollar values must be non-negative integers.');
  return BigInt(value) * USDC_SCALE;
}

export function initialPriceUnits(slotNumber: number) {
  const price = INITIAL_PRICES[slotNumber - 1];
  if (!price) throw new Error('Invalid sponsorship slot.');
  return dollarsToUnits(price);
}

export function nextClaimUnits(currentUnits: bigint) {
  if (currentUnits <= BigInt(0)) throw new Error('Current price must be positive.');
  return (currentUnits * BigInt(3) + BigInt(1)) / BigInt(2);
}

export function formatUsdcUnits(input: string | bigint, minimumFractionDigits = 0) {
  const units = typeof input === 'bigint' ? input : BigInt(input);
  const negative = units < BigInt(0);
  const absolute = negative ? -units : units;
  const whole = absolute / USDC_SCALE;
  const fraction = (absolute % USDC_SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  const padded = fraction.padEnd(Math.min(6, Math.max(minimumFractionDigits, fraction.length)), '0');
  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}${padded ? `.${padded}` : ''}`;
}

export function effectiveAuctionStatus(status: AuctionStatus, endsAt: number | null, now: number): AuctionStatus {
  return status === 'LIVE' && endsAt !== null && now >= endsAt ? 'CLOSED' : status;
}

export function claimPriceUnits(initialUnits: bigint, currentUnits: bigint | null) {
  return currentUnits === null ? initialUnits : nextClaimUnits(currentUnits);
}
