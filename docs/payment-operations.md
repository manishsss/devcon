# Payment monitoring and reconciliation — staging setup required

## Scheduler client included in this repository

`scripts/payment-monitor.mjs` calls the authenticated maintenance endpoint with a two-minute timeout, refuses redirects, validates batch counts, and exits unsuccessfully on access denial, throttling, malformed responses or verification failures. It never logs credentials or provider responses. Run it with Node 24 and securely injected `PAYMENT_MONITOR_SITE_URL` (HTTPS site origin) and `MAINTENANCE_TOKEN` (at least 32 characters). The token must match the site's Worker runtime binding.

`.github/workflows/payment-monitor.yml` provides an optional five-minute scheduler. It is disabled unless repository variable `PAYMENT_MONITOR_ENABLED` is exactly `true`. Configure `PAYMENT_MONITOR_SITE_URL` and repository secret `PAYMENT_MAINTENANCE_TOKEN` only after the isolated staging deployment and migrations are verified. Test a manual workflow dispatch in staging first. No workflow has been pushed or enabled by this change.

GitHub scheduled workflows run from the default branch and can be delayed; this is a fallback, not a guaranteed one-minute production scheduler. Private Sites may require platform service authentication beyond the maintenance token; the included client does not implement that platform-specific mechanism and must fail closed until an approved service-access route exists. Never make the site public simply to bypass this prerequisite. Use a supported scheduler with that authentication for private hosting. Subscribe to workflow failure notifications and configure independent stale-run/refund-backlog alerts; a failing exit status alone is not a complete alert system.

The current code requires Node 24 for the real SQLite security test suites. Run `node scripts/test-security.mjs`, `pnpm exec tsc --noEmit --incremental false`, and `npm run build`. The suite runner treats missing suites, child process failures and zero-test runs as failures.

## Monitoring

Set a strong runtime MAINTENANCE_TOKEN (at least 32 characters). A scheduler calls POST /api/maintenance/monitor with Authorization: Bearer <token> every minute. Private Sites additionally require platform service access; never expose either credential in browser code, logs or scheduler prompts. The application bounds monitor runs, outbound RPC requests, batch size and retry backoff. No scheduler or runtime secret was configured in this work.

Failures persist as sanitized codes, check time, retry time and attempt count. Authenticated administrators inspect GET /api/admin/monitoring. Configure an external alert on stale monitor invocation/oldest unchecked payment, persistent failures, RPC exhaustion, expired leases and refund backlog. This alert integration is not active. The maintenance endpoint returns batch counts; failure logs contain a machine code, not sponsor secrets or full RPC/provider messages.

A zero-error batch is not proof that all chain transfers were discovered. Review scan cursors, chain availability, oldest pending age and funding deadline. Monitor all expired unresolved payments rather than dropping them after one hour.

## Crashed verifier

Each verifier holds a two-minute renewable lease with a random fencing token. Every database mutation inside verification is in a transaction that first asserts the token is still owned by that payment. An expired lease can be replaced; a resumed older invocation fails its fence and cannot overwrite payment/ownership data or clear the replacement lock. The maintenance monitor or authenticated POST /api/admin/reconcile with paymentId and optional tx retries through the same verifier; there is no unsafe force-unlock endpoint.

Legacy locks created before lease timestamps existed remain fail-closed. Inspect them only after confirming all old Worker invocations have stopped, then reconcile through a separately authorized staging maintenance procedure. No production locks were reset.

## Expired unresolved reservation

The monitor continues exact-chain discovery and verification. Confirmed late transfers become LATE_CONFIRMED and queue the original amount for refund without acquiring/replacing a slot. If no matching transfer is found, record NO_PAYMENT_OBSERVED_QUARANTINED; this is not proof that no money can arrive later. Preserve history and the unique unresolved-intent restriction. Do not free the same wallet/chain/token/amount combination or mark it FAILED simply to allow checkout again. Use a different payment wallet for a new identical-price intent, or manually review a known hash through the protected reconcile route.

Automatic release of ambiguous expired payment intents is intentionally not implemented. Direct ERC20 transfers have no reservation ID, so releasing the quarantine without an unambiguous payment protocol risks attribution errors. This behavior is a safety restriction, not an auction price/rule change.
