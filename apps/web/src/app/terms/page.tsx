import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | CODITENT",
  description: "Terms for using Coditent accounts, recruitment content and AI recommendations.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" currentPath="/terms">
      <p>
        These Terms govern your use of Coditent’s candidate, recruitment, company-workspace, communication, and AI-supported services. By creating an account, accepting an invitation, or otherwise using Coditent, you agree to these Terms and our Privacy Policy.
      </p>

      <section aria-labelledby="terms-acceptance">
        <h2 id="terms-acceptance">Who may use Coditent</h2>
        <p>
          You must have the legal capacity to enter into these Terms. If you use Coditent for a company or other organization, you confirm that you are authorized to act for that organization and bind it to these Terms. If you do not have legal capacity on your own, you may use the service only with authorization from a parent or legal guardian.
        </p>
      </section>

      <section aria-labelledby="terms-accounts">
        <h2 id="terms-accounts">Accounts and workspace roles</h2>
        <p>
          You must provide accurate information, keep it reasonably current, and protect your credentials. You are responsible for activity performed through your account unless you promptly report unauthorized access. Do not share an individual account or attempt to use another person’s identity.
        </p>
        <p>
          Public registration creates a candidate account. Company users join an organization through an invitation, and platform-administrator accounts are managed by Coditent. These account types have separate views and permissions.
        </p>
        <p>
          Company owners and administrators control invitations and roles within their workspace, including OWNER, ADMIN, HR, RECRUITER, and HIRING MANAGER permissions. They are responsible for granting appropriate access, removing former team members, and ensuring their users handle candidate information lawfully and confidentially.
        </p>
      </section>

      <section aria-labelledby="terms-recruitment">
        <h2 id="terms-recruitment">Recruitment responsibilities</h2>
        <ul className="list-disc pl-5">
          <li>Candidates must present their identity, qualifications, experience, work samples, and application information honestly.</li>
          <li>Companies must have authority to publish each opportunity and must describe roles, conditions, and requirements accurately.</li>
          <li>Companies are responsible for their hiring decisions, communications, interviews, screening criteria, and compliance with employment, equality, and data-protection laws.</li>
          <li>Users must not request or use information in a discriminatory, deceptive, exploitative, or unlawful manner.</li>
        </ul>
        <p>
          Coditent provides workflow and discovery tools. We are not the employer, employee, recruitment agency, or legal representative of either party, and we do not guarantee interviews, offers, candidates, employment, compensation, or hiring outcomes.
        </p>
      </section>

      <section aria-labelledby="terms-content">
        <h2 id="terms-content">Your content</h2>
        <p>
          You retain ownership of content you submit, including profiles, CVs, job offers, messages, feedback, and work samples. You grant Coditent a limited, non-exclusive license to host, copy, process, display, and transmit that content only as needed to operate, secure, and support the service. This license ends when the content is deleted from active systems, except where continued retention is legally permitted or necessary for existing applications, audit integrity, backups, or dispute resolution.
        </p>
        <p>
          You confirm that you have the rights and permissions needed to upload your content and that it does not violate another person’s privacy, confidentiality, intellectual-property, or other legal rights. Do not upload highly sensitive information that is unnecessary for recruitment, such as bank credentials, government authentication secrets, or medical records.
        </p>
      </section>

      <section aria-labelledby="terms-ai">
        <h2 id="terms-ai">AI-supported tools</h2>
        <p>
          Coditent may use Google Gemini or fallback logic to generate match scores, recommendations, summaries, screening context, and writing suggestions. These outputs are probabilistic and may be incomplete, outdated, biased, or incorrect. They are provided to assist human judgment, not replace it. Do not rely on AI output as the sole basis for a hiring or other decision that significantly affects a person. You are responsible for checking output before using or sharing it.
        </p>
      </section>

      <section aria-labelledby="terms-use">
        <h2 id="terms-use">Acceptable use</h2>
        <p>You may not:</p>
        <ul className="list-disc pl-5">
          <li>post false, unlawful, discriminatory, misleading, or fraudulent opportunities or profile information;</li>
          <li>harass users, send spam, operate pyramid schemes, or use candidate data for unrelated marketing;</li>
          <li>scrape, harvest, resell, or build databases from Coditent content without written permission;</li>
          <li>probe, disrupt, overload, reverse engineer, or bypass security, access controls, rate limits, or account restrictions;</li>
          <li>upload malware or content that infringes rights, exposes confidential information, or violates applicable law;</li>
          <li>impersonate another person or organization, create accounts through deceptive means, or conceal unauthorized activity; or</li>
          <li>use automated tools to make high-impact employment decisions without meaningful human review.</li>
        </ul>
      </section>

      <section aria-labelledby="terms-privacy">
        <h2 id="terms-privacy">Privacy and confidential information</h2>
        <p>
          Our Privacy Policy describes Coditent’s processing of personal data. Company users who access candidate information must use it only for legitimate recruitment purposes, limit access to authorized personnel, and protect it from unauthorized disclosure. Users are responsible for obtaining any notices or permissions required for information they upload about another person.
        </p>
      </section>

      <section aria-labelledby="terms-services">
        <h2 id="terms-services">Third-party services</h2>
        <p>
          Some features depend on third-party services such as identity providers, hosting and database providers, email delivery, file storage, and AI services. Their own terms and privacy practices may apply when you interact with them. Coditent is not responsible for third-party services outside our reasonable control, but we remain responsible for selecting and managing providers as required by applicable law.
        </p>
      </section>

      <section aria-labelledby="terms-moderation">
        <h2 id="terms-moderation">Moderation, suspension, and termination</h2>
        <p>
          We may investigate reports and remove content, restrict features, suspend access, or deactivate accounts when reasonably necessary to protect users, comply with law, address security risks, enforce these Terms, or prevent material harm. When practical, we will provide notice and an opportunity to correct the issue. Serious abuse, fraud, or security threats may require immediate action.
        </p>
        <p>
          You may stop using Coditent at any time and can schedule account deletion through available account settings. A seven-day cancellation period applies before deletion processing begins. Some anonymized or legally required records may remain as described in the Privacy Policy.
        </p>
      </section>

      <section aria-labelledby="terms-availability">
        <h2 id="terms-availability">Availability and changes</h2>
        <p>
          We work to keep Coditent available and secure, but the service may be interrupted for maintenance, provider failures, security events, or circumstances outside our control. We may add, change, or retire features. We will provide reasonable notice when a material change significantly reduces a paid or essential service, where feasible.
        </p>
      </section>

      <section aria-labelledby="terms-disclaimer">
        <h2 id="terms-disclaimer">Disclaimers</h2>
        <p>
          To the extent permitted by law, Coditent is provided on an “as available” basis. We do not promise that every opportunity, user, company, message, recommendation, or AI output is accurate, complete, lawful, or suitable. You should independently verify identities, qualifications, job conditions, and decisions before acting on them. Nothing on Coditent is legal, employment, immigration, financial, or professional advice.
        </p>
      </section>

      <section aria-labelledby="terms-liability">
        <h2 id="terms-liability">Limits of liability</h2>
        <p>
          Nothing in these Terms excludes liability that cannot lawfully be excluded. To the extent permitted by law, Coditent is not liable for indirect or consequential loss, lost opportunities, lost profits, loss caused by another user, or decisions made using platform content or AI output. Any liability will be limited to the amount you paid Coditent for the service during the twelve months before the event giving rise to the claim, or, for free services, the minimum limit permitted by applicable law.
        </p>
      </section>

      <section aria-labelledby="terms-law">
        <h2 id="terms-law">Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of Morocco, without overriding any mandatory consumer or data-protection rights that apply to you. Before starting formal proceedings, please contact us so we can try to resolve the issue in good faith. Subject to mandatory law, disputes that cannot be resolved informally will be submitted to the competent courts of Morocco.
        </p>
      </section>

      <section aria-labelledby="terms-changes">
        <h2 id="terms-changes">Changes to these Terms</h2>
        <p>
          We may update these Terms to reflect product, legal, security, or operational changes. We will publish the revised Terms with a new effective date and provide additional notice for material changes. Continuing to use Coditent after the effective date means you accept the revised Terms; if you do not agree, you should stop using the service and close your account.
        </p>
      </section>

      <section aria-labelledby="terms-contact">
        <h2 id="terms-contact">Contact</h2>
        <p>Terms, privacy, and support questions: <a className="font-medium text-primary underline underline-offset-4" href="mailto:notifications@coditent.app">notifications@coditent.app</a></p>
      </section>
    </LegalPage>
  );
}
