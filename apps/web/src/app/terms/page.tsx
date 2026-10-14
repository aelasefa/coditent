import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | CODITENT",
  description: "Terms for using Coditent accounts, recruitment content and AI recommendations.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" currentPath="/terms">
      <section aria-labelledby="terms-acceptance">
        <h2 id="terms-acceptance">Acceptance</h2>
        <p>By creating an account you agree to these terms and to our Privacy Policy.</p>
      </section>
      <section aria-labelledby="terms-accounts">
        <h2 id="terms-accounts">Accounts & roles</h2>
        <p>Candidate, Recruiter (requires admin approval), Admin. You must provide accurate info and keep credentials confidential. One account per person.</p>
      </section>
      <section aria-labelledby="terms-content">
        <h2 id="terms-content">Content</h2>
        <p>Recruiters warrant they have rights to post offers. Candidates warrant profile info is truthful. We may moderate or remove unlawful content.</p>
      </section>
      <section aria-labelledby="terms-ai">
        <h2 id="terms-ai">AI recommendations</h2>
        <p>Recommendations are generated via Gemini with a deterministic fallback. They are informational, not guarantees of hiring.</p>
      </section>
      <section aria-labelledby="terms-use">
        <h2 id="terms-use">Acceptable use</h2>
        <p>No scraping, spam, harassment, or circumvention of access controls. Rate limits apply.</p>
      </section>
      <section aria-labelledby="terms-contact">
        <h2 id="terms-contact">Contact</h2>
        <p>support@coditent.com</p>
      </section>
    </LegalPage>
  );
}
