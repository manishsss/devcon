# Public site content sync — October 12, 2026

This branch syncs publicly observable content from https://devcon.manishh.xyz into repository source based on main commit `164625a`. The public website was read only; nothing was deployed, configured, submitted or activated.

Changes recovered from public HTML, CSS and the published homepage client bundle:

- Homepage title: Put Your Brand on Me.
- Shirt placeholders display slot number and current claim price; the limited label is removed. Confirmed sponsor logos use the published borderless style.
- Event section, including its current public copy and link, followed by the FAQ.
- Refund Policy page at `/refund-policy`, copied from the current public policy with its October 12 update date.
- Refund Policy links in the homepage, terms and content-policy footers.

Validation: all four local routes return HTTP 200. Their normalized rendered text, metadata, image references and anchor links match the captured public pages. Compiled CSS matches the downloaded public stylesheet byte for byte (SHA-256 `e1a5bed38a5478d29ea13beaa22f5a6b06d3e21490309cd9c3738c2178986f71`). TypeScript and the production build pass.

This confirms the inspected public pages and styles, not an exact export of the deployed server. Payment handlers, campaign rules, security controls, database migrations and runtime settings are not replaced from public output. Public copy is preserved, including existing auction-timing language; this sync is not a payment launch clearance or legal-policy rewrite.
