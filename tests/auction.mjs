import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('lib/auction.ts', 'utf8')
  .replace(/^export type .*$/gm, '')
  .replace(/export /g, '');
const code = ts.transpile(source, { target: ts.ScriptTarget.ES2022 });
const helpers = new Function(`${code};return {USDC_SCALE,AUCTION_DURATION_MS,TARGET_UNITS,THRESHOLD_UNITS,INITIAL_PRICES,dollarsToUnits,initialPriceUnits,nextClaimUnits,formatUsdcUnits,effectiveAuctionStatus,claimPriceUnits};`)();

assert.deepEqual([...helpers.INITIAL_PRICES], [350,350,300,300,250,250,200,200]);
assert.equal(helpers.AUCTION_DURATION_MS, 345_600_000);
assert.equal(helpers.TARGET_UNITS, BigInt(2_200_000_000));
assert.equal(helpers.THRESHOLD_UNITS, BigInt(1_100_000_000));

const first = helpers.initialPriceUnits(1);
const second = helpers.nextClaimUnits(first);
const third = helpers.nextClaimUnits(second);
const fourth = helpers.nextClaimUnits(third);
assert.equal(first, BigInt(350_000_000));
assert.equal(second, BigInt(525_000_000));
assert.equal(third, BigInt(787_500_000));
assert.equal(fourth, BigInt(1_181_250_000));
assert.equal(helpers.formatUsdcUnits(third, 2), '787.50');
assert.equal(helpers.formatUsdcUnits(fourth, 2), '1,181.25');
assert.equal(helpers.claimPriceUnits(first, null), first);
assert.equal(helpers.claimPriceUnits(first, second), third);

const end = 10_000;
assert.equal(helpers.effectiveAuctionStatus('LIVE', end, end - 1), 'LIVE');
assert.equal(helpers.effectiveAuctionStatus('LIVE', end, end), 'CLOSED');
assert.equal(helpers.effectiveAuctionStatus('SUCCESSFUL', end, end + 1), 'SUCCESSFUL');

const currentFunds = [second, BigInt(300_000_000)].reduce((sum,value)=>sum+value,BigInt(0));
const historicalPayments = [first, second, BigInt(300_000_000)].reduce((sum,value)=>sum+value,BigInt(0));
assert.equal(currentFunds, BigInt(825_000_000));
assert.equal(historicalPayments, BigInt(1_175_000_000));
assert.notEqual(currentFunds, historicalPayments, 'outbid money is excluded from current funds');

assert.equal(BigInt(1_099_999_999)>=helpers.THRESHOLD_UNITS,false);
assert.equal(BigInt(1_100_000_000)>=helpers.THRESHOLD_UNITS,true);
assert.equal(BigInt(2_200_000_000)>=helpers.THRESHOLD_UNITS,true);
console.log('21 auction pricing, deadline and net-funds checks passed.');
