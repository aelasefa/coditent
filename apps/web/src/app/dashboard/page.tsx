import Link from "next/link";

import { ServiceTeaserCards } from "@/components/service-teaser-cards";

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Candidate Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-600">Manage your profile and generate AI-powered job recommendations.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          href="/dashboard/profile"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profile</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Update Profile</h2>
          <p className="mt-2 text-sm text-slate-600">Keep your candidate profile accurate for better matching quality.</p>
        </Link>
        <Link
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          href="/dashboard/recommendations"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommendations</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">AI Recommendations</h2>
          <p className="mt-2 text-sm text-slate-600">Generate tailored offers based on your preferred field, region, and type.</p>
        </Link>
      </section>

      <ServiceTeaserCards />
    </main>
  );
}
