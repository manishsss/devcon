import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service | Devcon T-shirt Campaign" };

export default function TermsPage() {
  return (
    <main id="top">
      <nav className="nav wrap" aria-label="Main navigation">
        <a className="brand creator-brand" href="/"><img className="creator-avatar" src="/web3manish-pfp.jpg" alt="" width="38" height="38" />Web3Manish</a>
        <a className="button secondary" href="/">Back to campaign</a>
      </nav>
      <article className="legal-page wrap">
        <span className="eyebrow">LEGAL</span>
        <h1>Terms of Service</h1>
        <p className="legal-updated"><strong>Last updated: October 9, 2026</strong></p>
        <p>These Terms govern the purchase of sponsorship spots (&quot;Spots&quot;) in the <strong>Devcon Mumbai T-shirt Campaign</strong> (&quot;Campaign&quot;), operated by Manish (&quot;I&quot;, &quot;me&quot;, or &quot;the Creator&quot;) in connection with my planned attendance at Devcon Mumbai in November 2026.</p>
        <p>By purchasing a Spot, you agree to these Terms.</p>
        <section>
          <h2>What You&apos;re Buying</h2>
          <p>Each Spot represents a numbered logo placement on a T-shirt I plan to wear during Devcon Mumbai 2026.</p>
          <p>Each sponsorship includes:</p>
          <ul>
            <li>Your project&apos;s approved logo displayed in the selected position on the T-shirt.</li>
            <li>Two Devcon days featuring your logo, across one black T-shirt and one white T-shirt.</li>
            <li>Two short-form videos featuring your project as part of the Campaign.</li>
            <li>An appreciation post introducing your project, what it does, and why it is supporting the Campaign.</li>
            <li>A collection of photos from Devcon featuring me wearing the sponsored T-shirt.</li>
          </ul>
          <p>The Campaign has exactly eight Spots. The specific placement and current price of each Spot are displayed on the website.</p>
          <p>Sponsorship does not guarantee any particular number of views, impressions, followers, leads, conversions, or other business results.</p>
        </section>
        <section>
          <h2>Auction and Takeover Rules</h2>
          <p>The Campaign uses a four-day auction.</p>
          <p>Each Spot has an initial price displayed on the website. Once a Spot has a confirmed sponsor, another sponsor may take it over by paying <strong>1.5 times the Spot&apos;s most recent confirmed price</strong>.</p>
          <p>Each subsequent takeover is calculated at 1.5 times the previous confirmed price for that Spot.</p>
          <p>A takeover is only complete once the new payment has been verified and confirmed. Until then, the existing sponsor remains the current holder.</p>
          <p>If your Spot is successfully taken over, your original confirmed sponsorship payment will be refunded in full. Refunds will be processed according to the Refund Policy.</p>
          <p>At the end of the four-day auction, the current confirmed holder of each Spot will retain that placement, subject to the Campaign&apos;s fundraising threshold and these Terms.</p>
        </section>
        <section>
          <h2>Fundraising Target and Refunds</h2>
          <p>The Campaign&apos;s target is <strong>$2,200</strong>, representing the combined initial prices of all eight Spots.</p>
          <p>The Campaign must raise at least <strong>50% of the target ($1,100)</strong> in eligible, confirmed current sponsorship funds by the end of the auction.</p>
          <p>If the final eligible amount is less than $1,100, the Campaign will not proceed, and all confirmed current sponsorship payments will be refunded in full, including payments made by current Spot holders.</p>
          <p>Payments already refunded following a successful takeover will not be refunded a second time.</p>
          <p>If the Campaign meets or exceeds the $1,100 minimum, the Campaign may proceed and the current confirmed sponsors will retain their Spots, subject to these Terms.</p>
          <p>Please read the Refund Policy for further details about refund processing.</p>
        </section>
        <section>
          <h2>Sponsor Responsibilities and Logo Approval</h2>
          <p>You are responsible for ensuring that you have the rights and permissions necessary to submit your project&apos;s logo and related brand materials for public display.</p>
          <p>All submitted logos are subject to review. I may reject or request a replacement for material that is unlawful, misleading, inappropriate, infringing, technically unsuitable for printing, or otherwise unsuitable for the Campaign.</p>
          <p>You must provide a replacement logo if reasonably requested. A Spot&apos;s display is subject to approval of the submitted materials.</p>
          <p>You remain responsible for the materials you submit and for any third-party rights associated with them.</p>
        </section>
        <section>
          <h2>Payment</h2>
          <p>Payments are accepted in cryptocurrency only, using the token and blockchain network specified at checkout.</p>
          <p>Where QR checkout is offered, its exact payment includes an identifying fraction of less than 0.01 USDC above the sponsorship price. Send the full displayed amount without rounding, from the wallet address you entered. The fraction does not increase the auction price or fundraising total and is included in any eligible full refund. QR requests must not be reused; late payments do not claim a Spot and require manual refund processing.</p>
          <p>The payment must be successfully verified on-chain before a sponsorship or takeover is confirmed. Sending funds on an unsupported network, sending the wrong token or amount, or providing an invalid transaction hash may delay or prevent confirmation.</p>
          <p>You are responsible for checking the payment amount, network and destination before submitting a transaction. Blockchain transactions may be irreversible, and network fees may not be recoverable.</p>
        </section>
        <section>
          <h2>Campaign Timing and Changes</h2>
          <p>The auction runs for four days from the official start time displayed on the website. The start and end times are determined by the Campaign&apos;s server-side clock.</p>
          <p>Any material change to the Campaign&apos;s timing, deliverables or rules will be communicated on the website. Changes will not retroactively remove refund rights that have already arisen under these Terms.</p>
          <p>The Campaign is based on my planned attendance at Devcon Mumbai 2026. If circumstances prevent attendance or materially affect the promised deliverables, I will communicate the situation and handle affected sponsorships fairly, in accordance with the Refund Policy and applicable law.</p>
        </section>
        <section>
          <h2>Limitation of Liability</h2>
          <p>I will make reasonable efforts to deliver the sponsorship benefits described on the website. However, I cannot guarantee specific audience reach, engagement, leads, sales or business outcomes.</p>
          <p>To the extent permitted by applicable law, liability arising from a sponsorship will be limited to the amount paid for the affected Spot. Nothing in these Terms excludes liability that cannot legally be excluded or limited.</p>
        </section>
        <section>
          <h2>Changes to These Terms</h2>
          <p>The version of these Terms in effect when your payment is confirmed will generally govern that sponsorship. Any material changes will be published on the website.</p>
        </section>
        <section>
          <h2>Contact</h2>
          <p>For questions about these Terms, payments, sponsorships or refunds, contact me through <a href="https://x.com/web3manish" target="_blank" rel="noreferrer">@web3manish on X</a>.</p>
        </section>
      </article>
      <footer className="wrap"><div className="footer-contact">DMs open: <a href="https://t.me/manishweb3" target="_blank" rel="noreferrer">Manish</a></div><div className="footer-legal"><a href="/terms">Terms</a><a href="/refund-policy">Refund Policy</a><a href="/content-logo-policy">Content &amp; Logo Policy</a></div><a href="/">Back to campaign</a></footer>
    </main>
  );
}
