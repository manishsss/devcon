import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invokePaymentMonitor } from '../scripts/payment-monitor.mjs';
const settings = { PAYMENT_MONITOR_SITE_URL: 'https://staging.example.test/', MAINTENANCE_TOKEN: 'x'.repeat(32) };
await test('scheduler authenticates and validates batch results', async () => {
  const result = await invokePaymentMonitor(settings, async (url, options) => {
    assert.equal(url.href, 'https://staging.example.test/api/maintenance/monitor');
    assert.equal(options.headers.authorization, 'Bearer ' + settings.MAINTENANCE_TOKEN);
    assert.equal(options.headers.origin, 'https://staging.example.test');
    assert.equal(options.redirect, 'error');
    return Response.json({ processed: 2, succeeded: 2, failed: 0 });
  });
  assert.equal(result.succeeded, 2);
});
await test('scheduler detects denied access, failures, throttling and invalid results', async () => {
  for (const response of [new Response('', { status: 403 }), Response.json({ processed: 1, succeeded: 0, failed: 1 }), Response.json({ throttled: true }), Response.json({ processed: 2, succeeded: 0, failed: 0 }), Response.json({ authorized: true })]) {
    await assert.rejects(() => invokePaymentMonitor(settings, async () => response));
  }
});
await test('scheduler rejects insecure destinations and missing credentials before requests', async () => {
  for (const values of [{ ...settings, PAYMENT_MONITOR_SITE_URL: 'http://example.test/' }, { ...settings, PAYMENT_MONITOR_SITE_URL: 'https://user:pass@example.test/' }, { ...settings, MAINTENANCE_TOKEN: '' }]) {
    await assert.rejects(() => invokePaymentMonitor(values, async () => { assert.fail('must not send credentials'); }));
  }
});
