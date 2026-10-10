# Pre-launch security hardening — local only

Updated: the remaining hardening is described in remaining-security-audit.md and payment-operations.md. The original durable-lock limitation below is superseded by expiring fenced leases; legacy locks without timestamps remain fail-closed.

Scope: reservation authorization, payment concurrency/idempotency, refund replay. No production deployment or migration and no funds transferred.

## Reservation authorization

The server issues a five-minute single-use challenge containing the reservation ID, site origin, wallet, spot, chain, token contract, exact units, treasury, expiry, and SHA-256 digest of sponsor fields and logo bytes. The connected wallet must sign it using personal_sign. The server verifies the signature before creating a reservation. A primary-key reservation ID prevents concurrent reuse of the challenge.

A partial unique index prevents multiple unresolved payment intents using the same wallet, chain, token and amount. Terminal confirmed/late-confirmed/failed payments release this restriction, while used transaction hashes remain globally unique. Expired unresolved intents retain it intentionally: an ambiguous late transfer must not be credited to a new reservation. Operator reconciliation is required before retrying the same combination. This uses standard direct USDC transfers and preserves prices.

This implementation supports browser-wallet EOA signatures. Contract wallets/ERC-1271 and browser-free manual reservations are not supported. Manual transfer is still possible after the wallet has signed the reservation.

## Payment transitions

A durable database lock serializes each payment's complete RPC/read/write verification cycle. Duplicate requests return stored state without running a second cycle. Terminal status writes are conditional. Ownership, confirmed payment, prior holder status, and refund eligibility are changed in a single transaction. A verification exception releases its lock.

Locks do not expire automatically. If an invocation crashes before finally executes, the lock remains. Recovery must confirm the original Worker invocation has stopped, inspect chain and database state, and then clear the lock through an authorized maintenance procedure. Do not blindly clear active locks. No production recovery operation was implemented or performed.

## Refund replay

Refund eligibility is recorded when the obligation is created, independently from mutable refund status timestamps. Verification requires a block timestamp at or after both original payment confirmation and refund eligibility, plus existing exact-token/address/amount/chain/confirmation checks. Missing eligibility fails closed. Refund transaction hashes remain unique, and completed refunds cannot be downgraded.

Existing legacy refund rows without eligibility require explicit reconciliation; the new migration does not guess historical eligibility times. This is suitable for the stated no-real-payment testing state. Before deploying, inspect test records for unresolved intent duplicates: migration intentionally fails rather than silently deleting history.

## Automated validation

`node tests/security.mjs` executes production route, authorization and payment functions with real SQLite transactions, actual wallet signatures from synthetic unfunded test keys, mocked RPC and in-memory R2. It applies all migrations to a fresh in-memory database. Ten cases cover:

1. Wallet impersonation and altered signed intent fields.
2. Unsigned/spoofed/tampered reservation submissions.
3. Expired challenges, changed logos and changed treasury configuration.
4. Single-use reservations and ambiguous duplicate intents.
5. Overlapping verification requests and exactly one ownership increment.
6. Concurrent takeovers, correct 1.5x price, retained prior holder until confirmation, and one refund obligation.
7. Reused transaction hash cannot acquire a second equal-price slot; exception releases lock.
8. Historical refund and missing eligibility rejection; a new valid refund succeeds.
9. Refund cannot predate original payment even with earlier eligibility.
10. Concurrent/repeated refund updates and unique refund hashes.

Existing suites: refund 24, discovery 7, auction 21, payment networks 33, payment source-safety 19 checks. The source-safety checks are structural, not integration tests.

TypeScript no-emit check, production build and git diff whitespace check also passed.

## Not verified

Production D1 behavior/migration, browser-wallet interaction, real chain transfers/reorgs, direct Worker authentication boundary, R2 policies, backups, unattended scheduler, crash recovery, expired-intent recovery and contract wallets. Other audit findings remain outside this change. SQLite tests are not a substitute for a Cloudflare staging test.
