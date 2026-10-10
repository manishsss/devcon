# Remaining hosted launch gates — 2026-10-10

Do not deploy to production, enable real payments, activate the campaign, make private staging public, or bypass authentication gates. Local checks already passed; do not repeat them without a relevant code change.

## Current network evidence

The development-environment configuration read reports draft revision 2 with the staging host, Cloudflare API and five RPC hosts in the custom allowlist. The base published version ID is unchanged from the prior read. The additions are persisted as a draft; activation/publication is not established by this evidence. No publication-history or runtime-status tool is available here.

Retried GET https://devcon-shirt-security-staging.cryptovlogger1.chatgpt.site/api/admin/auth-check twice: once anonymous and once with dummy forged identity headers. Both returned curl exit 56, HTTP status 000, and `CONNECT tunnel failed, response 403`. These are proxy denials before reaching the site, not website authorization results. No relevant Cloudflare, admin, direct-Worker or monitor credential/identifier variable names were present; configuration metadata has no secret/runtime bindings.

## Ordered checklist

### Latest retry evidence

The configuration still reports draft revision 2 and the same base published version. Publication remains unconfirmed, but network access is now working: anonymous and dummy forged-identity GET requests to the known staging `/api/admin/auth-check` endpoint each returned curl exit 0 and HTTP 401. The response was not JSON; this establishes denial of those two requests, not application-level owner/nonowner authorization or platform header sanitization.

Read-only RPC checks returned HTTP 200 with the expected chain IDs (Ethereum 1, Arbitrum 42161, Polygon 137, Base 8453, Arc 5042) and token decimals 6 for all five configured USDC contracts.

A filtered `eth_getLogs` query spanning the latest 500 blocks, using synthetic sender/recipient addresses and the configured token contract, was accepted by Ethereum, Arbitrum and Arc (zero matching logs). Polygon returned JSON-RPC -32602: `Archive requests require a personal token. Get one at: https://www.allnodes.com/publicnode`. Base returned JSON-RPC -32011: `request limit reached`. These are concrete provider limitations for the discovery query shape; use supported scoped RPC providers with sufficient history/range and quota, then retry from staging before payments. Zero synthetic matching logs is not evidence of successful payment discovery.

No hosted credentials or exact staging resource identifiers have been supplied. Isolation, positive owner/nonowner authentication, deployed schema, unattended scheduler and real Cloudflare restoration remain blocked on operator access/evidence. No payment or configuration mutation was made on the hosted website.

1. **Development networking:** review/save the existing draft in environment settings and publish the development environment. Record the active version through the platform, then retry the two read-only staging requests. Confirm network access independently from site access; a sign-in response from private staging is not a network failure. Do not publish a website as part of this step.
2. **Staging isolation:** operator supplies exact staging and production Worker/project, D1 and R2 identifiers and binding evidence. Confirm distinct resources, private bucket domains, restricted direct Worker ingress and scoped credentials. Inspect the deployed staging revision and migration history read-only; new fixes are local and must not be assumed deployed. If staging code or migrations need updating, prepare a separate staging-only deployment plan before any writes.
3. **Authentication:** with operator-provided owner/nonowner sessions, verify owner access, deny nonowner/anonymous/forged-header access, and verify dispatch strips client identity headers. Check direct Worker routes and logo privacy. Keep PLATFORM_AUTH_BOUNDARY_VERIFIED unset until the platform boundary is proven; the configured gate must remain fail-closed during these checks.
4. **Payments and refunds:** confirm intended token contracts, RPC chain IDs, treasury configuration and deployed schema read-only first. Use an explicitly approved isolated test plan for wallet signatures, successful/wrong/duplicate/late payments, takeovers, confirmation delays and refund replay. Real transfer/refund tests require separate funds authorization; no campaign activation is authorized by this checklist.
5. **Scheduler and alerts:** inspect scheduler configuration, matching maintenance credentials and private-Sites service access. During an approved staging-only run, keep every browser closed and verify processing from scheduler logs and persisted payment state. Demonstrate RPC failure/backoff, lease recovery, fair progress, failed-run alerts and independently detected stale runs. Do not enable the disabled repository workflow against production.
6. **Backup restoration:** operator confirms scoped export permissions, independent encrypted storage, key management, retention and backup alerts. Restore an approved staging snapshot into new, distinct D1/R2 resources only. Compare schema, payment/refund/holder relationships, logo bytes and metadata; measure recovery time and reconcile chain history. Never restore over live resources or resend funds based solely on restored state.

## What can be checked here

After development networking is active: anonymous/dummy forged-header responses from the known staging hostname and public RPC chain/token metadata can be checked without account credentials. A private platform gate may prevent reaching application routes; that does not prove application authorization or deployment status.

Requires Sites/Cloudflare operator evidence or securely injected scoped access: resource isolation and IAM, deployed revision/schema, authenticated user tests, exact direct-Worker routes, bucket policy, scheduler/service authentication and alerts, and hosted export/restore. Blockchain transfer tests additionally require a separately approved test plan and funds authorization. No secret values should be sent in chat.
