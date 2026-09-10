import Link from "next/link";
import { SiteHeader } from "./site-header";
import { Logo } from "@/components/ui/logo";

function MatchPreview() {
  return (
    <div aria-label="Illustrative product preview" className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-md">
      <div className="border-b border-border-subtle px-5 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Illustrative preview</p>
        <p className="mt-0.5 text-[15px] font-bold text-foreground">Frontend Developer · Atlas Studio</p>
        <p className="text-[13px] text-muted-foreground">Casablanca · Full-time · On-site</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-center justify-between rounded-xl bg-surface-secondary/60 px-4 py-3">
          <span className="text-sm font-medium text-foreground-secondary">AI match</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">Strong match</span>
        </div>
        <ol className="space-y-2">
          {[
            ["Applied", true],
            ["Screening", true],
            ["Assessment", false],
            ["Interview", false],
          ].map(([stage, done]) => (
            <li key={stage as string} className="flex items-center gap-2.5 text-sm">
              <span aria-hidden className={done ? "h-2 w-2 rounded-full bg-primary" : "h-2 w-2 rounded-full bg-border-strong"} />
              <span className={done ? "font-medium text-foreground" : "text-muted-foreground"}>{stage as string}</span>
            </li>
          ))}
        </ol>
        <div className="flex gap-2 pt-1">
          <span className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">Apply now</span>
          <span className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium">Details</span>
        </div>
      </div>
    </div>
  );
}

function PipelinePreview() {
  return (
    <div aria-label="Illustrative recruiter preview" className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-md">
      <div className="border-b border-border-subtle px-5 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Illustrative preview</p>
        <p className="mt-0.5 text-[15px] font-bold text-foreground">Hiring pipeline</p>
      </div>
      <ul className="divide-y divide-[var(--border-subtle)]">
        {[
          ["Sara B.", "Frontend Developer", "Assessment", "AI match available"],
          ["Yassine E.", "Backend Developer", "Interview", "Chat available"],
          ["Salma R.", "Product Designer", "Screening", "AI match pending"],
        ].map(([name, role, stage, note]) => (
          <li key={name} className="flex items-center gap-3 px-5 py-3.5">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-xs font-bold text-foreground-secondary">
              {name.split(" ").map((w) => w[0]).join("")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{name} · {role}</span>
              <span className="block truncate text-xs text-muted-foreground">{note}</span>
            </span>
            <span className="shrink-0 rounded-full bg-surface-secondary px-2.5 py-0.5 text-[11px] font-semibold text-foreground-secondary">{stage}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CAPABILITIES = ["AI-powered matching", "Practical skill evaluation", "Application tracking", "Recruiter communication"];
const CANDIDATE_STEPS = [
  ["Build your profile", "Summarize experience, skills and goals in one place."],
  ["Discover relevant opportunities", "Get openings tailored to your field and preferences."],
  ["Prove your skills", "Complete practical assessments tied to real hiring processes."],
  ["Get evaluated", "Recruiters review demonstrated ability alongside your profile."],
  ["Connect with recruiters", "Communication opens as your application advances."],
];
const COMPANY_STEPS = [
  ["Publish opportunities", "Describe the role, requirements and skills."],
  ["Find relevant candidates", "Review applicants with AI match context."],
  ["Evaluate practical skills", "Use assessment results, not CV keywords alone."],
  ["Manage the pipeline", "Screen, shortlist, interview and hire in one flow."],
  ["Communicate and hire", "Message candidates at the right stage."],
];

export function LandingPage() {
  return (
    <div className="bg-background text-foreground">
      <SiteHeader />
      <main id="main">
        <section aria-label="Hero" className="mx-auto w-full max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h1 className="ct-display">AI-powered career growth. From opportunity to proof of skill.</h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Discover relevant jobs and internships, demonstrate capabilities through practical
                evaluations, and connect with recruiters based on more than a CV.
              </p>
              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                <Link href="/offers/all" className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-[15px] font-semibold text-primary-foreground hover:bg-primary-hover">
                  Find opportunities
                </Link>
                <Link href="#companies" className="inline-flex h-12 items-center justify-center rounded-xl border border-border-strong px-6 text-[15px] font-semibold text-foreground hover:bg-surface-secondary">
                  For companies
                </Link>
              </div>
              <ul className="mt-8 grid max-w-lg grid-cols-2 gap-2">
                {CAPABILITIES.map((c) => (
                  <li key={c} className="flex items-center gap-2 text-sm text-foreground-secondary">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <MatchPreview />
          </div>
        </section>

        <section id="how-it-works" aria-label="How it works" className="border-y border-border-subtle bg-surface">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="ct-h1 max-w-2xl">One profile. A clear path to hired.</h2>
            <div id="candidates" className="mt-10 grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="ct-section-title">For candidates</h3>
                <ol className="mt-4 space-y-4">
                  {CANDIDATE_STEPS.map(([title, desc], i) => (
                    <li key={title} className="flex gap-3.5">
                      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">{i + 1}</span>
                      <span>
                        <span className="block text-[15px] font-semibold">{title}</span>
                        <span className="mt-0.5 block max-w-md text-sm leading-relaxed text-muted-foreground">{desc}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <Link href="/register" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">
                  Create candidate account
                </Link>
              </div>
              <div>
                <h3 className="ct-section-title">What progress looks like</h3>
                <div className="mt-4 rounded-2xl border border-border-subtle bg-background p-5">
                  <p className="text-sm font-semibold">Application progress</p>
                  <ol className="mt-3 space-y-2.5">
                    {[["Applied", "Submitted"], ["Screening", "Under review"], ["Assessment", "Practical evaluation"], ["Interview", "Conversation"]].map(([s, d]) => (
                      <li key={s} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{s}</span>
                        <span className="text-muted-foreground">{d}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-muted-foreground">Recruiter chat opens as stages advance. Not every application unlocks chat immediately.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="companies" aria-label="For companies" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="ct-h1">Hire on demonstrated skill.</h2>
              <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground">
                Publish roles, review candidates with match context, run practical assessments,
                and move people through a clear pipeline.
              </p>
              <ol className="mt-6 space-y-3.5">
                {COMPANY_STEPS.map(([title, desc], i) => (
                  <li key={title} className="flex gap-3">
                    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">{i + 1}</span>
                    <span>
                      <span className="block text-[15px] font-semibold">{title}</span>
                      <span className="block max-w-md text-sm text-muted-foreground">{desc}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <Link href="/register" className="mt-6 inline-flex h-12 items-center rounded-xl bg-primary px-6 text-[15px] font-semibold text-primary-foreground hover:bg-primary-hover">
                Start hiring
              </Link>
            </div>
            <PipelinePreview />
          </div>
        </section>

        <section aria-label="Get started" className="border-t border-border-subtle bg-surface">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-5 px-4 py-14 sm:px-6 lg:flex-row lg:items-center">
            <div>
              <h2 className="ct-h1">Start with opportunities.</h2>
              <p className="mt-2 max-w-lg text-muted-foreground">Browse open roles. Create an account only when ready to apply.</p>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Link href="/offers/all" className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-[15px] font-semibold text-primary-foreground hover:bg-primary-hover">
                Browse opportunities
              </Link>
              <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-xl border border-border-strong px-6 text-[15px] font-semibold hover:bg-surface-secondary">
                Log in
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo size="sm" />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <Link href="/offers/all" className="hover:text-foreground">Opportunities</Link>
            <Link href="/login" className="hover:text-foreground">Log in</Link>
            <Link href="/register" className="hover:text-foreground">Get Started</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
