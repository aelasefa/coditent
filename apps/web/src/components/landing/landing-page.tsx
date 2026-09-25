import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { HeroDemo, ScrollTextReveals, StorySteps } from "./landing-interactions";
import { SiteHeader } from "./site-header";
import styles from "./landing-page.module.css";

const CAPABILITIES = [
  { label: "Discover", detail: "Relevant jobs and internships" },
  { label: "Demonstrate", detail: "Practical skill evaluations" },
  { label: "Progress", detail: "A clear application journey" },
  { label: "Connect", detail: "Recruiter communication" },
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
    <div className={styles.landingRoot} data-landing-root>
      <ScrollTextReveals />
      <SiteHeader variant="home" />
      <main id="main" tabIndex={-1}>
        <section aria-labelledby="hero-title" className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>A clearer way forward</p>
              <h1 id="hero-title" className={styles.heroTitle}>
                Your career is more than a <em>CV.</em>
              </h1>
              <p className={styles.heroDescription}>
                Discover relevant jobs and internships, demonstrate your capabilities through practical
                evaluations, and connect with recruiters based on more than a CV.
              </p>
              <div className={styles.heroActions}>
                <Link href="/offers/all" className={styles.primaryButton}>
                  Find opportunities <span aria-hidden="true">↗</span>
                </Link>
                <Link href="#companies" className={styles.textButton}>
                  Explore hiring for companies <span aria-hidden="true">↗</span>
                </Link>
              </div>
              <p className={styles.heroFootnote}>Browse open roles before creating an account.</p>
            </div>
            <div className={styles.heroVisual}>
              <div className={styles.heroImage}>
                <Image
                  src="/images/landing/career-network-seamless.png"
                  alt="Professionals connected through a branching career network"
                  fill
                  priority
                  quality={95}
                  sizes="(max-width: 900px) 130vw, 64vw"
                  className={styles.heroArtwork}
                />
              </div>
              <HeroDemo />
            </div>
          </div>
        </section>

        <section aria-label="What Coditent helps you do" className={styles.capabilitySection}>
          <div className={styles.capabilityInner}>
            <p className={styles.capabilityIntro} data-scroll-reveal>
              One place to move from possibility to progress.
            </p>
            <ul className={styles.capabilityList}>
              {CAPABILITIES.map(({ label, detail }, index) => (
                <li key={label} data-scroll-reveal data-reveal-delay={(index % 4) + 1}>
                  <span className={styles.capabilityLabel}>{label}</span>
                  <span className={styles.capabilityDetail}>{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="story-title" className={styles.storySection}>
          <div className={styles.sectionShell}>
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow} data-scroll-reveal>For candidates</p>
              <h2 id="story-title" className={styles.sectionTitle} data-scroll-reveal data-reveal-delay="1">
                One profile. <em>A clear path to hired.</em>
              </h2>
              <p className={styles.sectionDescription} data-scroll-reveal data-reveal-delay="2">
                From discovering a role to speaking with a recruiter, each step has a purpose you can understand.
              </p>
            </div>
            <StorySteps />
          </div>
        </section>

        <section id="candidates" aria-labelledby="discovery-title" className={styles.discoverySection}>
          <div className={styles.discoveryInner}>
            <div className={styles.discoveryCopy}>
              <p className={styles.eyebrow} data-scroll-reveal>Job discovery</p>
              <h2 id="discovery-title" className={styles.sectionTitle} data-scroll-reveal data-reveal-delay="1">
                Find work that fits where you want to go.
              </h2>
              <p className={styles.sectionDescription} data-scroll-reveal data-reveal-delay="2">
                Explore open opportunities by field, region and role. When a position feels right, your profile,
                practical skills and application progress stay connected.
              </p>
              <Link href="/offers/all" className={styles.inlineLink} data-scroll-reveal data-reveal-delay="3">
                Browse all opportunities <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className={styles.discoveryImage}>
              <Image
                src="/images/landing/opportunity-horizon-seamless.png"
                alt="People following a winding path through a green landscape"
                fill
                quality={95}
                sizes="(max-width: 500px) 145vw, (max-width: 900px) 135vw, 74vw"
                className={styles.discoveryArtwork}
              />
            </div>
          </div>
        </section>

        <section id="companies" aria-labelledby="company-title" className={styles.companySection}>
          <div className={styles.companyPattern} aria-hidden="true" />
          <div className={styles.companyInner}>
            <div className={styles.companyLead}>
              <p className={styles.eyebrow} data-scroll-reveal>For companies</p>
              <h2 id="company-title" className={styles.companyTitle} data-scroll-reveal data-reveal-delay="1">
                Hire on demonstrated skill.
              </h2>
              <p className={styles.companyDescription} data-scroll-reveal data-reveal-delay="2">
                Publish roles, review candidates with match context, run practical assessments, and move people
                through a clear pipeline.
              </p>
              <Link href="/register" className={styles.lightButton} data-scroll-reveal data-reveal-delay="3">
                Start hiring <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className={styles.companyPanel}>
              <div className={styles.companyStars} aria-hidden="true">
                {Array.from({ length: 18 }, (_, index) => (
                  <span key={index} className={styles.companyStar} />
                ))}
              </div>
              <ol className={styles.companySteps}>
                {COMPANY_STEPS.map(([title, description], index) => (
                  <li key={title} data-scroll-reveal data-reveal-delay={(index % 3) + 1}>
                    <span className={styles.companyNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <strong>{title}</strong>
                      <span>{description}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section aria-labelledby="final-title" className={styles.finalSection}>
          <div className={styles.finalInner}>
            <div>
              <p className={styles.eyebrow} data-scroll-reveal>Begin here</p>
              <h2 id="final-title" className={styles.finalTitle} data-scroll-reveal data-reveal-delay="1">
                Your next step starts with an opportunity.
              </h2>
              <p data-scroll-reveal data-reveal-delay="2">
                Browse open roles. Create an account when you are ready to apply.
              </p>
              <div className={styles.finalActions} data-scroll-reveal data-reveal-delay="3">
                <Link href="/offers/all" className={styles.primaryButton}>
                  Browse opportunities <span aria-hidden="true">↗</span>
                </Link>
                <Link href="/login" className={styles.textButton}>Log in</Link>
              </div>
            </div>
            <div className={styles.finalImage}>
              <Image
                src="/images/landing/open-threshold-seamless.png"
                alt="Professionals meeting beneath a broad green arch"
                fill
                quality={95}
                sizes="(max-width: 500px) 120vw, (max-width: 900px) 110vw, 56vw"
                className={styles.finalArtwork}
              />
            </div>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/" aria-label="Coditent home"><Logo size="md" /></Link>
          <p>Careers built on more than a CV.</p>
          <nav aria-label="Footer">
            <Link href="/offers/all">Opportunities</Link>
            <Link href="/login">Log in</Link>
            <Link href="/register">Get started</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
