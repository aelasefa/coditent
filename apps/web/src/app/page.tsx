import Link from "next/link";

import { LandingHeader } from "@/components/landing-header";
import { ActivityItem } from "@/components/ui/activity-item";
import DarkVeil from "@/components/ui/dark-veil";
import { MdBadge } from "@/components/ui/md-badge";
import { MdCard } from "@/components/ui/md-card";
import { MdLinkButton } from "@/components/ui/md-link-button";
import ScrollFloat from "@/components/ui/scroll-float";
import SplitText from "@/components/ui/split-text";

const topNav = [
  { label: "Candidate", href: "/dashboard/profile" },
  { label: "Recruiter", href: "/recruiter/offers/new" },
  { label: "Recommendations", href: "/dashboard/recommendations" },
];

const heroHighlights = [
  "Profile quality",
  "Recruiter speed",
  "Recommendation clarity",
  "Decision trust",
];

const capabilityRows = [
  {
    title: "Signal-rich profiles",
    description: "Capture practical strengths, context, and intent without bloating the candidate flow.",
    impact: "Faster profile decisions",
  },
  {
    title: "Faster recruiter execution",
    description: "Move from screening to offer publishing with fewer clicks and cleaner decision context.",
    impact: "Lower operational friction",
  },
  {
    title: "Recommendation momentum",
    description: "Surface relevant opportunities earlier with explainable ranking signals and live updates.",
    impact: "Higher funnel activation",
  },
];

const pathwayRows = [
  {
    label: "Candidate space",
    title: "Build once, get discovered",
    description:
      "Create a complete profile and keep your recommendations, progress, and opportunities in one surface.",
    href: "/dashboard/profile",
    cta: "Open candidate space",
  },
  {
    label: "Recruiter space",
    title: "Run hiring with context",
    description:
      "Review richer profiles, publish offers, and manage decisions through one coherent recruiter workflow.",
    href: "/recruiter/offers/new",
    cta: "Open recruiter space",
  },
  {
    label: "Recommendations",
    title: "Keep your funnel active",
    description:
      "Generate role and region-specific suggestions that help candidates and recruiters meet at the right time.",
    href: "/dashboard/recommendations",
    cta: "Open recommendations",
  },
];

type MetricIconKind = "profile" | "response" | "momentum";

const metrics: Array<{
  name: string;
  value: string;
  trend: string;
  icon: MetricIconKind;
}> = [
  { name: "Profile completion", value: "84%", trend: "+5.2% this week", icon: "profile" },
  { name: "Recruiter response", value: "2.3h", trend: "32 min faster", icon: "response" },
  { name: "Offer momentum", value: "+27%", trend: "Stable growth", icon: "momentum" },
];

const activityFeed: Array<{
  message: string;
  timeLabel: string;
  status: "live" | "completed" | "queued";
}> = [
  {
    message: "New candidate profile completed in Casablanca",
    timeLabel: "2 min ago",
    status: "live",
  },
  {
    message: "Recruiter published Backend Engineer offer",
    timeLabel: "5 min ago",
    status: "completed",
  },
  {
    message: "Recommendation score updated for 14 candidates",
    timeLabel: "8 min ago",
    status: "live",
  },
  {
    message: "3 interviews queued for confirmation",
    timeLabel: "12 min ago",
    status: "queued",
  },
];

