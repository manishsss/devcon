import { pathToFileURL } from 'node:url';

export async function invokePaymentMonitor(settings, fetcher = fetch) {
  const site = new URL(settings.PAYMENT_MONITOR_SITE_URL);
  if (site.protocol !== 'https:' || site.username || site.password || site.port || site.pathname !== '/' || site.search || site.hash) {
    throw new Error('PAYMENT_MONITOR_SITE_URL must be an HTTPS site origin.');
  }
  const token = settings.MAINTENANCE_TOKEN;
  if (!token || token.length < 32) throw new Error('A maintenance token of at least 32 characters is required.');
  const response = await fetcher(new URL('/api/maintenance/monitor', site), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, origin: site.origin },
    redirect: 'error',
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Monitor HTTP ${response.status}`);
  const result = await response.json();
  if (result.throttled) throw new Error('Monitor was throttled.');
  const counts = ['processed', 'succeeded', 'failed'].map(key => result[key]);
  if (counts.some(value => !Number.isSafeInteger(value) || value < 0) || result.processed !== result.succeeded + result.failed) {
    throw new Error('Invalid monitor response; check site access and deployment.');
  }
  if (result.failed) throw new Error('Payment verification failed; inspect protected admin monitoring.');
  return { processed: result.processed, succeeded: result.succeeded, failed: result.failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await invokePaymentMonitor(process.env)));
  } catch {
    console.error('Payment monitoring failed. Check site access, maintenance configuration and protected admin monitoring.');
    process.exitCode = 1;
  }
}
