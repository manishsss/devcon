import type { Metadata } from "next";

export const metadata: Metadata = { title: "Content & Logo Policy | Devcon T-shirt Campaign" };

export default function ContentLogoPolicyPage() {
  return (
    <main id="top">
      <nav className="nav wrap" aria-label="Main navigation">
        <a className="brand creator-brand" href="/"><img className="creator-avatar" src="/web3manish-pfp.jpg" alt="" width="40" height="40" />Web3Manish</a>
        <a className="button secondary" href="/">Back to campaign</a>
      </nav>
      <article className="legal-page wrap">
        <span className="eyebrow">LEGAL</span>
        <h1>Content &amp; Logo Policy</h1>
        <p className="legal-updated"><strong>Last updated: October 9, 2026</strong></p>
        <p>This policy applies to all logos, project names, brand assets and other materials submitted for a sponsorship Spot in the Devcon Mumbai T-shirt Campaign (&quot;Campaign&quot;).</p>
        <p>The purpose of this policy is to ensure that all displayed content is appropriate for a public Web3 event and that sponsors have the right to use the materials they submit.</p>
        <section>
          <h2>What&apos;s Not Allowed</h2>
          <p>I reserve the right to reject, remove or request changes to any submission that:</p>
          <ul>
            <li>Violates applicable laws or regulations.</li>
            <li>Promotes hate speech, discrimination, violence or harassment.</li>
            <li>Contains sexually explicit or otherwise inappropriate material.</li>
            <li>Promotes scams, fraudulent projects, deceptive financial claims or impersonation of another brand or project.</li>
            <li>Infringes another party&apos;s trademark, copyright or other intellectual property rights.</li>
            <li>Contains misleading information about the sponsor or its project.</li>
            <li>Is unrelated to the sponsor&apos;s actual brand or is designed to deceive, provoke or mislead viewers.</li>
            <li>Cannot be reproduced clearly or appropriately on the T-shirt.</li>
          </ul>
        </section>
        <section>
          <h2>Logo Review and Approval</h2>
          <p>Submitted logos are checked for supported file format and size. After payment is confirmed, the project and logo automatically appear on the public Campaign page and T-shirt mockup, subject to subsequent review under this policy.</p>
          <p>If a submission does not meet this policy, I may contact the sponsor to request a compliant replacement. Automatic display does not guarantee approval for printing. A Spot is not considered ready for printing until the relevant materials are approved.</p>
          <p>If a logo is rejected, the sponsor will be given a reasonable opportunity to submit an acceptable replacement. If no suitable replacement is provided, the sponsorship may be cancelled and refunded in accordance with the Refund Policy and applicable law.</p>
        </section>
        <section>
          <h2>Violations and Removal</h2>
          <p>If content is found to violate this policy after approval, I reserve the right to remove it from the Campaign page, decline to print it, or request a replacement.</p>
          <p>Where possible, I will contact the sponsor to explain the issue and allow a reasonable opportunity to resolve it. Serious or unlawful violations may require immediate removal.</p>
          <p>Any cancellation, withholding of a Spot or refund will be handled in accordance with the <a href="/terms">Terms of Service</a>, Refund Policy and applicable law. This policy does not remove refund rights that a sponsor is legally entitled to.</p>
        </section>
        <section>
          <h2>Sponsor Responsibilities</h2>
          <p>By submitting a logo, project name or brand asset, you confirm that:</p>
          <ul>
            <li>You own the material or have permission to use and display it publicly.</li>
            <li>The material accurately represents your project or brand.</li>
            <li>Your submission does not knowingly infringe another party&apos;s rights or mislead the public.</li>
            <li>You have authority to submit the material on behalf of the project, where applicable.</li>
          </ul>
          <p>You are responsible for the content you submit and for obtaining any necessary permissions.</p>
          <p>To the extent permitted by applicable law, you agree to cooperate in resolving claims arising from materials you submitted without the necessary rights or permissions.</p>
        </section>
        <section>
          <h2>Intellectual Property Concerns</h2>
          <p>If you believe a logo or other material displayed in the Campaign infringes your rights, please contact me with details of the material and the rights concerned.</p>
          <p>I will review good-faith reports and take appropriate action, which may include removing or replacing the disputed material while the matter is reviewed.</p>
        </section>
        <section>
          <h2>Contact</h2>
          <p>For questions about this policy or to report potentially infringing content, contact me through <a href="https://x.com/web3manish" target="_blank" rel="noreferrer">@web3manish on X</a>.</p>
        </section>
      </article>
      <footer className="wrap"><div className="footer-contact">DMs open: <a href="https://t.me/manishweb3" target="_blank" rel="noreferrer">Manish</a></div><div className="footer-legal"><a href="/terms">Terms</a><a href="/refund-policy">Refund Policy</a><a href="/content-logo-policy">Content &amp; Logo Policy</a></div><a href="/">Back to campaign</a></footer>
    </main>
  );
}
