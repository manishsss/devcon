# Devcon sponsorship style lock

## Direction

- Thesis: a premium independent Web3 campaign reduced to cream, near-black and one restrained orange accent, with the physical black shirt as the hero object.
- Surface: public marketing narrative with a transactional checkout.
- Mood: premium, editorial, minimal and slightly experimental, light mode.
- Structure: preserve the long-scroll campaign narrative and eight fixed shirt positions. Insert one hard-edged server-clock band, then explain the exact 1.5x mechanism before the dual-price slot grid. Keep the four sponsor deliverables and compact founder-focused FAQ.
- Motion: quick and restrained one-time scroll reveals at 240ms over 22px, short 180-240ms interactive lifts, a slow seven-second shirt float, and reduced-motion fallbacks. The 1.8-second opacity pulse is reserved for a detected or confirming blockchain payment because it communicates continued asynchronous work.
- Checkout: a two-step editorial claim surface with the selected slot pinned in view, current price separated from the server-calculated claim price, visible reservation time, explicit Base/USDC details and real holder/refund feedback only.

## Color contract

- Text: `#17151D`
- Background: `#F7F3EA`
- Surface: `#FFFDF9`
- Primary action/accent: `#E9683A`
- On primary: `#17151D`
- Border: `#DDD6C9`
- Secondary text: `rgba(23, 21, 29, 0.68)`

Verified text-safe pairings: near-black/cream, near-black/off-white, near-black/orange, and secondary near-black/cream or off-white.

Orange against cream is 2.91:1, so primary CTA buttons use the required orange fill plus a near-black border; orange never serves as text on cream. Neutral borders are decorative only and never carry state by themselves.

## Type and shape

- Display and headings: Geist, strong modern sans-serif.
- Interface/body: Geist.
- Data/status: Geist Mono.
- Radius: 4px micro labels, 8px controls, 10px cards, and circles only for status/progress marks.
- Shadow: flat by default; one restrained hover lift on interactive sponsor cards.
- Transaction states: orange is limited to the active step, live reservation, detected/confirming pulse and confirmed mark; failed, expired, outbid and refund states use text plus structure rather than introducing another hue.
- Auction hierarchy: empty cards show starting and claim price; held cards show public holder, current price, next claim and price-only history. Never show SOLD while live.
- Operational hierarchy: the private dashboard separates immutable claims, mutable refund lifecycle, queued notices and the irreversible one-time launch control.

## Assets

- Hero: transparent black T-shirt cutout at `/public/shirt-light-cutout.png`.
- Keep the shirt black; use warm cream slot outlines and orange only for available/selected states.
- Burnt orange is reserved for primary actions, availability, sold indicators and small highlights.
- Do not use purple, blue, gradients, neon colors, glassmorphism, glows or excessive rounded cards.
- Admin UI follows the same flat cream/black/orange system and prioritizes records, verification state and irreversible-action clarity over decorative dashboard styling.

## Current decision
2026-10-08: Original cream/black/orange restored at user request, including black shirt. Dark theme switch removed from rendered UI. Keep the latest requested hero line: 8 spots · 4 days · 1 shirt. Auction and checkout unchanged.

## Burgundy trial
2026-10-09: Burgundy #722F3E with cream labels replaces orange accents by default. Original orange #E9683A and its original dark labels preserved via semantic accent tokens. One-click per-browser persistent switch uses devcon-accent. Existing layout, content, prices and logic retained. Pale rose only for visible hover outlines on the black garment.

## Mobile interaction

2026-10-10: Preserve the current portrait assets and palette. Through 900px,
show one enlarged torso at a time with a front/back pressed-button selector;
keep both portraits on desktop. Shirt targets and checkout controls are at least
44px. Narrow forms use 16px inputs, keyboard-aware viewport sizing, safe-area
padding and a sticky close/progress header. At phone widths the palette switch
belongs after the footer so it cannot cover campaign content. Payment amounts,
verification and auction behavior are unchanged.