const hiringCompanies = [
  {
    name: "Atlas Systems",
    sector: "Enterprise SaaS",
    hq: "Casablanca",
    openings: 12,
    summary:
      "Scaling product and platform teams to accelerate B2B hiring workflows across the region.",
    hiringFor: ["Frontend", "Backend", "Product"],
  },
  {
    name: "Northstar Labs",
    sector: "AI Products",
    hq: "Rabat",
    openings: 9,
    summary:
      "Building AI-first candidate discovery tools and recommendation pipelines with explainable signals.",
    hiringFor: ["ML", "Data", "QA"],
  },
  {
    name: "Blue Dune",
    sector: "Fintech",
    hq: "Tangier",
    openings: 6,
    summary:
      "Hiring product designers and engineers to improve high-trust onboarding and operations flows.",
    hiringFor: ["Design", "Mobile", "Operations"],
  },
  {
    name: "Mosaic Group",
    sector: "Logistics Tech",
    hq: "Marrakech",
    openings: 14,
    summary:
      "Expanding platform engineering and customer success squads for high-volume recruiter operations.",
    hiringFor: ["Platform", "Success", "Analytics"],
  },
  {
    name: "Harbor SaaS",
    sector: "HR Automation",
    hq: "Agadir",
    openings: 7,
    summary:
      "Growing teams that improve recruiter decision velocity and candidate lifecycle quality.",
    hiringFor: ["Recruiting", "Sales", "Support"],
  },
  {
    name: "Nomad Data",
    sector: "Data Infrastructure",
    hq: "Casablanca",
    openings: 10,
    summary:
      "Hiring data engineers and analysts to turn job-market and funnel metrics into action.",
    hiringFor: ["Data Eng", "BI", "Infra"],
  },
];

const roleSpotlights = [
  {
    role: "Senior Frontend Engineer",
    company: "Atlas Systems",
    location: "Casablanca / Hybrid",
    salary: "28k-36k MAD",
    vibe: "Fast product iterations, design-system ownership, cross-team collaboration.",
  },
  {
    role: "Product Designer",
    company: "Blue Dune",
    location: "Rabat / Remote",
    salary: "22k-30k MAD",
    vibe: "End-to-end UX for onboarding and trust-heavy transactional experiences.",
  },
  {
    role: "Data Analyst",
    company: "Nomad Data",
    location: "Tangier / Hybrid",
    salary: "18k-25k MAD",
    vibe: "Dashboard storytelling, funnel analysis, and recommendation quality tracking.",
  },
  {
    role: "Technical Recruiter",
    company: "Harbor SaaS",
    location: "Casablanca / On-site",
    salary: "16k-22k MAD",
    vibe: "Partner with hiring managers and run process improvements with measurable SLAs.",
  },
  {
    role: "Backend Engineer",
    company: "Northstar Labs",
    location: "Rabat / Hybrid",
    salary: "24k-34k MAD",
    vibe: "Own APIs and ranking pipelines powering recruiter workflows and fit explanations.",
  },
  {
    role: "Customer Success Lead",
    company: "Mosaic Group",
    location: "Marrakech / On-site",
    salary: "18k-26k MAD",
    vibe: "Drive onboarding quality and recruiter adoption with measurable process improvements.",
  },
];

const faqItems = [
  {
    question: "How is Coditent different from generic job boards?",
    answer:
      "Coditent focuses on profile depth, recruiter workflow speed, and recommendation quality instead of only listing volume.",
  },
  {
    question: "Can recruiters manage approvals and offer lifecycle here?",
    answer:
      "Yes. Recruiters can create and control offers, while admin approval ensures role safety and trusted access.",
  },
  {
    question: "Do candidates get personalized opportunities?",
    answer:
      "Yes. Recommendations combine profile context and criteria to surface opportunities with fit rationale.",
  },
  {
    question: "Is this usable on mobile and desktop?",
    answer:
      "The interface is responsive by default, with motion and layout choices tuned for both viewports.",
  },
];

const footerColumns: Array<{ title: string; links: string[] }> = [
  {
    title: "Product",
    links: ["Dashboard", "Recommendations", "Profile Builder", "Recruiter Hub"],
  },
  {
    title: "For Candidates",
    links: ["Create Profile", "Track Momentum", "Skill Positioning", "Interview Prep"],
  },
  {
    title: "For Recruiters",
    links: ["Publish Offers", "Pipeline Speed", "Candidate Review", "Hiring Insights"],
  },
];

