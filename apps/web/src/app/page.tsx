import Link from "next/link";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import LiquidEtherHero from "@/components/liquid-ether-hero";

export const dynamic = "force-static";
export const revalidate = 86400;

const uiFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const displayFont = Outfit({
  subsets: ["latin"],
  weight: ["700", "800"],
  preload: false,
});

const featureCards = [
  {
    title: "Signal-rich candidate profiles",
    text: "Capture real experience, strengths, and intent in one flow so recruiters evaluate fast without losing context.",
    tone: "from-[#13366f] to-[#0f2861]",
  },
  {
    title: "Recruiter execution speed",
    text: "From first review to offer launch, every action is optimized for throughput with less admin drag.",
    tone: "from-[#1b4b33] to-[#173f2c]",
  },
  {
    title: "Recommendation momentum",
    text: "Matching loops prioritize fit and timing so pipelines stay alive and high-potential candidates are not missed.",
    tone: "from-[#604017] to-[#513611]",
  },
];

const milestones = [
  { label: "Profiles completed", value: "84%", width: "84%", change: "+12%" },
  { label: "Recruiter response speed", value: "2.3h", width: "68%", change: "-29%" },
  { label: "Offer conversion trend", value: "+27%", width: "73%", change: "+8%" },
];

const entryLanes = [
  {
    name: "Candidate Space",
    title: "Build once, get discovered",
    description: "Create a complete profile and keep opportunities, recommendations, and progress in one place.",
    href: "/profile",
  },
  {
    name: "Recruiter Space",
    title: "Hire with full context",
    description: "Screen richer profiles, compare candidates quickly, and publish offers without context switching.",
    href: "/recruiter",
  },
  {
    name: "Recommendation Space",
    title: "Keep your funnel moving",
    description: "Surface high-fit matches early and keep candidate flow healthy through every hiring stage.",
    href: "/dashboard/recommendations",
  },
];

