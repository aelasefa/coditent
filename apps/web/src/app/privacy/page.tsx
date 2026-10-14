import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | CODITENT",
  description: "How Coditent collects and uses information, and how to contact us about your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" currentPath="/privacy">
      <p>Coditent (“we”) operates a talent workflow platform connecting candidates and recruiters. This policy explains what we collect, why, and your rights.</p>
      <section aria-labelledby="privacy-data">
        <h2 id="privacy-data">Data we collect</h2>
        <ul className="list-disc pl-5">
          <li>Account: email, password hash, full name, role, avatar URL, OAuth identifiers</li>
          <li>Profile: headline, bio, skills, city, phone, education, links</li>
          <li>Content: offers, recommendations, activity logs</li>
          <li>Technical: access-token cookies and operational logs/metrics</li>
        </ul>
      </section>
      <section aria-labelledby="privacy-use">
        <h2 id="privacy-use">Use</h2>
        <p>To provide auth, matching/recommendations (Gemini with fallback), and platform operation. Legal basis: contract + legitimate interest.</p>
      </section>
      <section aria-labelledby="privacy-sharing">
        <h2 id="privacy-sharing">Sharing</h2>
        <p>No sale of data. Processors: hosting (Docker), DB (Postgres), AI (Google Gemini), Supabase (if configured). OAuth providers when you use Google/LinkedIn login.</p>
      </section>
      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">Retention & rights</h2>
        <p>Retain while account active. You may request export or deletion via support. Contact: privacy@coditent.com</p>
      </section>
      <section aria-labelledby="privacy-contact">
        <h2 id="privacy-contact">Contact</h2>
        <p>Coditent, Morocco — privacy@coditent.com</p>
      </section>
    </LegalPage>
  );
}
