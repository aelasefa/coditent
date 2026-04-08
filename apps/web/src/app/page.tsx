import Link from "next/link";

import DotGrid from "@/components/dot-grid";
import { ServiceTeaserCards } from "@/components/service-teaser-cards";

export default function Home() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <DotGrid
          dotSize={4}
          gap={16}
          baseColor="#bcc8e5"
          activeColor="#2f6df6"
          proximity={120}
          shockRadius={220}
          shockStrength={4}
          resistance={900}
          returnDuration={1.4}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white/88 p-6 shadow-xl backdrop-blur-md sm:p-10">
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <DotGrid
              dotSize={5}
              gap={15}
              baseColor="#1d1630"
              activeColor="#5b3df5"
              proximity={120}
              shockRadius={250}
              shockStrength={5}
              resistance={750}
              returnDuration={1.5}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/92 via-white/72 to-slate-100/86" />

          <div className="relative z-10">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Coditent Platform</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
              Hire smarter with AI-assisted candidate and recruiter workflows.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
              One clean workspace to generate recommendations, publish offers, and move faster from discovery to decision.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-300 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
                AI Recommendations
              </span>
              <span className="rounded-full border border-slate-300 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
                Recruiter Offer Management
              </span>
              <span className="rounded-full border border-slate-300 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
                Fast Onboarding
              </span>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-800"
                href="/login"
              >
                Login
              </Link>
              <Link
                className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400"
                href="/register"
              >
                Register
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Match Quality</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">+38%</p>
                <p className="mt-1 text-xs text-slate-600">Average relevance gain with generated recommendations.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time To Publish</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">2 min</p>
                <p className="mt-1 text-xs text-slate-600">From recruiter login to live offer.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow Steps</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">All-in-one</p>
                <p className="mt-1 text-xs text-slate-600">Profile, recommendations, offers, and follow-up in one place.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Link
            className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            href="/dashboard"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Candidate</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">Candidate Dashboard</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Build your profile and receive recommendation results with clear AI reasoning.</p>
            <p className="mt-4 text-sm font-semibold text-slate-900">Explore candidate tools -&gt;</p>
          </Link>

          <Link
            className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            href="/recruiter"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recruiter</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">Recruiter Workspace</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Create offers, control active status instantly, and manage your hiring pipeline efficiently.</p>
            <p className="mt-4 text-sm font-semibold text-slate-900">Explore recruiter tools -&gt;</p>
          </Link>
        </section>

        <ServiceTeaserCards />

        <section className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-xl sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Launch Ready</p>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Start with Coditent and ship your hiring workflow this week.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Candidate and recruiter spaces are already connected to your API. Log in, create data, and iterate fast.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5"
              href="/register"
            >
              Create account
            </Link>
            <Link
              className="rounded-full border border-slate-600 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-slate-400"
              href="/login"
            >
              Sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