const topNav = [
  { label: "Candidate", href: "/profile" },
  { label: "Recruiter", href: "/recruiter" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Login", href: "/login" },
];

export default function Home() {
  return (
    <main className={`${uiFont.className} min-h-screen bg-[#071126] text-[#e6ecff]`}>
      <section className="relative isolate min-h-screen overflow-hidden px-4 sm:px-8 lg:px-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_12%,rgba(59,95,165,0.42),rgba(8,17,38,0.92)_48%,rgba(4,9,22,1)_74%)]" />
        <div className="nexus-glow pointer-events-none absolute -left-20 top-24 h-72 w-72 rounded-full bg-[#ffb300]/30 blur-3xl" />
        <div className="nexus-glow nexus-delay-2 pointer-events-none absolute right-0 top-44 h-80 w-80 rounded-full bg-[#2b7cff]/20 blur-3xl" />

        <div className="absolute inset-0 z-0 opacity-60 mix-blend-screen">
          <LiquidEtherHero />
        </div>

        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col pb-10">
          <header className="nexus-reveal mt-6 flex items-center justify-between gap-4 rounded-2xl border border-white/20 bg-[#0c1a3a]/55 px-4 py-3 backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#ffb300] text-sm font-bold text-[#081022]">
                C
              </span>
              <div>
                <p className="text-sm font-semibold tracking-wide text-white">Coditent</p>
                <p className="text-xs text-[#b4c4ec]">Talent workflow OS</p>
              </div>
            </div>
            <nav className="hidden items-center gap-5 text-sm font-medium text-[#cbd7f5] md:flex">
              {topNav.map((item) => (
                <Link className="transition-colors duration-300 hover:text-[#ffdb7f]" href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>

          <div className="grid flex-1 content-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
            <div className="nexus-reveal space-y-8">
              <p className="inline-flex items-center rounded-full border border-[#ffcc5f]/30 bg-[#ffb300]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#ffd476] backdrop-blur-sm">
                Recruitment Intelligence Platform
              </p>

              <h1 className={`${displayFont.className} max-w-2xl text-5xl font-bold leading-[0.92] text-white sm:text-6xl lg:text-7xl`}>
                Connect talent and hiring teams with clarity and speed.
              </h1>

              <p className="max-w-2xl text-base leading-relaxed text-[#cfdaff] sm:text-lg">
                Build a home experience that feels premium and focused: richer profiles, faster recruiter decisions, and recommendation loops that keep momentum high.
              </p>

              <div className="flex flex-wrap gap-3 text-sm font-semibold">
                <Link
                  className="rounded-full bg-[#ffb300] px-6 py-3 text-[#081022] transition-transform duration-300 hover:-translate-y-0.5"
                  href="/register"
                >
                  Start as candidate
                </Link>
                <Link
                  className="rounded-full border border-white/35 bg-white/10 px-6 py-3 text-white transition-colors duration-300 hover:bg-white/20"
                  href="/recruiter"
                >
                  Open recruiter space
                </Link>
              </div>

              <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-wide text-[#9db2e5]">Profile setup</p>
                  <p className="mt-2 text-2xl font-bold text-white">8 min</p>
                </div>
                <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-wide text-[#9db2e5]">Recruiter review</p>
                  <p className="mt-2 text-2xl font-bold text-white">2.3h</p>
                </div>
                <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-wide text-[#9db2e5]">Offer momentum</p>
                  <p className="mt-2 text-2xl font-bold text-white">+27%</p>
                </div>
              </div>
            </div>

            <div className="nexus-reveal nexus-delay-1 flex items-end lg:justify-end">
              <div className="nexus-float w-full rounded-[2rem] border border-white/20 bg-[#0f224a]/60 p-6 shadow-[0_30px_80px_-35px_rgba(2,5,15,0.95)] backdrop-blur-md sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8bbe9]">Pipeline snapshot</p>
                <ul className="mt-6 space-y-4">
                  {milestones.map((item) => (
                    <li className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4" key={item.label}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-[#d8e3ff]">{item.label}</span>
                        <span className="text-sm font-bold text-white">{item.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#2d4272]">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#ffb300] to-[#ffd470]" style={{ width: item.width }} />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-[#ffd788]">{item.change} last 30 days</p>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 rounded-2xl border border-[#ffcc5f]/35 bg-[#ffb300]/14 p-4 text-white">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#ffe3a5]">Today</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#fff8e8]">
                    9 candidates moved from recommendation stage to recruiter review with complete profile context.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center px-4 py-16 sm:px-8 lg:px-12">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,14,32,1),rgba(9,22,49,1))]" />
        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <p className="nexus-reveal text-xs font-semibold uppercase tracking-[0.2em] text-[#9fb4e7]">Core Advantages</p>
          <h2 className={`${displayFont.className} nexus-reveal nexus-delay-1 mt-3 max-w-3xl text-4xl font-bold leading-[1] text-white sm:text-5xl`}>
            A front page that feels intentional, bold, and useful.
          </h2>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {featureCards.map((item, index) => (
              <article
                className={`nexus-reveal rounded-3xl border border-white/20 bg-gradient-to-br ${item.tone} p-6 shadow-[0_16px_45px_-32px_rgba(0,0,0,0.92)] transition-transform duration-300 hover:-translate-y-1 sm:p-7 ${
                  index === 1 ? "nexus-delay-1" : ""
                } ${index === 2 ? "nexus-delay-2" : ""}`}
                key={item.title}
              >
                <h2 className="text-xl font-semibold text-white">{item.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[#d8e2ff] sm:text-base">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center px-4 py-16 sm:px-8 lg:px-12">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(9,22,49,1),rgba(7,16,36,1))]" />
        <div className="relative z-10 mx-auto w-full max-w-6xl rounded-[2rem] border border-white/20 bg-[#0b1a3a]/80 p-6 sm:p-8">
          <div className="nexus-reveal mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9fb4e7]">Entry lanes</p>
              <h2 className={`${displayFont.className} mt-2 text-3xl font-bold text-white sm:text-4xl`}>
                One home page, three clear directions.
              </h2>
            </div>
            <Link className="rounded-full border border-white/35 px-5 py-2 text-sm font-semibold text-white" href="/login">
              Returning user sign in
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {entryLanes.map((lane, index) => (
              <Link
                className={`nexus-reveal rounded-3xl border border-white/20 bg-white/10 p-5 shadow-[0_14px_36px_-28px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:-translate-y-1 ${
                  index === 1 ? "nexus-delay-1" : ""
                } ${index === 2 ? "nexus-delay-2" : ""}`}
                href={lane.href}
                key={lane.href}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9fb4e7]">{lane.name}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{lane.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#d7e1ff]">{lane.description}</p>
                <p className="mt-4 text-sm font-semibold text-[#ffd67f]">Open lane</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center px-4 py-16 sm:px-8 lg:px-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(35,77,145,0.34),rgba(6,12,28,1)_60%)]" />
        <div className="nexus-reveal nexus-delay-2 relative z-10 mx-auto w-full max-w-6xl rounded-[2rem] border border-white/20 bg-[#081229]/88 px-6 py-10 text-white backdrop-blur-md sm:px-10 sm:py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9fb4e7]">Launch now</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h3 className={`${displayFont.className} text-3xl font-semibold sm:text-5xl`}>Ready to run cleaner hiring cycles?</h3>
              <p className="mt-3 max-w-2xl text-sm text-[#d3ddff] sm:text-base">
                Start from one polished front door and move from profile to offer with fewer clicks and higher confidence.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link className="rounded-full bg-[#ffb300] px-5 py-3 text-sm font-semibold text-[#081022]" href="/register">
                Create account
              </Link>
              <Link className="rounded-full border border-white/40 px-5 py-3 text-sm font-semibold text-white" href="/recruiter">
                Recruiter workspace
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
