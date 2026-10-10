# Launch validation — 2026-10-10

Scope: development branch `fix/payment-reliability`. No deployment, remote migration, campaign activation, scheduler enablement or funds transfer was performed.

| Gate | Observed evidence | Remaining hosted evidence |
| --- | --- | --- |
| Staging isolation and migrations | All 12 migrations applied to fresh local SQLite; integrity_check ok, foreign_key_check returned no violations, seven triggers present | Exact staging DB/bucket IDs, independent isolation from production, existing staging data and deployed schema |
| Admin and storage access | Local owner/nonowner, boundary gate, origin, storage and image tests passed | Authenticated owner and nonowner sessions; dispatch header stripping; direct Worker restrictions; bucket custom/managed domains and IAM |
| Payments | Existing and hardening suites passed using synthetic unfunded wallets, SQLite and mocked RPC | Hosted browser signatures and explicitly approved chain/payment/refund scenarios for each supported network |
| Monitoring | Retry/backoff, fair ordering, continued expired-payment scans, fenced recovery and scheduler-client failures passed locally | Scheduler credentials/service access, actual unattended invocation, alerts and outage recovery; workflow remains disabled |
| Recovery | Encrypted local backup restored into a separate fresh database/object directory; wrong keys, tampering, missing objects and unsafe keys rejected | Cloudflare D1/R2 restore, metadata round trip, backup scheduling/retention and on-chain reconciliation |

Validation: `node scripts/test-security.mjs` reported 141 completed passing checks; `pnpm exec tsc --noEmit --incremental false` and `git diff --check` passed. Foreign-key checking on an empty local database does not establish complete foreign-key coverage or integrity of existing remote records.

The anonymous and forged-header staging requests did not reach the site: the egress proxy rejected CONNECT with HTTP 403, while curl reported HTTP 000. This is a network-policy denial, not evidence that staging authentication rejected a visitor.

Environment configuration metadata and exported variable names contain no Cloudflare audit credentials, staging resource identifiers, admin identity or scheduler credentials. The bucket audit command exited 2 without making an API request because required configuration was missing. Available hosting configuration declares logical DB/BUCKET bindings and the original main project identity only; it cannot prove isolation or bucket policy.

A development-environment draft now adds network destinations for the known staging hostname, api.cloudflare.com and the five configured RPC hosts. Draft persistence was confirmed; runtime application and publication were not confirmed. No live-site host was added. Review/save and publish through environment settings, then retry staging access. Hosted checks additionally require platform/operator evidence or securely configured scoped access; never supply credential values in chat.

Launch verdict: local checks pass; hosted launch gates remain unverified. Do not accept real payments based on this report.
