# Fastest safe launch path

Status: launch blocked. Review branch `fix/payment-reliability`; application fixes commit `5501bebbab4770e5ab34e0e21b2c0614f26e9268`. No production deployment, campaign activation, real payments or automatic refund sending is authorized. This plan prepares staging; it does not execute deployment or migrations.

## 1. Replace the two unsuitable public RPC endpoints

Latest read-only probes from the development environment:

| Endpoint | Probe | Exact result |
| --- | --- | --- |
| polygon-bor-rpc.publicnode.com | eth_blockNumber | HTTP 200 |
| Same | one-block filtered eth_getLogs | HTTP 200, empty result |
| Same | 500-block filtered eth_getLogs | HTTP 403, RPC -32602, archive requests require a personal token from Allnodes/PublicNode |
| mainnet.base.org | eth_blockNumber | HTTP 200 |
| Same | one-block and 500-block filtered eth_getLogs | HTTP 429, RPC -32011, request limit reached |

The queries used the app's USDC contract and Transfer topic with synthetic wallet/treasury filters. They transferred no funds. Shrinking Polygon queries to one block or repeatedly retrying Base is not a validated solution for historical discovery.

**Owner:** repository/site owner or friend with RPC-provider account administration; Sites operator installs runtime configuration. A paid subscription is not inherently required, but the selected tier must demonstrably meet these capabilities. Allnodes/PublicNode personal-token access is a concrete Polygon option identified by the endpoint itself; equivalent dedicated providers are acceptable. Do not invent provider URLs or assume any tier passes.

**Required provider capabilities:**

- Polygon mainnet chain 137 and Base mainnet chain 8453, HTTPS JSON-RPC POST using endpoint-URL authentication supported by the current client. The client currently has no configurable provider-auth header. Store credential-bearing endpoint URLs securely in Worker runtime configuration, never in Git, browser code, logs, a PR or chat. If the hosting platform cannot securely bind full URLs, arrange its supported proxy authentication route; placeholder variables alone are not evidence of working access.
- Methods: eth_chainId, eth_blockNumber, eth_call, eth_getLogs, eth_getTransactionByHash, eth_getTransactionReceipt and eth_getBlockByNumber.
- eth_getLogs accepts 500-block inclusive ranges, contract and three-topic filters, up to four pages per discovery invocation. Historical logs, receipts and block timestamps remain available from the oldest unresolved reservation, including after outages; establish a provider retention period and reconciliation policy. Full historical state queries are not required, but pruned history is insufficient for unresolved payment discovery.
- Successful requests within the app's 12-second timeout, nontruncated log results, a documented quota and rate policy. Current application ceilings are 300 requests/minute per hostname and 600/minute globally; two networks sharing a hostname share the 300 limit. These are ceilings, not measured required usage. Provider capacity must cover expected traffic and bursts, or application limits must be reduced and validated; never raise quotas blindly. Discovery without a match costs up to six RPC calls/payment/run; a full verification can add five. A scheduler batch contains up to eight payments and browser requests also consume quota.
- Healthy eth_call decimals result 6 on Polygon USDC 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 and Base USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913. Keep confirmations at Polygon 64 and Base 12 pending a separate finality review.

**Exact configuration changes:** set staging Worker runtime `CHAIN_RPC_URL_137` and `CHAIN_RPC_URL_8453` to provider-issued endpoints; explicit Base binding takes precedence over legacy `CHAIN_RPC_URL` and saved settings.rpc. Allow the actual endpoint hostnames in both development egress and hosted Worker/provider access policy as applicable. These are different environments; changing a development draft does not configure the hosted Worker. Do not edit lib/payment-networks.ts to embed keys.

Reservations persist their RPC URL inside payments.verification_config. New bindings affect new reservations only; old pending records still use their saved endpoint. Before testing, count affected staging intents. An operator-reviewed staging reconciliation must replace only the transport endpoint for unresolved records, preserve chain/token/treasury/amount/startBlock/scanBlock, and reconcile legacy locks. Do not delete history, clear ambiguous intents or reset cursors to the tip. Keep a rollback/backup record without credential values.

**Clearance evidence:** exact configured binding names and redacted endpoint hosts, provider tier/quota/retention, staging Worker chain/decimals checks, successful 500-block and oldest-cursor queries, successful known transaction/receipt/block reads, and representative sustained staging traffic without 403/429/timeouts. An empty synthetic log response alone does not prove payment attribution.

## 2. Obtain the resource mapping and scoped operator access

Known staging URL: https://devcon-shirt-security-staging.cryptovlogger1.chatgpt.site. Anonymous and dummy forged-identity requests previously returned HTTP 401; that does not identify physical resources or prove application authentication.

The checkout manifest names **the original main project**, appgprj_6ac0ece2083081918fd1d7cd03fb221e. DB and BUCKET are logical bindings. The all-zero D1 ID and site-creator-r2 bucket in local Vite configuration are preview placeholders. Never use any of these as guessed staging identifiers.

**Owner:** Sites workspace/project owner plus Sites platform operator; Cloudflare account admin if those resources are exposed to the owner.

Supply a nonsecret mapping for both staging and production: Sites project ID, deployed revision, Cloudflare account ID, Worker/script/dispatch identity, D1 database UUID/name bound as DB, R2 bucket/account bound as BUCKET, direct Worker/alternate routes, and bucket custom/managed public domains. Require distinct project/Worker, D1 UUID and bucket identity; a shared account may be acceptable only with verified isolation and scoped permissions.

Required capabilities, separated by purpose:

