# Remaining pre-launch audit work — local results

No production deployment, production migration, real funds, Cloudflare resource creation or live scheduler/secret changes were performed. Website design and four-day/1.5x/eight-slot/50% campaign rules are unchanged. PNG/JPEG upload support remains; SVG is now rejected for safety. Admin access requires new staging-verified configuration before any future deployment.

| Area | Risk | Local implementation / evidence | Cloudflare evidence still required |
|---|---|---|---|
| Reservation/upload/RPC abuse | Unpaid checkout monopolization, resource exhaustion | Atomic fixed-window global/client limits, streamed body bounds, RPC and monitor budgets; 3 abuse regressions | Trusted edge IP, WAF/rate tuning and load tests |
| Images | Malformed raster, decompression bombs, active SVG | PNG/JPEG dimension checks, strict decoding, fresh RGBA PNG encoding, metadata removal, SVG rejection; 4 regressions | Worker CPU/memory validation with realistic uploads |
| R2 | Public bucket domain bypassing app authorization | Current-confirmed-approved holder route checks; no-store/nosniff/CSP/CORP responses; source SVG responses refused; read-only bucket-policy audit tool; 2 storage regressions plus actual-route tests | Exact bucket domains, credentials, alternate access paths and negative external fetch tests |
| Admin | Email-only authorization or forged platform headers | Stable user ID authorization, explicit boundary-verification gate, strict mutation origin, read-only auth-check endpoint and staging probe; 2 regressions | Dispatch header stripping, direct Worker isolation, positive owner and negative non-owner tests |
| Database / permissions | Broken financial relationships, historical records changed/deleted | Unique payment-per-sponsorship index and 7 relationship/history triggers; fresh migration and constraint tests (3 cases) | Staging/production schema inspection, pre-existing data, IAM/token scopes and bound resource IDs |
| Backup/recovery | Irrecoverable loss or unsafe rollback | Authenticated encryption, SQL/object checksums, fresh-destination-only restore; 2 drill regressions using full migrated schema, holder/payment records, indexes/triggers and separate local object directory | Actual Cloudflare D1 export/import/Time Travel, R2 metadata round trip, backup scheduling/retention and measured recovery time |
| Monitoring | Failed verifications silently missed or older expired payments dropped | Sanitized persisted error codes, attempts/timestamps, fair batch ordering/backoff, protected maintenance endpoint, admin monitoring API; 2 regressions | Unattended scheduler, service access, alerts and stale-monitor detection |
| Reconciliation | Old crashed invocation overwriting replacement; expired payments misattributed | Renewable two-minute token leases, transactional fencing, protected reconcile route, continued late-payment discovery, fail-closed expired intent quarantine; 2 fence regressions plus overlapping real-verifier tests | D1/Worker lease tests and legacy lock review; no automatic release of ambiguous intents |

## Validation

The full existing suite ran successfully after each area. Final suite: security 13, abuse 3, images 4, storage 2, admin authorization 2, constraints 3, recovery 2, monitoring 2, reconciliation 2 behavioral cases (33 total); existing refund 24, discovery 7, auction 21, network 33 and payment structural 19 checks (104 total). Synthetic wallet keys were never funded. RPC and R2 were mocked/in-memory in local tests; SQLite used real transactions and the full migration sequence. TypeScript no-emit, framework production build and git diff whitespace checks passed.

The isolated restore drill is local, not Cloudflare. No account credentials or staging URL were available; direct configuration checks could not run. Successful code tests do not prove platform authorization, production constraints, backups or chain finality.

## Prioritized blockers before real payments

1. Provision separate staging resources and verify dispatch/direct Worker isolation, owner identity, private R2 and least-privilege permissions. Do not set PLATFORM_AUTH_BOUNDARY_VERIFIED=1 without evidence.
2. Apply pending migrations to staging only and test database fencing, contention, financial relationships and existing-record compatibility. Confirm resource IDs and deployment/migration plan before any production action.
3. Exercise real browser EOA signatures, direct USDC verification/refund paths and failure/reorg cases on each supported network using an authorized staging test plan. Contract wallets are unsupported.
4. Complete a Cloudflare D1/R2 restore drill and enable encrypted backup automation/retention with failure alerts. Reconcile on-chain history before a restored campaign can accept payments.
5. Configure unattended monitoring/service access and alerts; demonstrate recovery from RPC outage, scheduler failure and crashed Worker leases. Review any legacy null-expiry locks.
6. Load-test decoder and request/RPC budgets. Expired ambiguous intents remain quarantined; repeat identical-price checkout may require another wallet. Never bypass that quarantine by clearing payment history.

See cloudflare-staging-gates.md, backup-recovery.md and payment-operations.md for procedures. None of these remote gates has passed yet.
