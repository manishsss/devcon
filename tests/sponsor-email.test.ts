import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT_CONFIRMED_EMAIL, campaignResultEmail, emailTypeEnabled, outbidEmail, paymentConfirmedEmail, refundConfirmedEmail, sendTransactionalEmail } from '../lib/sponsor-email';

test('confirmation copy uses the confirmed project, slot, network and exact USDC amount', () => {
  const copy = paymentConfirmedEmail({ project: 'Builder Project', slot: 3, amountUnits: '787500000', network: 'Arbitrum' });
  assert.equal(copy.subject, 'Your Devcon spot is confirmed');
  for (const text of ['Hey Builder Project,', 'Slot 03', '787.50 USDC', 'Network: Arbitrum', 'current holder', 'two Devcon days', 'Two short-form videos', 'appreciation post', 'Photos from Devcon']) assert.ok(copy.body.includes(text), text);
  assert.ok(!copy.body.includes('four-day'));
  assert.ok(!copy.body.includes('final sponsor'));
});

const input = { key: 'test-only-key', from: 'Manish <campaign@devcon.manishh.xyz>', to: 'sponsor@example.com', subject: 'Confirmed', text: 'Test confirmation', type: PAYMENT_CONFIRMED_EMAIL, notificationId: 'payment-confirmed:test' };

test('only the five approved email types are enabled, including when credentials exist', async () => {
  let calls = 0;
  const request = (async () => { calls++; return Response.json({ id: 'test-id' }); }) as typeof fetch;
  for (const type of [undefined, 'LATE_PAYMENT_REFUND', 'REFUNDED', 'LOGO_REVIEW', 'UNKNOWN']) {
    assert.equal(emailTypeEnabled(type), false);
    assert.equal(await sendTransactionalEmail({ ...input, type }, request), false);
  }
  assert.equal(calls, 0);
  for(const type of ['PAYMENT_CONFIRMED','OUTBID','REFUND_CONFIRMED','CAMPAIGN_SUCCESS','CAMPAIGN_REFUND']) assert.equal(emailTypeEnabled(type),true);
});

test('outbid and unsuccessful campaign copies describe pending refunds without claiming completion',()=>{
  const outbid=outbidEmail({project:'Original',slot:1,amountUnits:'350000000',newAmountUnits:'525000000'});
  assert.ok(outbid.body.includes('Your payment: 350 USDC'));
  assert.ok(outbid.body.includes('New claim amount: 525 USDC'));
  for(const copy of [outbid,campaignResultEmail({project:'Original',slot:1,amountUnits:'350000000',successful:false})]){
    assert.ok(copy.body.includes('Refund status: Pending'));
    assert.ok(copy.body.includes("hasn't been completed yet"));
  }
  const success=campaignResultEmail({project:'Final',slot:8,amountUnits:'200000000',successful:true});
  assert.ok(success.body.includes('final sponsor of Slot 08'));
  assert.ok(!success.body.includes('Refund status'));
});

test('refund receipt identifies the verified original wallet, network, amount and transaction',()=>{
  const copy=refundConfirmedEmail({project:'Original',slot:2,amountUnits:'787500000',network:'Arc',wallet:'original-wallet',transactionUrl:'https://explorer.example/tx/verified'});
  for(const text of ['787.50 USDC','Network: Arc','Receiving wallet: original-wallet','https://explorer.example/tx/verified','confirmed on-chain'])assert.ok(copy.body.includes(text));
});

test('provider request includes stable idempotency key and only the intended email fields', async () => {
  let recorded: RequestInit | undefined;
  assert.equal(await sendTransactionalEmail(input, (async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails'); recorded = init;
    return Response.json({ id: 'test-email-id' });
  }) as typeof fetch), true);
  assert.equal(new Headers(recorded?.headers).get('Idempotency-Key'), input.notificationId);
  assert.deepEqual(JSON.parse(String(recorded?.body)), { from: input.from, to: [input.to], subject: input.subject, text: input.text });
  assert.ok(!String(recorded?.body).includes(input.key));
});

test('missing credentials, provider errors, malformed responses and timeouts are not marked accepted', async () => {
  let calls = 0;
  const request = (async () => { calls++; return Response.json({ id: 'test-id' }); }) as typeof fetch;
  for (const override of [{ key: undefined }, { from: undefined }, { notificationId: undefined }]) assert.equal(await sendTransactionalEmail({ ...input, ...override }, request), false);
  assert.equal(calls, 0);
  for (const response of [Response.json({ error: 'rejected' }, { status: 403 }), Response.json({}), new Response('invalid')]) assert.equal(await sendTransactionalEmail(input, (async () => response) as typeof fetch), false);
  assert.equal(await sendTransactionalEmail(input, (async () => { throw new Error('timeout'); }) as typeof fetch), false);
});