- Read-only audit: inspect Worker bindings/routes and deployment revision, D1 schema/migration history/integrity, R2 managed/custom domain configuration, IAM policies and resource scopes. D1 metadata permissions may not grant SQL access; operator must supply schema evidence if read-only SQL cannot be delegated safely.
- Staging execution: deploy ONLY the verified staging Worker/project, apply migrations ONLY to the verified staging D1 UUID, configure staging secrets/bindings and private-site service access. No production write scope. R2 write access only if the approved staging/recovery task needs it.
- Backup/recovery: scoped D1 export and source R2 object/metadata reads, separate encrypted backup storage, restore permissions restricted to fresh recovery D1/R2 destinations.
- Authentication: signed-in owner and nonowner test accounts; operator evidence of dispatch identity-header stripping and direct Worker ingress restrictions. A GitHub token does not grant these capabilities.

Managed Sites may not expose account-level credentials. In that case, the platform operator performs the checks and returns redacted configuration evidence. Do not put broad account credentials into the Worker or supply secrets in chat.

## 3. Staging-only deployment and migration sequence

1. Operator records and independently confirms the staging mapping above against production. Confirm private access and no real sponsor data/funds; do not change the committed main hosting manifest to deploy to a guessed target.
2. Pin fixes commit 5501beb on the review branch and record the current staging revision, schema version and binding mapping. Use the Sites publishing workflow scoped to the confirmed staging project; generic Wrangler deployment against the main manifest is prohibited.
3. Quiesce staging writes and monitoring at the platform boundary. Keep campaign UPCOMING with claims closed, no real treasury signing and email delivery disabled for fixtures. Take an encrypted staging DB/object backup and verify a rollback/recovery path.
4. Inspect existing data before indexes/triggers: duplicate sponsorship payments, duplicate unresolved wallet/chain/token/amount intents, cross-slot holders, orphan relationships, confirmed/refund rows missing refund eligibility and legacy null-expiry verification locks. Counts/IDs in protected operator evidence only; no sponsor data in PRs. Stop on ambiguity; never silently delete or relabel financial history.
5. Determine applied migrations from actual staging history/schema. Apply only pending 0007_giant_sentry.sql, 0008_tricky_umar.sql, 0009_silent_hardball.sql, 0010_easy_joshua_kane.sql and 0011_acoustic_warbound.sql in order to the confirmed staging D1 UUID through the supported Sites/operator path. Do not replay ALTER statements or use local preview config for remote D1.
6. Verify new challenge/budget/guard tables, verification/refund/monitor columns, unique unresolved-intent and sponsorship indexes, all seven relationship/history triggers, integrity_check and relationship queries. Foreign_key_check alone is insufficient because invariants also use triggers. Record migration evidence and backup cutoff.
7. Install provider bindings, staging owner identity, maintenance credential and approved service access securely. PLATFORM_AUTH_BOUNDARY_VERIFIED remains unset until dispatch/direct-route evidence passes. Stage the new Worker, record deployed revision and exact bindings, then test fail-closed admin access before allowing owner-only synthetic testing.
8. Validate owner/nonowner/anonymous/forged-header boundaries, storage privacy, signed-wallet reservations, provider reads, concurrency, late payments and refund verification using an approved isolated plan. Real transfer tests require separate authorization; never activate the real campaign for these checks.
9. Configure a supported one-minute private-site scheduler and independent stale-run/failure/refund-backlog alerts. Repository GitHub scheduling is only a five-minute, potentially delayed fallback and currently not enabled. Test unattended processing and outage recovery against staging only; never weaken private-site access to make the scheduler work.
10. Restore the approved staging backup into new isolated recovery resources; verify schema, financial relationships, object hashes AND content types, recovery time and chain reconciliation. No automatic refund sending. Produce a clearance report before any separate production launch proposal.

## Remaining blockers and sign-off evidence

| Blocker | Responsible person/access | Evidence to clear |
| --- | --- | --- |
| Polygon/Base discovery | Owner/friend with RPC account; Sites runtime operator | Authenticated provider capabilities, configured bindings, historic logs and quota/load evidence described above |
| Physical staging isolation | Sites operator/Cloudflare auditor | Exact staging-versus-production mapping, private bucket policy, restricted routes and scoped IAM |
| Staging fixes/schema | Staging deployer and D1 operator | Pinned revision, encrypted backup, clean preflight, ordered migration history and schema/integrity evidence |
| Trusted admin boundary | Sites identity/dispatch operator plus owner/nonowner testers | Header sanitization/direct-route evidence and positive owner/negative nonowner tests, without bypassing gates |
| Real-chain payment/refund behavior | Developer/tester plus separately authorized funded test-wallet owner | Approved isolated plan and transaction evidence for each supported network, wrong/late/duplicate cases and manual refund verification |
| Unattended verification/alerts | Scheduler/service-access operator | Browser-closed runs, persistent state progress, outage/retry/recovery, failed-run and stale-run alert receipt |
| Hosted recovery | Backup operator with scoped export/restore/storage access | Fresh D1/R2 restore, bytes/metadata and financial reconciliation, retention/failure alerts and measured restore time |
| Environment publication | Development environment owner | Active published version from platform; runtime connectivity already works, but draft read alone does not prove publication |

Provider preparation also revealed that the admin response included internal RPC URLs. A follow-up code change restricts the browser response to form fields, with a targeted credential-exposure regression. Include that follow-up commit when pinning the staging build. Targeted authorization/security checks and type/build validation are required for this code change; unrelated passing suites need not repeat. Authenticated RPC endpoints and exact resource identifiers are still missing; the two provider blockers are diagnosed, not resolved. Parallelize provider procurement and operator mapping, then execute the ordered staging plan after access and authorization exist.
