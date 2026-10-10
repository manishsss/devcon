# Devcon sponsorship handoff

## Source baseline

This tree matches the live main website version 50, commit 3bd8ea2752ef5d39a1e58b23f5e8d295ad7ae52a. Generated TypeScript cache is omitted. The original hosted website must not be changed or deployed without explicit authorization.

The security-staging-changes.patch file contains the subsequent security hardening through commit 11972be. It is NOT applied to this baseline. Apply it on a separate branch with `git apply security-staging-changes.patch`, then run `node scripts/test-security.mjs`. These changes passed 33 security behavioral cases plus 104 existing checks locally. The security-hardened source was deployed only to private staging.

## Hosting

Main: https://eight-projects-devcon-shirt.cryptovlogger1.chatgpt.site

Private staging: https://devcon-shirt-security-staging.cryptovlogger1.chatgpt.site

ChatGPT Sites manages Cloudflare Workers, D1 binding DB and R2 binding BUCKET. The source manifest retains the main Site identity. Do not deploy using it accidentally. Runtime secrets, live database records and R2 objects are not included. Repository access does not automatically grant Sites publishing or Cloudflare dashboard access.

## Campaign rules

Eight positions, initial USD prices 350/350/300/300/250/250/200/200. Four days from server-side launch; confirmed takeovers cost 1.5 times current price and make previous payment eligible for full refund. Never replace the holder before confirmation. Net current-holder value >=1100 of 2200 target permits success; below1100 queues full refunds. USDC only on Ethereum, Arbitrum, Polygon, Base and Arc. Refund sending is manual, followed by on-chain verification. Preserve design and rules.

## Verified staging behavior

Owner-only Sites gate; anonymous and anonymous forged-header requests returned401. Service access could not gain admin rights. Admin is deliberately disabled until platform boundary is verified: this does NOT prove header stripping or positive owner authentication. Cross-origin admin and unauthorized maintenance returned403. Unknown logo404, oversized verification413, concurrent reservation rate budget429. Inventory reports UPCOMING, no wallet, no claims, zero funds.

## Remaining launch blockers

Platform evidence for trusted header sanitization, direct Worker restrictions, physical D1/R2 isolation and bucket privacy. Positive owner/nonowner admin tests. Actual hosted logo authorization fixtures, live-chain payment/takeover tests, verification scheduling and alerts, hosted backup and isolated restore demonstration. No real payments received; do not claim live readiness.

## Next task

Inspect project and security patch, preserve original live deployment, work on isolated branches/staging only. Do not deploy, activate auction or send funds without explicit authorization. Use the Sites skill for publishing, not a generic Wrangler deploy to guessed resources. Detailed audit and operations docs are included in the patch.
