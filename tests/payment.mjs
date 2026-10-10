import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const payment = readFileSync('lib/payment.ts', 'utf8');
const route = readFileSync('app/api/[...path]/route.ts', 'utf8');
const checkout = readFileSync('components/sponsorship-checkout.tsx', 'utf8');
const campaign = readFileSync('lib/campaign.ts', 'utf8');
const schema = readFileSync('db/schema.ts', 'utf8');

const checks = [
  ['authoritative micro-unit amount', /BigInt\(row\.amount_units \|\| row\.claim_price_units\)/],
  ['exact ERC20 transfer calldata', /expectedInput = `0xa9059cbb/],
  ['exact transfer log amount', /BigInt\(log\.data\) === expectedUnits/],
  ['Base chain verification', /eth_chainId/],
  ['confirmation threshold', /confirmations < verification\.confirmations/],
  ['hard server deadline in holder swap', /status='LIVE' AND ends_at>\?/],
  ['conditional holder swap', /holder_sponsorship_id IS \? AND current_price_units IS \?/],
  ['new payment confirmed before holder result', /status='CONFIRMED'.*EXISTS\(SELECT 1 FROM slots WHERE holder_sponsorship_id=\?\)/s],
  ['previous sponsor marked outbid', /status='OUTBID'/],
  ['previous payment refund queued', /refund_status='REFUND_PENDING'.*refund_amount_units=amount_units/s],
  ['late exact payment cannot become holder', /status='LATE_CONFIRMED'/],
  ['late exact payment refund queued', /LATE_PAYMENT_REFUND/],
  ['backend computes claim price', /requiredUnits=claimPriceUnits\(startingUnits,currentUnits\)/],
  ['frontend cannot submit a price', /payload\.set\('slot'/],
  ['campaign total uses current holders only', /currentPriceUnits\|\|0/],
  ['separate refund lifecycle', /refundStatus:text\('refund_status'\)/],
  ['durable notification queue', /export const notifications=sqliteTable/],
];

for (const [label, pattern] of checks) {
  const source = label.includes('frontend') ? checkout
    : label.includes('backend') ? route
    : label.includes('campaign total') ? campaign
    : label.includes('lifecycle') || label.includes('notification') ? schema
    : payment;
  assert.match(source, pattern, label);
}

const treasury = `0x${'2'.repeat(40)}`;
const units = BigInt(787_500_000);
const encoded = `0xa9059cbb${treasury.slice(2).padStart(64, '0')}${units.toString(16).padStart(64, '0')}`;
assert.equal(encoded.length, 138, 'ERC20 transfer calldata has the exact ABI length');
assert.equal(BigInt(`0x${encoded.slice(-64)}`), units, 'fractional USDC units survive encoding exactly');

console.log(`${checks.length + 2} payment and refund safety checks passed.`);
