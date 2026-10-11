# Devcon sponsorship handoff

## Current source
GitHub now contains the main site's source through version 87, Sites commit
96126ab8ec9b493c6421ba4c68ec797433540661 (October 11, 2026).
This includes mobile navigation and checkout improvements, sponsor-link behavior,
USDC verification changes, analytics, transactional emails and regression tests.
Generated TypeScript cache is excluded.

## Hosting
Public main site: https://devcon.manishh.xyz
Platform URL: https://eight-projects-devcon-shirt.cryptovlogger1.chatgpt.site
ChatGPT Sites manages Cloudflare Workers, D1 binding DB and R2 binding BUCKET.
The hosting manifest retains the existing main Site identity. GitHub access does
not grant access to its managed storage, runtime settings or hosting account.
Runtime API keys, live database records and uploaded R2 objects are not exported.

## Current campaign behavior
Eight positions with initial USD prices 350/350/300/300/250/250/200/200.
Confirmed takeovers cost 1.5 times the current price. The previous holder remains
until successful payment confirmation and then becomes eligible for a full refund.
The current campaign is manually closed; older four-day marketing wording may
remain. Net current-holder funds must reach at least 1100 of the 2200 target.
USDC only on Ethereum, Arbitrum, Polygon, Base and Arc.
Refund sending remains manual and completion requires on-chain verification.

## Checks and deployment
Use Node.js 22.13+; Node 24 is used locally.
Run npm test, npm run typecheck and npm run build.
The last local suite passed 99 tests. Build/type checking passed for the mobile
header revision. Actual mobile browser QA was unavailable.
Local checks do not establish production security or live payment readiness.
Do not deploy, change runtime configuration, run production migrations, or send
funds without explicit authorization. Use the Sites workflow for hosted updates.

## Older artifacts
security-staging-changes.patch is a historical snapshot, not an unapplied upgrade
for this source. Do not apply it to the current tree. The obsolete migration
0007_colossal_lady_bullseye.sql was removed; use the current migration journal.
Audit and operations reports are maintained separately and are excluded from this
public sync pending approval; their absence does not mean their checks passed.