function MetricIcon({ kind }: { kind: MetricIconKind }) {
  if (kind === "profile") {
    return (
      <svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path
          d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 1 0-14 0"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (kind === "response") {
    return (
      <svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path
          d="M12 8v4l2.5 2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 16.5 10 10.5l4 4L20 8.5M16 8.5H20v4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export const dynamic = "force-static";
export const revalidate = 86_400;

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-md-background text-md-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.86]">
          <DarkVeil
            className="absolute inset-0 h-full w-full"
            hueShift={-14}
            noiseIntensity={0}
            scanlineIntensity={0}
            speed={0.42}
            scanlineFrequency={0}
            warpAmount={0.06}
            resolutionScale={0.55}
            maxFps={30}
          />
        </div>

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(143,117,199,0.29),transparent_42%),radial-gradient(circle_at_82%_78%,rgba(76,182,196,0.2),transparent_44%),radial-gradient(circle_at_58%_26%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="md-gradient-flow absolute inset-0 opacity-35" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:36px_36px] opacity-25" />
        <div className="md-noise-overlay absolute inset-0 opacity-20" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,2,7,0.2)_0%,rgba(2,2,7,0.66)_84%,rgba(2,2,7,0.9)_100%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <LandingHeader navItems={topNav} />

        <section className="md-fade-up pb-14 pt-16 sm:pt-24">
          <MdBadge pulse variant="default">
            Talent workflow platform
          </MdBadge>

          <SplitText
            className="mt-5 max-w-3xl text-balance text-4xl font-medium leading-tight tracking-tight text-md-foreground sm:text-5xl lg:text-6xl"
            delay={35}
            duration={1.1}
            ease="power3.out"
            from={{ opacity: 0, y: 36 }}
            rootMargin="-80px"
            splitType="chars"
            tag="h1"
            text="Connect candidates and recruiters in one expressive workspace."
            textAlign="left"
            threshold={0.1}
            to={{ opacity: 1, y: 0 }}
          />

          <p className="mt-5 max-w-2xl text-base leading-7 text-md-onSurfaceVariant sm:text-lg">
            Align profile quality, recommendation signals, and offer publishing in a single surface that
            moves fast and stays trustworthy.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <MdLinkButton href="/register" size="lg" variant="primary">
              Create account
            </MdLinkButton>
            <MdLinkButton href="/dashboard/recommendations" size="lg" variant="secondary">
              Explore recommendations
            </MdLinkButton>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {heroHighlights.map((chip) => (
              <MdBadge key={chip} variant="muted">
                {chip}
              </MdBadge>
            ))}
          </div>
        </section>

        <div className="md-section-divider" />

        <section className="md-fade-up md-fade-delay-1 py-10">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <MdCard className="p-5 sm:p-6" variant="elevated">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">
                    Pipeline snapshot
                  </p>
                  <p className="mt-2 text-sm text-md-onSurfaceVariant">
                    A quick view of current performance and movement.
                  </p>
                </div>
                <MdBadge variant="live">Realtime</MdBadge>
              </div>

              {metrics.length > 0 ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {metrics.map((metric, index) => (
                    <MdCard
                      className="group p-4 transition-all duration-200 ease-md"
                      interactive
                      key={metric.name}
                      style={{ animationDelay: `${index * 60}ms` }}
                      variant="interactive"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-md-primary/18 text-md-primary">
                          <MetricIcon kind={metric.icon} />
                        </span>
                        <MdBadge variant="muted">{metric.trend}</MdBadge>
                      </div>
                      <p className="mt-3 text-xs uppercase tracking-[0.1em] text-md-onSurfaceVariant">{metric.name}</p>
                      <p className="mt-2 text-2xl font-medium text-md-foreground">{metric.value}</p>
                    </MdCard>
                  ))}
                </div>
              ) : (
                <MdCard className="mt-5 p-5 text-sm text-md-onSurfaceVariant" variant="ghost">
                  Metrics will appear once activity starts flowing through candidate and recruiter pipelines.
                </MdCard>
              )}
            </MdCard>

            <MdCard className="p-5 sm:p-6" variant="elevated">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">
                    Live activity
                  </p>
                  <p className="mt-2 text-sm text-md-onSurfaceVariant">
                    Events update continuously as users move through workflows.
                  </p>
                </div>
                <MdBadge pulse variant="live">
                  System online
                </MdBadge>
              </div>

              {activityFeed.length > 0 ? (
                <ul className="mt-5 divide-y divide-md-outline/30 rounded-md-xl border border-md-outline/40 bg-md-surfaceLow/48">
                  {activityFeed.map((event, index) => (
                    <ActivityItem
                      className={index === 0 ? "md-rise-in" : "md-rise-in md-fade-delay-1"}
                      key={`${event.timeLabel}-${event.message}`}
                      message={event.message}
                      status={event.status}
                      timeLabel={event.timeLabel}
                    />
                  ))}
                </ul>
              ) : (
                <MdCard className="mt-5 p-5 text-sm text-md-onSurfaceVariant" variant="ghost">
                  No live events yet. Your realtime feed will populate as user activity begins.
                </MdCard>
              )}
            </MdCard>
          </div>
        </section>

        <section className="mt-2">
          <div className="md-fade-up">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">Core capabilities</p>
            <ScrollFloat
              animationDuration={1}
              containerClassName="mt-2 max-w-3xl text-left"
              ease="back.inOut(2)"
              scrollEnd="bottom bottom-=40%"
              scrollStart="center bottom+=50%"
              stagger={0.03}
              textClassName="text-left text-[clamp(1.9rem,4.1vw,2.35rem)] font-medium leading-tight tracking-tight text-md-foreground"
            >
              Purposeful design with practical workflow impact.
            </ScrollFloat>
          </div>

          <MdCard className="mt-6 divide-y divide-md-outline/30" variant="elevated">
            {capabilityRows.map((item, index) => (
              <div className="grid gap-4 px-5 py-6 sm:grid-cols-[92px_1fr] sm:px-7" key={item.title}>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-md-primary">0{index + 1}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.1em] text-md-onSurfaceVariant">{item.impact}</p>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-md-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-md-onSurfaceVariant">{item.description}</p>
                </div>
              </div>
            ))}
          </MdCard>
        </section>

        <div className="md-section-divider mt-12" />

        <section className="mt-12">
          <div className="md-fade-up mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">Entry pathways</p>
              <h2 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Choose your lane and keep momentum.</h2>
            </div>
            <MdLinkButton href="/login" size="sm" variant="outlined">
              Returning users
            </MdLinkButton>
          </div>

          {pathwayRows.length > 0 ? (
            <MdCard className="divide-y divide-md-outline/30" variant="elevated">
              {pathwayRows.map((path) => (
                <Link
                  className="group block px-6 py-6 transition-colors duration-200 ease-md hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary"
                  href={path.href}
                  key={path.href}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <MdBadge variant="muted">{path.label}</MdBadge>
                    <span className="h-px flex-1 bg-md-outline/40" />
                  </div>
                  <h3 className="mt-3 text-xl font-medium transition-transform duration-200 ease-md group-hover:translate-x-1">
                    {path.title}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-md-onSurfaceVariant">{path.description}</p>
                  <p className="mt-3 text-sm font-medium text-md-primary transition-transform duration-200 ease-md group-hover:translate-x-1">
                    {path.cta}
                  </p>
                </Link>
              ))}
            </MdCard>
          ) : (
            <MdCard className="p-6 text-sm text-md-onSurfaceVariant" variant="ghost">
              Pathways are being configured. They will appear here once enabled.
            </MdCard>
          )}
        </section>

        <section className="mt-14">
          <div className="md-fade-up">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">Companies hiring now</p>
            <h2 className="mt-2 text-3xl font-medium tracking-tight text-md-foreground sm:text-4xl">
              Discover active teams and their hiring context.
            </h2>
          </div>

          {hiringCompanies.length > 0 ? (
            <MdCard className="mt-6 divide-y divide-md-outline/25" variant="elevated">
              {hiringCompanies.map((company) => (
                <div className="px-6 py-5 sm:px-7" key={company.name}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xl font-medium">{company.name}</h3>
                    <MdBadge variant="default">{company.openings} openings</MdBadge>
                  </div>
                  <p className="mt-1 text-sm text-md-onSurfaceVariant">
                    {company.sector} · {company.hq}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-md-onSurfaceVariant">{company.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {company.hiringFor.map((focus) => (
                      <MdBadge key={`${company.name}-${focus}`} variant="muted">
                        {focus}
                      </MdBadge>
                    ))}
                  </div>
                </div>
              ))}
            </MdCard>
          ) : (
            <MdCard className="mt-6 p-6 text-sm text-md-onSurfaceVariant" variant="ghost">
              No companies are currently featured. Check back after new campaigns are published.
            </MdCard>
          )}
        </section>

        <section className="mt-14">
          <div className="md-fade-up">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">Role stream</p>
            <h2 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">High-signal opportunities this week.</h2>
          </div>

          {roleSpotlights.length > 0 ? (
            <MdCard className="mt-6 divide-y divide-md-outline/25" variant="elevated">
              {roleSpotlights.map((spot) => (
                <article className="px-6 py-5 sm:px-7" key={`${spot.company}-${spot.role}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-medium">{spot.role}</p>
                      <p className="mt-1 text-sm text-md-onSurfaceVariant">
                        {spot.company} · {spot.location}
                      </p>
                    </div>
                    <MdBadge variant="default">{spot.salary}</MdBadge>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-md-onSurfaceVariant">{spot.vibe}</p>
                </article>
              ))}
            </MdCard>
          ) : (
            <MdCard className="mt-6 p-6 text-sm text-md-onSurfaceVariant" variant="ghost">
              No role spotlights yet. Featured roles appear here as recruiter demand increases.
            </MdCard>
          )}
        </section>

        <section className="mt-14">
          <MdCard className="px-6 py-8 sm:px-8 sm:py-10" variant="elevated">
            <div className="md-fade-up">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">FAQ</p>
              <h2 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Everything you need before you start.</h2>
            </div>

            {faqItems.length > 0 ? (
              <div className="mt-6 divide-y divide-md-outline/30 rounded-md-xl border border-md-outline/35 bg-md-surfaceLow/52">
                {faqItems.map((item) => (
                  <div className="px-5 py-5" key={item.question}>
                    <h3 className="text-lg font-medium text-md-foreground">{item.question}</h3>
                    <p className="mt-2 text-sm leading-7 text-md-onSurfaceVariant">{item.answer}</p>
                  </div>
                ))}
              </div>
            ) : (
              <MdCard className="mt-6 p-5 text-sm text-md-onSurfaceVariant" variant="ghost">
                FAQs are currently unavailable.
              </MdCard>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <MdLinkButton href="/register" size="md" variant="primary">
                Create account
              </MdLinkButton>
              <MdLinkButton href="/login" size="md" variant="outlined">
                Sign in
              </MdLinkButton>
            </div>
          </MdCard>
        </section>

        <footer className="mb-6 mt-14">
          <MdCard className="px-6 py-8 sm:px-8 sm:py-10" variant="ghost">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
              <div className="md-fade-up">
                <div className="inline-flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-md-primary text-sm font-medium text-md-onPrimary">
                    C
                  </span>
                  <div>
                    <p className="text-sm font-medium tracking-wide">Coditent</p>
                    <p className="text-xs uppercase tracking-[0.1em] text-md-onSurfaceVariant">Talent workflow OS</p>
                  </div>
                </div>

                <p className="mt-4 max-w-sm text-sm leading-7 text-md-onSurfaceVariant">
                  Built for teams that want better hiring outcomes through richer profiles, clearer signal, and faster execution.
                </p>
              </div>

              {footerColumns.map((column, index) => (
                <div
                  className={`md-fade-up ${index === 1 ? "md-fade-delay-1" : index === 2 ? "md-fade-delay-2" : ""}`}
                  key={column.title}
                >
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">{column.title}</p>
                  <ul className="mt-3 space-y-2">
                    {column.links.map((link) => (
                      <li key={`${column.title}-${link}`}>
                        <span className="text-sm text-md-onSurfaceVariant transition-colors duration-200 ease-md hover:text-md-foreground">
                          {link}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-8 border-t border-md-outline/30 pt-4 text-xs uppercase tracking-[0.1em] text-md-onSurfaceVariant">
              © {new Date().getFullYear()} Coditent. Built for faster, clearer hiring cycles.
            </div>
          </MdCard>
        </footer>
      </div>
    </main>
  );
}