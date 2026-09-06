export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: 2026-08-29 — Coditent, Morocco</p>
      <div className="mt-8 space-y-6 text-sm leading-6 text-zinc-300">
        <p>Coditent ("we") operates a talent workflow platform connecting candidates and recruiters. This policy explains what we collect, why, and your rights.</p>
        <h2 className="text-base font-semibold text-white">Data we collect</h2>
        <ul className="list-disc pl-5">
          <li>Account: email, password hash, full name, role, avatar URL, OAuth identifiers</li>
          <li>Profile: headline, bio, skills, city, phone, education, links</li>
          <li>Content: offers, recommendations, activity logs</li>
          <li>Technical: cookies (access_token, oauth_onboarding), logs/metrics</li>
        </ul>
        <h2 className="text-base font-semibold text-white">Use</h2>
        <p>To provide auth, matching/recommendations (Gemini with fallback), and platform operation. Legal basis: contract + legitimate interest.</p>
        <h2 className="text-base font-semibold text-white">Sharing</h2>
        <p>No sale of data. Processors: hosting (Docker), DB (Postgres), AI (Google Gemini), Supabase (if configured). OAuth providers when you use Google/LinkedIn login.</p>
        <h2 className="text-base font-semibold text-white">Retention & rights</h2>
        <p>Retain while account active. You may request export or deletion via support. Contact: privacy@coditent.com</p>
        <h2 className="text-base font-semibold text-white">Contact</h2>
        <p>Coditent, Morocco — privacy@coditent.com</p>
      </div>
    </main>
  );
}
