import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | CODITENT",
  description: "How Coditent collects and uses information, and how to contact us about your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" currentPath="/privacy">
      <p>
        Coditent is a talent and recruitment platform for candidates, companies, recruiters, and platform administrators. This policy explains what personal data we process when you use our website and services, why we use it, who can see it, and the choices available to you.
      </p>

      <section aria-labelledby="privacy-controller">
        <h2 id="privacy-controller">Who is responsible for your data</h2>
        <p>
          Coditent, operating from Morocco, is responsible for the personal data described in this policy. Company customers are also responsible for how their authorized team members use candidate information within their recruitment workspace. Questions or rights requests can be sent to <a className="font-medium text-primary underline underline-offset-4" href="mailto:notifications@coditent.app">notifications@coditent.app</a>.
        </p>
      </section>

      <section aria-labelledby="privacy-data">
        <h2 id="privacy-data">Information we collect</h2>
        <ul className="list-disc pl-5">
          <li><strong>Account and authentication data:</strong> name, email address, password hashes, account type, company membership, verification status, OAuth identifiers, two-factor authentication status, and trusted-device information.</li>
          <li><strong>Candidate profile data:</strong> headline, biography, city, phone number, education, experience, skills, languages, work preferences, portfolio and professional links, profile photo, and CV files.</li>
          <li><strong>Recruitment data:</strong> job offers, applications, application status, cover letters, CV snapshots attached to applications, match scores, screening context, interview feedback, and hiring-pipeline activity.</li>
          <li><strong>Workspace and communication data:</strong> company details, invitations, team roles, direct and recruitment messages, friend connections, support requests, notifications, and practice-mission submissions.</li>
          <li><strong>Technical and security data:</strong> session and CSRF cookies, IP-derived request information, browser and device details made available through standard network requests, timestamps, security events, and diagnostic logs.</li>
          <li><strong>Data received from others:</strong> information supplied by an inviting company, and basic identity information returned by Google or LinkedIn when you choose an OAuth sign-in method.</li>
        </ul>
      </section>

      <section aria-labelledby="privacy-use">
        <h2 id="privacy-use">Why we use this information</h2>
        <p>We process personal data to:</p>
        <ul className="list-disc pl-5">
          <li>create and secure accounts, verify email addresses, provide sign-in and account recovery, and prevent unauthorized access;</li>
          <li>build candidate profiles, store CVs, display relevant opportunities, and process applications;</li>
          <li>let company teams publish roles, evaluate candidates, coordinate interviews, communicate, and manage hiring workflows;</li>
          <li>generate recommendations, match context, profile-writing assistance, and other requested AI-supported features;</li>
          <li>deliver transactional email, invitations, notifications, support, and service messages;</li>
          <li>monitor reliability, investigate abuse, enforce our Terms, maintain audit records, and protect users and the platform; and</li>
          <li>meet legal, regulatory, accounting, and dispute-resolution obligations.</li>
        </ul>
        <p>
          Depending on the context, these activities are necessary to provide the service you request, support our legitimate interests in operating and securing the platform, comply with legal obligations, or rely on your consent where the law requires it. You may withdraw consent for future processing at any time, without affecting processing already carried out.
        </p>
      </section>

      <section aria-labelledby="privacy-ai">
        <h2 id="privacy-ai">AI-supported features</h2>
        <p>
          When you request an AI feature, relevant profile, CV, job, or application information may be sent to our configured AI provider, currently Google Gemini, to produce a recommendation, summary, match explanation, or writing suggestion. AI output can be incomplete or inaccurate and should not be treated as a final hiring decision. Companies remain responsible for reviewing candidates fairly and making their own decisions. Coditent may use deterministic, non-AI fallback logic when the AI service is unavailable.
        </p>
      </section>

      <section aria-labelledby="privacy-visibility">
        <h2 id="privacy-visibility">Who can see your information</h2>
        <ul className="list-disc pl-5">
          <li>Candidate profile information you choose to make available may be shown to relevant recruiters, company users, and connected candidates.</li>
          <li>When you apply, authorized members of that company can view your application, the CV version submitted with it, and related screening and interview information.</li>
          <li>Messages are visible to their participants and may be accessible to authorized support or security personnel when needed to investigate a reported issue.</li>
          <li>Company owners and administrators can manage members, roles, invitations, and workspace activity for their organization.</li>
          <li>Platform administrators have controlled access needed for support, moderation, security, and audit functions. Administrative actions are logged.</li>
        </ul>
      </section>

      <section aria-labelledby="privacy-sharing">
        <h2 id="privacy-sharing">Service providers and disclosures</h2>
        <p>We do not sell personal data. We disclose information only as needed to operate the service, including to:</p>
        <ul className="list-disc pl-5">
          <li>our deployment host and Supabase, which provide application hosting, PostgreSQL database services, and private file storage;</li>
          <li>Google Gemini for requested AI-supported features;</li>
          <li>Resend for verification, invitation, recovery, and service email delivery;</li>
          <li>Google or LinkedIn when you choose their sign-in service;</li>
          <li>professional advisers, authorities, courts, or counterparties when disclosure is legally required or reasonably necessary to protect rights, safety, and platform integrity; and</li>
          <li>a successor organization in connection with a merger, financing, reorganization, or sale, subject to appropriate confidentiality protections.</li>
        </ul>
        <p>
          Some providers may process data outside Morocco. Where cross-border processing occurs, we take steps appropriate to applicable law, including contractual safeguards and required regulatory formalities.
        </p>
      </section>

      <section aria-labelledby="privacy-cookies">
        <h2 id="privacy-cookies">Cookies and local storage</h2>
        <p>
          Coditent uses strictly necessary cookies and browser storage to keep you signed in, protect state-changing requests, complete OAuth sign-in, remember trusted devices, and preserve essential application state. These technologies are not used by Coditent to sell behavioral advertising profiles. Clearing them may sign you out or reset preferences.
        </p>
      </section>

      <section aria-labelledby="privacy-retention">
        <h2 id="privacy-retention">How long we keep information</h2>
        <p>
          We keep account and workspace information while the account or company relationship is active and for a reasonable period afterward when needed for security, legal claims, fraud prevention, or required records. A CV version submitted with an application is retained while that application record exists so the company can review the same document that was originally submitted. Security and audit records may be retained after account deletion in anonymized form where necessary to preserve platform integrity.
        </p>
        <p>
          Account deletion requests have a seven-day cancellation period. When deletion completes, private files and direct identity fields are removed or de-identified, messages and mission evidence are replaced with deletion markers, and records that must remain for integrity are anonymized. Backup and provider-level copies may take additional time to expire through normal backup cycles.
        </p>
      </section>

      <section aria-labelledby="privacy-security">
        <h2 id="privacy-security">Security</h2>
        <p>
          We use measures such as encrypted transport, hashed passwords, scoped access controls, secure session cookies in production, CSRF protection, optional two-factor authentication, rate limits, audit logs, and encryption for selected secrets and queued email content. No online service can guarantee absolute security. Tell us promptly if you believe your account or information has been compromised.
        </p>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">Your rights and choices</h2>
        <p>
          Subject to applicable law, including Morocco’s Law No. 09-08, you may ask whether we process your information and request access, correction, or opposition for legitimate reasons. You may also use available account tools to update information, export account data, remove a CV, or schedule account deletion. Other rights, including deletion, restriction, portability, or withdrawal of consent, may apply depending on your location and the processing involved.
        </p>
        <p>
          Send a request to <a className="font-medium text-primary underline underline-offset-4" href="mailto:notifications@coditent.app">notifications@coditent.app</a>. We may need to verify your identity and may retain limited information where the law permits or requires it. You may also contact Morocco’s <a className="font-medium text-primary underline underline-offset-4" href="https://www.cndp.ma/" rel="noreferrer" target="_blank">Commission Nationale de contrôle de la protection des Données à caractère Personnel (CNDP)</a> about your rights.
        </p>
      </section>

      <section aria-labelledby="privacy-children">
        <h2 id="privacy-children">Children</h2>
        <p>
          Coditent is intended for people who can lawfully create an account and participate in recruitment activities. If you are not legally able to agree to these terms on your own, use the service only with authorization from a parent or legal guardian. Contact us if you believe a child’s information was provided without appropriate authorization.
        </p>
      </section>

      <section aria-labelledby="privacy-updates">
        <h2 id="privacy-updates">Changes to this policy</h2>
        <p>
          We may update this policy as the product, providers, or legal requirements change. We will publish the revised version with a new effective date and provide additional notice when a change materially affects how we use personal data.
        </p>
      </section>

      <section aria-labelledby="privacy-contact">
        <h2 id="privacy-contact">Contact</h2>
        <p>Privacy questions, rights requests, and general support: <a className="font-medium text-primary underline underline-offset-4" href="mailto:notifications@coditent.app">notifications@coditent.app</a></p>
      </section>
    </LegalPage>
  );
}
