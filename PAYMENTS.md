# USDC payment integration

The receiver is `0x7c7ddb2c72725563816d5adc7137043d831ebcbe`. Checkout transfers
USDC directly from the sponsor's wallet to this address on the selected network.
There is no custody contract, bridge, token allowance, platform withdrawal or
server private key. Funds reach the receiver when the transfer is mined; clicking
the shirt price only opens checkout. The logo appears after the configured
confirmation count and verification checks pass.

The four-day auction, 1.5× next claim, $2,200 target and $1,100 funding threshold
remain unchanged. Outbid and late payments are recorded for full refunds. Manish
must keep enough USDC on each original network to honor those refunds.

## Networks

| Network | Chain ID | Native USDC contract | Gas | Confirmations |
| --- | --- | --- | --- | --- |
| Base | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | ETH | 12 |
| Arc | 5042 | `0x3600000000000000000000000000000000000000` | USDC | 12 |
| Ethereum | 1 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | ETH | 12 |
| Arbitrum | 42161 | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | ETH | 64 |
| Polygon PoS | 137 | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | POL | 64 |

Contracts were checked against [Circle's issuer registry](https://developers.circle.com/stablecoins/usdc-contract-addresses)
on October 10, 2026. Arc mainnet is chain 5042; its
[ERC-20 USDC interface uses six decimals](https://docs.arc.io/arc/references/contract-addresses),
although its native gas balance uses 18 decimals. This integration always sends
through the six-decimal ERC-20 interface. Bridged USDC.e and testnet tokens are rejected.

## Checkout and security checks

1. A shirt price opens the selected slot, price and network form.
2. The server creates a five-minute quote. A personal-sign message binds the
   website origin, wallet, slot, chain, exact price, receiver, brand details and
   SHA-256 of the uploaded logo. Signing alone cannot move funds.
3. The server verifies the signature and USDC balance. D1 atomically consumes
   the quote and reserves the slot. One wallet can hold one unpaid checkout at a
   time. Competing requests cannot produce two successful reservations.
4. A preflight checks that the slot, campaign, recipient and payment are still
   payable before the wallet is asked to send. Network/account checks run again
   after switching chains. Pending sends disable the pay button, and this tab's
   checkout is saved in session storage for recovery after reload.
5. Verification checks the RPC chain, issuer contract, sender, exact transfer
   calldata, zero native value, transaction/receipt identity, successful
   execution, one matching Transfer log, canonical block hash, block time and
   confirmation count. Removed logs are rejected. A unique transaction hash
   prevents one transfer from paying for multiple spots.
6. Conditional state transitions prevent overlapping verification requests from
   downgrading a confirmed payment. Only a confirmed holder's approved logo is
   exposed by the public inventory and logo route.
7. Full refunds require a successful, canonical, sufficiently confirmed transfer
   from the original treasury to the original payer in the original token and
   network. An admin cannot mark a refund complete using an unrelated transfer.

Reservation and upload sizes are bounded. Prices and receivers supplied by the
browser are ignored. Admin authorization remains tied to the configured ChatGPT
administrator account. PNG, JPEG and restricted static SVG logos are accepted.

## Deploying to the existing site

The linked Sites project was not accessible from the implementation account.
No production deployment, production migration, auction launch or real payment
was performed here. Deploy from Manish's account against the existing project;
preserve its project ID, database, bucket, audience and prior migration history.

1. Review and merge the change, then install from the updated pnpm lockfile.
2. Apply the new D1 migration `drizzle/0007_colossal_lady_bullseye.sql` exactly
   once before enabling the new checkout. Older deployments must already have
   migrations 0000–0006. Do not replay those on a database with existing data.
3. Confirm the production `DB` and `BUCKET` bindings. Set `ADMIN_EMAIL` to
   Manish's actual administrator email. Existing treasury settings or the
   `TREASURY_WALLET_ADDRESS` environment variable must equal the receiver above;
   conflicting settings disable new payments rather than redirect funds.
4. Use reliable HTTPS RPC endpoints via `CHAIN_RPC_URL_1`, `CHAIN_RPC_URL_42161`,
   `CHAIN_RPC_URL_137`, `CHAIN_RPC_URL_8453` and `CHAIN_RPC_URL_5042` as needed.
   The supplied public endpoints passed the read-only checks below, but public
   RPC rate limits and outages can delay verification.
5. Configure `RESEND_API_KEY` and `SPONSOR_FROM_EMAIL` if email delivery is
   required. Without them, notification records remain pending; money and logo
   verification continue to work.
6. Run `pnpm test`, `pnpm typecheck`, `pnpm payments:check` and `pnpm build`.
   Publish the built source using the site's normal deployment workflow. Launch
   the auction through the admin interface only when Manish is ready. An auction
   that has already launched must not be restarted.

## Verification completed

- Regression tests first reproduced wallet impersonation, removed logs,
  noncanonical receipts and a concurrent status downgrade; the fixes pass.
- The automated suite executes the actual route handlers and payment SQL against
  SQLite with atomic batches, while using synthetic RPC responses and public
  test-only signing keys. It covers every supported network, exact-payment
  rejection paths, signature expiration/replay/tampering, concurrent reservations,
  wallet hoarding, insufficient balances, pending/failed/late payments,
  pre-checkout transfer replay, outbids, and refund checks.
- TypeScript checking and the production Vinext/Cloudflare build pass.
- Read-only requests to all five mainnets returned their expected chain IDs,
  six-decimal USDC interfaces and current block heads on October 10, 2026.
- Local D1 migrations applied successfully. Browser inspection verified that a
  shirt price opens its matching checkout, all five networks are listed, Arc
  displays USDC gas, and a missing browser wallet produces a clear error.
- A local Cloudflare Worker smoke test rejected an unsigned reservation, verified
  a disposable account's real signature, and rejected its zero USDC balance using
  the live Base RPC. No slot was locked, logo published or transaction sent.

## Remaining live wallet test and operating limits

Before accepting public payments, Manish should verify that he controls the
receiver on every enabled network. Run a staging checkout using testnet-specific
contracts and a separate staging database; never add testnet tokens to production.
Then make an explicitly approved production checkout on each enabled chain from
a funded wallet, checking the wallet's recipient/amount/network, the receiver's
balance increase and the displayed logo. The current production minimum is the
listed slot price; a tiny direct transfer tests receipt of USDC but does not test
the full sponsorship checkout. Also test an outbid and its full return transfer.
No end-to-end funded-wallet signing or delivery test was performed here.

Direct transfers are irreversible by the app. A late payment or a payment whose
confirmations arrive after the reservation/auction closes is queued for a manual
refund and cannot displace the current holder. A malformed or wrong-token payment
is not credited automatically and requires operator investigation. Refund status
does not itself send funds. Manish must execute refunds from his wallet and then
record their verified hashes in the admin interface.

The verifier trusts its configured RPC and uses confirmation counts, not an
Ethereum-finalized checkpoint. In particular, the L2 counts do not prove L1
finality; [Arbitrum documents the difference](https://docs.arbitrum.io/build-decentralized-apps/troubleshooting-building).
Canonical-block checks reduce reorg errors at verification time; they do not
guarantee that an already accepted block can never reorganize. Stronger finalized
settlement would require longer reservation/settlement windows and different
auction closing rules.

Automatic scanning runs during inventory, admin and checkout verification
requests. The checkout polls every 12 seconds; inventory refreshes every 15
seconds. There is no independent scheduled reconciler, and abandoned checkouts
without a recorded transaction hash are scanned for up to one hour after reservation expiry. Keep monitoring
active during the auction and reconcile any missed payments before final close.
Apply host rate limits to the public API: wallet signatures and balance checks
reduce spoofing and hoarding, but do not eliminate abuse by funded multiple wallets
or denial of service. This work is not an independent security audit.

Browser-wallet EOA accounts and direct ERC-20 transfers are supported. Exchange
withdrawals, smart-contract wallets, batched transfers, permit-based payments,
bridges, WalletConnect-only wallets and native-value Arc sends are not accepted
as matching checkout transactions. Use a compatible wallet browser or injected
browser wallet, keep the checkout open until verified, and never supply a seed
phrase or private key to the site.
