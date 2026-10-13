# Devcon sponsorship handoff

## Current source
GitHub mirrors the public site's application source through version 99.
Published Sites commit: 64012974233e375784f1ae269fdfaea61755b0d9 (October 13, 2026).
This sync includes the QR checkout, current payment monitoring and verification,
network selection, sponsor emails, site copy, and response latency improvements.
Generated TypeScript cache remains excluded. Historical audit reports remain
outside this public source mirror, as in the previous handoff.

## Hosting
Public site: https://devcon.manishh.xyz/
Platform URL: https://eight-projects-devcon-shirt.cryptovlogger1.chatgpt.site
ChatGPT Sites manages Cloudflare Workers, D1 binding DB and R2 binding BUCKET.
The hosting manifest retains the existing public Site identity.
GitHub source access does not grant access to managed storage or runtime secrets.
Live database records, R2 uploads, API keys and runtime settings are not exported.
This repository-only sync does not deploy or modify the public website.

## Current campaign and checkout
Eight positions start at 350/350/300/300/250/250/200/200 USD.
Confirmed takeovers quote 1.5 times the current spot price. The existing holder
remains until successful confirmation, then a refund of the actual paid amount
is queued. Refund sending is manual.
The current campaign uses manual closing; the four-day duration remains in the
campaign code and marketing copy. Net confirmed current-holder funds must reach
at least 1100 USDC of the 2200 target.
Connected-wallet checkout supports USDC on Ethereum, Arbitrum, Polygon, Base and Arc.
QR checkout supports Ethereum, Arbitrum, Polygon and Base. Arc is wallet-only.
QR amounts are unique, below the quoted spot price and use at most three decimal
places. The owner-supplied QR image encodes the treasury address only; users
select the displayed network and send the exact allocated amount themselves.
Migration 0015 adds QR payment bindings; retain the full migration journal.
No wallet private keys are generated or stored by checkout.

## Performance and monitoring
The initial server-rendered page includes current slot data. Inventory responses
do not wait for background monitoring, which runs with Cloudflare waitUntil.
Independent reservation network checks and inventory reads run concurrently.
Payment validation, request budgets and atomic reservation rules are retained.
A persistent external minute-level scheduler is still not configured. Checkout
polling, site traffic and authenticated admin/maintenance checks drive monitoring.
Users should keep checkout open until confirmation. This is an unresolved
operational limitation, not proof of unattended payment readiness.

## Validation
Use Node.js 22.13+; Node 24 was used for the latest local checks.
Run npm test, npm run typecheck and npm run build.
The latest application suite passed 140 tests; type checking, production build
and seven automatic discovery checks passed. Public HTML was verified to contain
all eight ready claim buttons. QR image decoding matched the treasury address.
The owner confirmed the address QR scans correctly in their wallet.
These checks do not constitute an end-to-end real-funds payment or refund test.

## Working on this repo
Deploy only when the user requests website changes or publication. This task
authorizes repository updates only. Do not change Site runtime settings, deploy,
migrate production data or send funds as part of this sync.
Use the Sites workflow for separately authorized hosted changes.
security-staging-changes.patch is a historical snapshot, not an unapplied
upgrade; do not apply it over the current source.
