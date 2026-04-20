import Link from "next/link";

import { MdCard } from "@/components/ui/md-card";

const topNav = [
  { label: "Candidate", href: "/profile" },
  { label: "Recruiter", href: "/recruiter" },
  { label: "Recommendations", href: "/dashboard/recommendations" },
];

const features = [
  {
    title: "Signal-rich candidate profiles",
    description:
      "Capture practical strengths, context, and intent in one place so recruiters can evaluate faster with less back-and-forth.",
  },
  {
    title: "Faster recruiter execution",
    description:
      "From screening to publishing offers, every core action is designed for speed, clarity, and lower operational friction.",
  },
  {
    title: "Recommendation momentum",
    description:
      "Use AI-assisted ranking loops to surface relevant opportunities early and keep hiring pipelines active.",
  },
];

const pathwayCards = [
  {
    label: "Candidate Space",
    title: "Build once, get discovered",
    description:
      "Create a complete profile and keep your recommendations, progress, and opportunities in one surface.",
    href: "/profile",
  },
  {
    label: "Recruiter Space",
    title: "Run hiring with context",
    description:
      "Review richer profiles, publish offers, and manage decisions through one coherent recruiter workflow.",
    href: "/recruiter",
  },
  {
    label: "Recommendations",
    title: "Keep your funnel active",
    description:
      "Generate role and region-specific suggestions that help candidates and recruiters meet at the right time.",
    href: "/dashboard/recommendations",
  },
];

const metrics = [
  { name: "Profile completion", value: "84%" },
  { name: "Recruiter response", value: "2.3h" },
  { name: "Offer momentum", value: "+27%" },
];

export const dynamic = "force-static";
export const revalidate = 86_400;

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-md-background text-md-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-28 top-10 h-[28rem] w-[28rem] rounded-full bg-md-primary/20 blur-3xl" />
        <div className="md-glow absolute -right-20 top-1/4 h-[30rem] w-[30rem] rounded-full bg-md-tertiary/20 blur-3xl" />
        <div className="md-glow absolute bottom-0 left-1/3 h-[26rem] w-[26rem] rounded-full bg-md-secondaryContainer/55 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="md-fade-up sticky top-4 z-20 rounded-full border border-md-outline/30 bg-md-surface/90 px-4 py-3 shadow-md-sm backdrop-blur-sm sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link className="inline-flex items-center gap-3" href="/">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-md-primary text-sm font-medium text-md-onPrimary">
                C
              </span>
              <span className="text-sm font-medium tracking-wide">Coditent</span>
            </Link>

            <nav className="hidden items-center gap-5 text-sm text-md-onSurfaceVariant md:flex">
              {topNav.map((item) => (
                <Link className="transition-colors duration-300 ease-md hover:text-md-primary" href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Link
                className="inline-flex h-9 items-center justify-center rounded-full border border-md-outline/60 px-4 text-sm font-medium text-md-primary transition-all duration-300 ease-md hover:bg-md-primary/10 active:scale-95"
                href="/login"
              >
                Login
              </Link>
              <Link
                className="inline-flex h-9 items-center justify-center rounded-full bg-md-primary px-4 text-sm font-medium text-md-onPrimary transition-all duration-300 ease-md hover:bg-md-primary/90 active:scale-95"
                href="/register"
              >
                Register
              </Link>
            </div>
          </div>
        </header>

        <section className="md-fade-up md-fade-delay-1 mt-8 rounded-md-hero border border-md-outline/20 bg-md-surface px-6 py-10 shadow-md-lg sm:px-10 sm:py-14">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-6">
              <p className="inline-flex rounded-full bg-md-secondaryContainer px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-md-onSecondaryContainer">
                Material workflow for hiring teams
              </p>

              <h1 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Connect candidates and recruiters in one expressive workspace.
              </h1>

              <p className="max-w-2xl text-base leading-7 text-md-onSurfaceVariant sm:text-lg">
                Coditent keeps profile quality, recommendation signals, and offer publishing aligned
                across candidate and recruiter journeys.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  className="inline-flex h-11 items-center justify-center rounded-full bg-md-primary px-7 text-sm font-medium text-md-onPrimary transition-all duration-300 ease-md hover:bg-md-primary/90 active:scale-95"
                  href="/register"
                >
                  Start now
                </Link>
                <Link
                  className="inline-flex h-11 items-center justify-center rounded-full border border-md-outline/60 px-7 text-sm font-medium text-md-primary transition-all duration-300 ease-md hover:bg-md-primary/10 active:scale-95"
                  href="/dashboard/recommendations"
                >
                  Explore recommendations
                </Link>
              </div>
            </div>

            <MdCard className="md-float rounded-md-2xl border-md-outline/20 bg-md-surfaceLow/90 p-6 sm:p-7">
              <p className="text-xs uppercase tracking-[0.12em] text-md-onSurfaceVariant">Pipeline snapshot</p>
              <ul className="mt-4 space-y-3">
                {metrics.map((metric) => (
                  <li
                    className="rounded-md-lg border border-md-outline/20 bg-md-surface px-4 py-3 transition-all duration-300 ease-md hover:shadow-md-md"
                    key={metric.name}
                  >
                    <p className="text-xs uppercase tracking-[0.1em] text-md-onSurfaceVariant">{metric.name}</p>
                    <p className="mt-1 text-2xl font-medium text-md-primary">{metric.value}</p>
                  </li>
                ))}
              </ul>
            </MdCard>
          </div>
        </section>

        <section className="mt-12">
          <div className="md-fade-up flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">
                Core capabilities
              </p>
              <h2 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Purposeful design with practical workflow impact.</h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {features.map((feature, index) => (
              <MdCard
                interactive
                className={`md-fade-up p-6 ${index === 1 ? "md-fade-delay-1" : ""} ${index === 2 ? "md-fade-delay-2" : ""}`}
                key={feature.title}
              >
                <h3 className="text-xl font-medium">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-md-onSurfaceVariant">{feature.description}</p>
              </MdCard>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-md-2xl border border-md-outline/20 bg-md-surface px-6 py-8 shadow-md-lg sm:px-8 sm:py-10">
          <div className="md-fade-up mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">Entry pathways</p>
              <h2 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Choose your lane and keep momentum.</h2>
            </div>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-full border border-md-outline/60 px-5 text-sm font-medium text-md-primary transition-all duration-300 ease-md hover:bg-md-primary/10 active:scale-95"
              href="/login"
            >
              Returning users
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {pathwayCards.map((path, index) => (
              <Link
                className={`group rounded-md-lg border border-md-outline/20 bg-md-background p-5 shadow-md-sm transition-all duration-300 ease-md hover:scale-[1.02] hover:shadow-md-md ${
                  index === 1 ? "md-fade-delay-1" : ""
                } ${index === 2 ? "md-fade-delay-2" : ""}`}
                href={path.href}
                key={path.href}
              >
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">{path.label}</p>
                <h3 className="mt-2 text-lg font-medium transition-colors duration-300 ease-md group-hover:text-md-primary">
                  {path.title}
                </h3>
                <p className="mt-2 text-sm leading-7 text-md-onSurfaceVariant">{path.description}</p>
                <p className="mt-4 text-sm font-medium text-md-primary">Open lane</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
