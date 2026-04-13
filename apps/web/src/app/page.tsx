import Link from "next/link";
import { Sora, Syne } from "next/font/google";
import LiquidEtherHero from "@/components/liquid-ether-hero";

const uiFont = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const displayFont = Syne({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const highlightCards = [
  {
    title: "Candidate-first profile builder",
    text: "Guide applicants through experience, goals, and preferred roles with structured fields that stay recruiter-friendly.",
  },
  {
    title: "Recruiter workflow speed",
    text: "Review submissions quickly, create offers faster, and focus attention on high-fit candidates instead of admin work.",
  },
  {
    title: "AI-backed recommendations",
    text: "Translate profile signals into actionable suggestions so both sides move from discovery to offer with less friction.",
  },
];

const steps = [
  "Candidate creates an expressive profile",
  "Recruiter evaluates and launches offers",
  "Recommendations keep matching momentum high",
];

export default function Home() {
  return (
    <main className={`${uiFont.className} min-h-screen bg-[#f5eee5] text-[#1f2330]`}>
      <section className="relative isolate overflow-hidden px-4 pb-16 pt-10 sm:px-8 lg:px-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),rgba(245,238,229,0.22)_45%,rgba(245,238,229,0.95)_78%)]" />

        <div className="absolute inset-x-0 top-0 z-0 h-[620px] opacity-95">
          <LiquidEtherHero />
        </div>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl content-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="home-reveal space-y-8">
            <p className="inline-flex items-center rounded-full border border-[#1f2330]/20 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#29334a] backdrop-blur-sm">
              Coditent Talent Platform
            </p>

            <h1
              className={`${displayFont.className} max-w-xl text-5xl font-bold leading-[0.95] text-[#1f2330] sm:text-6xl lg:text-7xl`}
            >
              Hiring that feels precise, human, and fast.
            </h1>

            <p className="max-w-2xl text-base leading-relaxed text-[#36415d] sm:text-lg">
              A cleaner candidate to recruiter journey with strong profiles, guided decisions, and recommendation loops that keep the pipeline alive.
            </p>

            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              <Link
                className="rounded-full bg-[#1f2330] px-6 py-3 text-white transition-transform duration-300 hover:-translate-y-0.5"
                href="/register"
              >
                Create account
              </Link>
              <Link
                className="rounded-full border border-[#1f2330]/30 bg-white/70 px-6 py-3 text-[#1f2330] transition-colors duration-300 hover:bg-white"
                href="/login"
              >
                Sign in
              </Link>
              <Link
                className="rounded-full border border-[#1f2330]/20 px-6 py-3 text-[#1f2330] transition-colors duration-300 hover:bg-white/60"
                href="/recruiter"
              >
                Recruiter area
              </Link>
            </div>
          </div>

          <div className="home-reveal home-delay-1 flex items-end lg:justify-end">
            <div className="home-orb w-full rounded-3xl border border-white/70 bg-white/60 p-6 shadow-[0_24px_90px_-40px_rgba(28,32,46,0.85)] backdrop-blur-md sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3c4560]">Live workflow</p>
              <ul className="mt-5 space-y-4">
                {steps.map((step, index) => (
                  <li
                    className="rounded-2xl border border-[#1f2330]/12 bg-white/70 px-4 py-3 text-sm font-medium text-[#20273a]"
                    key={step}
                  >
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1f2330] text-xs text-white">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-8 lg:px-12">
        <div className="mx-auto grid w-full max-w-6xl gap-4 md:grid-cols-3">
          {highlightCards.map((item, index) => (
            <article
              className={`home-reveal rounded-3xl border border-[#1f2330]/12 bg-[#fffaf3] p-6 shadow-[0_16px_40px_-32px_rgba(29,34,53,0.9)] ${
                index === 1 ? "home-delay-1" : ""
              } ${index === 2 ? "home-delay-2" : ""}`}
              key={item.title}
            >
              <h2 className="text-lg font-semibold text-[#1d2438]">{item.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#46506c]">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-8 lg:px-12">
        <div className="home-reveal home-delay-2 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#1f2330]/12 bg-[#1f2330] px-6 py-8 text-white sm:px-8">
          <div>
            <h3 className="text-2xl font-semibold sm:text-3xl">Ready to launch the new home flow?</h3>
            <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">
              Start as a candidate, continue as a recruiter, and test the recommendation journey from one unified front door.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#1f2330]" href="/profile">
              Candidate profile
            </Link>
            <Link
              className="rounded-full border border-white/40 px-5 py-3 text-sm font-semibold text-white"
              href="/dashboard/recommendations"
            >
              Recommendations
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
