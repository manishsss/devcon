import type { Metadata } from "next";

export const metadata: Metadata = { title: "Refund Policy | Devcon T-shirt Campaign" };

export default function RefundPolicyPage() {
  return (
    <main id="top">
      <nav className="nav wrap" aria-label="Main navigation">
        <a className="brand creator-brand" href="/"><img className="creator-avatar" src="/web3manish-pfp.jpg" alt="" width="38" height="38" />Web3Manish</a>
        <a className="button secondary" href="/">Back to campaign</a>
      </nav>
      <article className="legal-page wrap">
        <span className="eyebrow">LEGAL</span>
        <h1>Refund Policy</h1>
        <p className="legal-updated"><strong>Last updated: October 12, 2026</strong></p>
        <p>This Refund Policy explains when sponsors can receive refunds for the Devcon Mumbai sponsorship campaign organized by Manish (@Web3Manish). Please read it alongside the <a href="/terms">Terms &amp; Conditions</a> before purchasing a sponsorship spot.</p>
        <section>
          <h2>1. Campaign Cancellation and Fundraising Goal</h2>
          <p>The campaign has a fundraising target of <strong>$2,200</strong>.</p>
          <p>If the campaign ends with less than <strong>$1,100 in eligible confirmed sponsorship funds</strong>, the campaign will be cancelled and all eligible confirmed sponsorship payments will be refunded in full.</p>
          <p>If the campaign reaches at least $1,100 in eligible confirmed sponsorship funds, the campaign will proceed, subject to the event and attendance conditions described below.</p>
          <p>Refunds will be initiated within 7 business days after the cancellation is confirmed.</p>
        </section>
        <section>
          <h2>2. Spot Takeover Refunds</h2>
          <p>Sponsorship spots can be taken over by another sponsor at the applicable takeover price stated in the <a href="/terms">Terms &amp; Conditions</a>.</p>
          <p>If a takeover is successfully confirmed and the new sponsor&apos;s payment is verified, the previous sponsor is entitled to a full refund of their original confirmed sponsorship payment.</p>
          <p>A takeover attempt or unconfirmed payment does not trigger a refund. Refund processing will begin after the takeover has been verified.</p>
        </section>
        <section>
          <h2>3. Event Cancellation or Inability to Attend</h2>
          <p>If Devcon Mumbai is cancelled, or I am unable to attend for reasons that prevent me from delivering the campaign&apos;s core sponsorship benefits, I will cancel the campaign and refund eligible confirmed sponsorship payments in full.</p>
          <p>If an alternative arrangement is possible, it may be offered to sponsors, but it will not replace an eligible refund unless the sponsor agrees to that arrangement.</p>
        </section>
        <section>
          <h2>4. No Refunds for Change of Mind</h2>
          <p>Once a sponsorship spot is confirmed, refunds are not available simply because a sponsor changes their mind, no longer wishes to participate, or is dissatisfied with results that were not guaranteed.</p>
          <p>Sponsorship benefits are described on this website and in the <a href="/terms">Terms &amp; Conditions</a>. Views, impressions, leads, sign-ups, conversions, and other performance outcomes are not guaranteed.</p>
        </section>
        <section>
          <h2>5. Violations and Invalid Sponsorships</h2>
          <p>Sponsorships involving misleading, infringing, prohibited, or otherwise non-compliant content may be rejected or removed under the campaign&apos;s <a href="/terms">Terms &amp; Conditions</a> and <a href="/content-logo-policy">Content Policy</a>.</p>
          <p>Refund eligibility for these cases will depend on the applicable terms and the circumstances. No refund will be denied solely on the basis of a policy violation without considering the applicable terms and circumstances.</p>
        </section>
        <section>
          <h2>6. Refund Method and Processing</h2>
          <p>Payments are accepted in supported cryptocurrencies and stablecoins on the networks listed at checkout.</p>
          <p>Eligible refunds will generally be returned to the original sending wallet address on the original payment network, after the payment and refund destination have been verified.</p>
          <p>Refunds are subject to blockchain network conditions and may take additional time to confirm. Any unavoidable network fees or deductions will be communicated transparently before a refund is processed; no deduction will be made without a stated basis in the applicable campaign terms.</p>
          <p>Do not send additional funds or share your private keys or seed phrase to request a refund.</p>
        </section>
        <section>
          <h2>7. Contact</h2>
          <p>For refund questions or campaign-related concerns, contact <strong><a href="https://x.com/web3manish" target="_blank" rel="noreferrer">@web3manish on X</a></strong>.</p>
          <p>This policy should be read together with the campaign&apos;s <a href="/terms">Terms &amp; Conditions</a>, which govern sponsorship pricing, takeover rules, eligibility, and deliverables.</p>
        </section>
      </article>
      <footer className="wrap"><div className="footer-contact">DMs open: <a href="https://t.me/manishweb3" target="_blank" rel="noreferrer">Manish</a></div><div className="footer-legal"><a href="/terms">Terms</a><a href="/refund-policy">Refund Policy</a><a href="/content-logo-policy">Content &amp; Logo Policy</a></div><a href="/">Back to campaign</a></footer>
    </main>
  );
}
