export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Terms of Service</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: 2026-08-29 — Coditent, Morocco</p>
      <div className="mt-8 space-y-6 text-sm leading-6 text-zinc-300">
        <h2 className="text-base font-semibold text-white">Acceptance</h2>
        <p>By creating an account you agree to these terms and to our Privacy Policy.</p>
        <h2 className="text-base font-semibold text-white">Accounts & roles</h2>
        <p>Candidate, Recruiter (requires admin approval), Admin. You must provide accurate info and keep credentials confidential. One account per person.</p>
        <h2 className="text-base font-semibold text-white">Content</h2>
        <p>Recruiters warrant they have rights to post offers. Candidates warrant profile info is truthful. We may moderate or remove unlawful content.</p>
        <h2 className="text-base font-semibold text-white">AI recommendations</h2>
        <p>Recommendations are generated via Gemini with a deterministic fallback. They are informational, not guarantees of hiring.</p>
        <h2 className="text-base font-semibold text-white">Acceptable use</h2>
        <p>No scraping, spam, harassment, or circumvention of access controls. Rate limits apply.</p>
        <h2 className="text-base font-semibold text-white">Contact</h2>
        <p>support@coditent.com</p>
      </div>
    </main>
  );
}
