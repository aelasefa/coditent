export function ServiceTeaserCards() {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Service 2</p>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">Interview Copilot</h3>
        <p className="mt-2 text-sm text-slate-600">Prepare interviews with tailored questions and recruiter-style feedback.</p>
        <ul className="mt-4 space-y-1 text-sm text-slate-700">
          <li>- Role-aware mock interviews</li>
          <li>- Real-time improvement suggestions</li>
          <li>- Structured scoring for confidence tracking</li>
        </ul>
        <span className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          Coming Soon
        </span>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Service 3</p>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">Application Tracker</h3>
        <p className="mt-2 text-sm text-slate-600">Track each application stage and get reminders to follow up on time.</p>
        <ul className="mt-4 space-y-1 text-sm text-slate-700">
          <li>- Stage pipeline board</li>
          <li>- Follow-up reminders and notes</li>
          <li>- Weekly progress summaries</li>
        </ul>
        <span className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          Coming Soon
        </span>
      </article>
    </section>
  );
}
