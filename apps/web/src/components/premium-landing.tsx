"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { getMe } from "@/lib/api";
import { removeToken } from "@/lib/auth";
import { categories } from "@/lib/categories";
import type { User } from "@/lib/types";
import CoditentLogo from "@/components/CoditentLogo";
import styles from "@/components/premium-landing.module.css";
import { LogoLoop } from "./ui/logo-loop";
import { SiReact, SiNextdotjs, SiTypescript, SiTailwindcss } from "react-icons/si";

type RoleCategory = "all" | "engineering" | "design" | "data" | "operations" | "success";

type Job = {
  title: string;
  company: string;
  city: string;
  mode: string;
  salary: string;
  category: Exclude<RoleCategory, "all">;
  description: string;
};

type Stat = {
  label: string;
  target: number;
  suffix: string;
  prefix?: string;
  trend: string;
  decimal?: boolean;
};

const activityItems = [
  {
    time: "À l'instant · Casablanca",
    text: "Amina — ENSA • Data Analyst profile reviewed by Recruiter",
    status: "LIVE",
  },
  {
    time: "18 min · Rabat",
    text: "Youssef published: Backend Engineer (HR closing today 18h)",
    status: "NEW",
  },
  {
    time: "1h · Tangier",
    text: "2 candidatures retenues pour Product Designer — Blue Dune",
    status: "",
  },
  {
    time: "Hier · Marrakech",
    text: "Mosaic Group — entretien planifié pour Customer Success",
    status: "",
  },
];

const stats: Stat[] = [
  { label: "PROFILES REVIEWED / WEEK", target: 84, suffix: "%", trend: "hand-checked, not auto-scored" },
  { label: "AVG. FIRST REPLY", target: 2.3, suffix: "h", trend: "Recruiters in Casablanca avg.", decimal: true },
  { label: "OFFERS WITH ASSESSMENT", target: 27, suffix: "%", prefix: "", trend: "practical test included" },
];

const jobs: Job[] = [
  {
    title: "Senior Frontend Engineer",
    company: "Atlas Systems",
    city: "Casablanca",
    mode: "Hybrid",
    salary: "28K-36K MAD",
    category: "engineering",
    description: "Own frontend architecture, design-system quality, and cross-team collaboration in a fast product environment.",
  },
  {
    title: "Product Designer",
    company: "Blue Dune",
    city: "Rabat",
    mode: "Remote",
    salary: "22K-30K MAD",
    category: "design",
    description: "Design trust-heavy onboarding and operations flows with strong systems thinking and product craft.",
  },
  {
    title: "Data Analyst",
    company: "Nomad Data",
    city: "Tangier",
    mode: "Hybrid",
    salary: "18K-25K MAD",
    category: "data",
    description: "Turn hiring and funnel metrics into executive-ready insight across dashboards and experimental analysis.",
  },
  {
    title: "Technical Recruiter",
    company: "Harbor SaaS",
    city: "Casablanca",
    mode: "On-site",
    salary: "16K-22K MAD",
    category: "operations",
    description: "Partner with hiring managers and improve process throughput with measurable service levels.",
  },
  {
    title: "Backend Engineer",
    company: "Northstar Labs",
    city: "Rabat",
    mode: "Hybrid",
    salary: "24K-34K MAD",
    category: "engineering",
    description: "Build APIs and ranking pipelines that power recruiter workflow speed and explainability.",
  },
  {
    title: "Customer Success Lead",
    company: "Mosaic Group",
    city: "Marrakech",
    mode: "On-site",
    salary: "18K-26K MAD",
    category: "success",
    description: "Lead onboarding quality and recruiter adoption while tracking measurable activation outcomes.",
  },
];

const processSteps = [
  "Create your profile (10 min)",
  "Recruiter posts a real offer",
  "You pick field + city",
  "Practical test, not keyword scan",
  "Human reviewer → shortlist",
  "Interview. No ghosting.",
  "Hired. Contract signed.",
];

export default function PremiumLanding() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [activityIndex, setActivityIndex] = useState(0);
  const [activeCapability, setActiveCapability] = useState(0);
  const [activeRoleFilter, setActiveRoleFilter] = useState<RoleCategory>("all");
  const [openJob, setOpenJob] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState(0);
  const [statsStarted, setStatsStarted] = useState(false);
  const [statValues, setStatValues] = useState([0, 0, 0]);
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const filteredJobs = useMemo(
    () => jobs.map((job) => activeRoleFilter === "all" || job.category === activeRoleFilter),
    [activeRoleFilter]
  );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActivityIndex((prev) => (prev + 1) % activityItems.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let isMounted = true;

    getMe()
      .then((data) => {
        if (isMounted) {
          setUser(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current || !(event.target instanceof Node)) {
        return;
      }
      if (!menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    const reveals = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18 }
    );

    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = document.getElementById("stats-zone");
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || statsStarted) return;
        setStatsStarted(true);
      },
      { threshold: 0.4 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [statsStarted]);

  const initials = useMemo(() => {
    const fullName = user?.full_name?.trim();
    if (!fullName) {
      return "U";
    }

    const parts = fullName.split(/\s+/).filter(Boolean);
    const first = parts[0]?.charAt(0) ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) : "";
    return `${first}${last}`.toUpperCase();
  }, [user?.full_name]);

  const userRole = (user?.role ?? "") as string;

  const displayName = useMemo(() => {
    const value = user?.full_name?.trim() || "User";
    return value.length > 14 ? `${value.slice(0, 14)}...` : value;
  }, [user?.full_name]);

  const roleLabel = useMemo(() => {
    if (userRole === "RECRUITER") {
      return "Recruiter";
    }

    if (userRole === "ADMIN") {
      return "Admin";
    }

    return "Candidate";
  }, [userRole]);

  const roleClass = useMemo(() => {
    if (userRole === "RECRUITER") {
      return styles.roleRecruiter;
    }

    if (userRole === "ADMIN") {
      return styles.roleAdmin;
    }

    return styles.roleCandidate;
  }, [userRole]);

  function signOut() {
    removeToken();
    window.location.href = "/login";
  }

  useEffect(() => {
    if (!statsStarted) return;

    const duration = 1200;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setStatValues(stats.map((item) => item.target * p));
      if (p < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [statsStarted]);

  return (
    <div className={styles.pageShell}>
      <div className={styles.heroMesh} aria-hidden />
      <div className={styles.ambientGlow} aria-hidden />
      <div className={styles.ambientGlowTwo} aria-hidden />

      <header className={`${styles.nav} ${styles.contentLayer} ${scrolled ? styles.navScrolled : ""}`}>
        <div className={styles.container}>
          <div className={styles.navInner}>
            <div className={styles.brand}>
              <button
                className={styles.logoBtn}
                onClick={() => window.location.reload()}
                type="button"
                aria-label="Refresh page"
                title="Click to refresh"
              >
                <CoditentLogo
                  size={36}
                  useSvg={false}
                  className={styles.logoMark}
                />
              </button>
              <span className={styles.livePill}><span className={styles.liveDot} />LIVE</span>
            </div>

            <nav className={styles.navLinks} aria-label="Main">
              <a href="#pathways" className={styles.navLink}>Candidate</a>
              <a href="#pathways" className={styles.navLink}>Recruiter</a>
              <a href="#roles" className={styles.navLink}>Recommendations</a>
            </nav>

            {user ? (
              <div className={styles.profileMenu} ref={menuRef}>
                <button
                  className={styles.profileTrigger}
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  aria-expanded={menuOpen}
                >
                  {(user as User & { avatar_url?: string | null }).avatar_url ? (
                    <img
                      alt={displayName}
                      className={styles.profileAvatarImage}
                      src={(user as User & { avatar_url?: string | null }).avatar_url as string}
                    />
                  ) : (
                    <span className={styles.profileAvatarInitials}>{initials}</span>
                  )}
                  <span className={styles.profileName}>{displayName}</span>
                  <span className={`${styles.roleBadge} ${roleClass}`}>{roleLabel}</span>
                  <span className={`${styles.chevron} ${menuOpen ? styles.chevronOpen : ""}`}>▾</span>
                </button>

                {menuOpen ? (
                  <div className={styles.menuDropdown}>
                    <Link className={styles.menuItem} href="/profile" onClick={() => setMenuOpen(false)}>
                      My Profile
                    </Link>
                    <Link className={styles.menuItem} href="/dashboard" onClick={() => setMenuOpen(false)}>
                      Dashboard
                    </Link>
                    <Link className={styles.menuItem} href="/settings" onClick={() => setMenuOpen(false)}>
                      Settings
                    </Link>
                    <div className={styles.menuDivider} />
                    <button className={`${styles.menuItem} ${styles.menuSignOut}`} type="button" onClick={signOut}>
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={styles.actions}>
                <Link className={`${styles.btn} ${styles.btnGhost}`} href="/login">Login</Link>
                <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/register">Register</Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={styles.contentLayer}>
        <section className={styles.hero}>
          <div className={styles.heroBackdrop} aria-hidden>
            <span className={styles.heroRing} />
            <span className={styles.heroRingAlt} />
          </div>
          <div className={styles.heroCenterWrap}>
            <span className={`${styles.heroLabel} ${styles.loadItem} ${styles.delay0}`}>— Built in Casablanca · Since 2024</span>
            <h1 className={`${styles.heroTitle} ${styles.loadItem} ${styles.delay1}`}>
              <span>Hiring in Morocco,</span>
              <span>
                without the <span className={styles.gradientWord}>busywork.</span>
              </span>
              <span className={styles.heroTitleNote}>One workspace. Real people, not just CVs.</span>
            </h1>
            <p className={`${styles.heroSubtext} ${styles.loadItem} ${styles.delay2}`}>
              Coditent is where <em>candidates</em> build a single, honest profile and <em>recruiters</em> publish, screen and assess — without spreadsheets, scattered DMs, or AI hype. Designed with 3 teams in Rabat and Casablanca.
            </p>
            <div className={`${styles.heroCtas} ${styles.heroCtasCentered} ${styles.loadItem} ${styles.delay3}`}>
              <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/register">Create your profile — free</Link>
              <Link className={`${styles.btn} ${styles.btnGhost}`} href="/offers/all">See live offers</Link>
            </div>

            <p className={styles.socialProofLine}>
              <span className={styles.socialProofAvatars} aria-hidden>●●○</span>
              200+ offers posted · 40+ hiring teams · Reply avg. 2.3h (not a vanity metric)
            </p>

            <div className={`${styles.featurePills} ${styles.featurePillsCentered}`}>
              {[
                "No AI screening theatre",
                "Practical tests > keywords",
                "Human review first",
              ].map((pill) => (
                <span key={pill} className={styles.pill}>{pill}</span>
              ))}
            </div>
            <p className={styles.heroFootnote}>Built for Morocco’s hiring reality — French, Arabic, and Darija-friendly fields. No US-centric templates.</p>
          </div>

          <div className={`${styles.panelGrid} ${styles.heroPanelGrid} ${styles.reveal}`} data-reveal>
              <article className={`${styles.glassPanel}`} id="stats-zone">
                <div className={styles.panelTop}>
                  <h2 className={styles.panelTitle}>Pipeline Snapshot</h2>
                </div>
                <div className={`${styles.statList} ${styles.statListThreeCol}`}>
                  {stats.map((stat, index) => (
                    <div className={`${styles.statItem} ${styles.statCard}`} key={stat.label}>
                      <div className={styles.statTopRow}>
                        <div className={styles.statIcon} aria-hidden>{index === 0 ? "◉" : index === 1 ? "◷" : "↗"}</div>
                        <span className={`${styles.trendBadge} ${index === 0 ? styles.trendSuccess : index === 1 ? styles.trendInfo : styles.trendViolet}`}>{stat.trend}</span>
                      </div>
                      <div>
                        <div className={styles.statValueLarge}>
                          {(stat.prefix ?? "") + (stat.decimal ? statValues[index].toFixed(1) : Math.round(statValues[index]).toString()) + stat.suffix}
                        </div>
                        <span className={styles.statLabel}>{stat.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className={`${styles.glassPanel} ${styles.activityPanel}`}>
                <div className={styles.panelTop}>
                  <h2 className={styles.panelTitle}>Live Activity</h2>
                  <span className={styles.onlineBadge}>● SYSTEM ONLINE</span>
                </div>
                <div className={styles.activityWrap}>
                  {activityItems.map((item, index) => (
                    <div key={item.time + item.text} className={`${styles.activityItem} ${index === activityIndex ? styles.activityActive : ""}`}>
                      <p className={styles.activityText}>• {item.text}</p>
                      <div className={styles.activityMetaRow}>
                        <div className={styles.activityTime}>{item.time}</div>
                        {item.status ? <span className={styles.activityStatus}>{item.status}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
          </div>
        </section>

        <hr className={styles.sectionLine} />

        <section className={`${styles.section} ${styles.reveal}`} id="capabilities" data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Why it feels different — notes from the team</p>
              <h2 className={styles.titleLg}>We built Coditent like we hire: carefully, in Casablanca cafés.</h2>
              <p className={styles.sectionSub}>No 200-feature bloat. Just the workflow we wished we had when hiring 40 engineers in 2023 — whiteboard, mint tea, and a lot of “what actually slows us down?”</p>
            </div>
            <div className={styles.capList}>
              {[
                {
                  impact: "— From Amina, lead designer",
                  title: "Profiles that read like a person, not a PDF dump",
                  description: "Headline, 3 skills that matter, one practical test. Recruiters told us: “Give me 30 seconds to decide.”",
                  chips: [
                    "Skills you claim → we test with a 20-min practical. No keyword stuffing.",
                    "Bio is optional, but a good bio still gets you 2× callbacks — we measured it.",
                  ],
                },
                {
                  impact: "— From Youssef, hiring manager",
                  title: "Recruiters move fast because context stays in one place",
                  description: "No more Notion + Drive + WhatsApp threads. Offer, applicants, assessment, decision — same page.",
                  chips: [
                    "Publish in one form. Shortlist with one click. Every action is audited.",
                    "OWNER/RECRUITER/HR roles are real permissions, not just labels.",
                  ],
                },
                {
                  impact: "— From the data (not the hype)",
                  title: "Recommendations you can actually explain to a candidate",
                  description: "Not “AI magic”. Field + city + type → scored, ranked, and you see why.",
                  chips: [
                    "Every score has a sentence: why this offer, why this rank. Candidates deserve it.",
                    "Built for Morocco: Casablanca, Rabat, Tangier, etc. — not SF templates.",
                  ],
                },
              ].map((item, index) => {
                const active = activeCapability === index;
                return (
                  <article key={item.title} className={`${styles.capRow} ${active ? styles.capActive : ""}`}>
                    <button
                      className={styles.capHead}
                      onClick={() => setActiveCapability(index)}
                      aria-expanded={active}
                      aria-controls={`cap-${index}`}
                    >
                      <span className={styles.capNum}>{String(index + 1).padStart(2, "0")}</span>
                      <span>
                        <span className={styles.capImpact}>{item.impact}</span>
                        <span className={styles.capName}>{item.title}</span>
                        <span className={styles.capDesc}>{item.description}</span>
                      </span>
                      <span className={styles.arrow} aria-hidden>
                        &gt;
                      </span>
                    </button>
                    <div id={`cap-${index}`} className={styles.capDetail}>
                      <div className={styles.capGrid}>
                        {item.chips.map((chip) => (
                          <div className={styles.capChip} key={chip}>{chip}</div>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <hr className={styles.sectionLine} />

        <section className={`${styles.section} ${styles.reveal}`} id="pathways" data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <div className={styles.rowHead}>
                <p className={styles.eyebrow}>ENTRY PATHWAYS</p>
                <span className={styles.pill}>RETURNING USERS</span>
              </div>
              <h2 className={styles.titleLg}>Choose your lane and keep momentum.</h2>
            </div>

            <div className={styles.pathGrid}>
              {[
                ["For candidates — you", "One profile, no copy-paste hell", "Build once. We keep it honest: headline, 3 real skills, one practical test. Recruiters actually read it.", "/dashboard/profile", "Create your profile →"],
                ["For recruiters — you", "Your pipeline, finally readable", "Publish an offer in 2 minutes. See applicants, test scores, and decisions on one page. No spreadsheet.", "/recruiter/offers/new", "Publish an offer →"],
                ["For the curious", "See how matching really works", "Pick your field + city, get scored offers with a why-sentence. No black box.", "/dashboard/recommendations", "Try recommendations →"],
              ].map(([label, title, copy, href, cta]) => (
                <article className={`${styles.glassPanel} ${styles.pathCard}`} key={title}>
                  <div>
                    <p className={styles.eyebrow}>{label}</p>
                    <h3 className={styles.pathTitle}>{title}</h3>
                    <p className={styles.pathCopy}>{copy}</p>
                    <p className={styles.pathMeta}>Takes ~2 min. No credit card. We’re not a job board from 2010.</p>
                  </div>
                  <Link href={href} className={styles.pathLink}>{cta}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <hr className={styles.sectionLine} />

        <section className={`${styles.section} ${styles.reveal}`} id="companies" data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>COMPANIES HIRING NOW</p>
              <h2 className={styles.titleLg}>Discover active teams and their hiring context.</h2>
            </div>
            <div className={styles.companyList}>
              {[
                ["Atlas Systems", "Enterprise SaaS", "Casablanca", "Scaling product and platform teams to accelerate B2B hiring workflows across the region.", ["Frontend", "Backend", "Product"], "12 OPENINGS"],
                ["Northstar Labs", "AI Products", "Rabat", "Building AI-first candidate discovery tools and recommendation pipelines with explainable signals.", ["ML", "Data", "QA"], "9 OPENINGS"],
                ["Blue Dune", "Fintech", "Tangier", "Hiring product designers and engineers to improve high-trust onboarding and operations flows.", ["Design", "Mobile", "Operations"], "6 OPENINGS"],
                ["Mosaic Group", "Logistics Tech", "Marrakech", "Expanding platform engineering and customer success squads for high-volume recruiter operations.", ["Platform", "Success", "Analytics"], "14 OPENINGS"],
                ["Harbor SaaS", "HR Automation", "Agadir", "Growing teams that improve recruiter decision velocity and candidate lifecycle quality.", ["Recruiting", "Sales", "Support"], "7 OPENINGS"],
                ["Nomad Data", "Data Infrastructure", "Casablanca", "Hiring data engineers and analysts to turn job-market and funnel metrics into action.", ["Data Eng", "BI", "Infra"], "10 OPENINGS"],
              ].map(([name, sector, city, description, tags, openings]) => (
                <article className={styles.companyRow} key={String(name)}>
                  <div>
                    <div className={styles.companyName}>{name}</div>
                    <div className={styles.companyMeta}>{sector} · {city}</div>
                  </div>
                  <div>
                    <p className={styles.companyDesc}>{description}</p>
                    <div className={styles.companyTags}>
                      {(tags as string[]).map((tag) => (
                        <span key={tag} className={styles.pill}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <span className={`${styles.pill} ${styles.openingBadge}`}>{openings}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <hr className={styles.sectionLine} />

        <section className={styles.categorySection}>
          <div className={styles.container}>
            <div style={{ height: '200px', position: 'relative', overflow: 'hidden', padding: '40px 0' }}>
              <LogoLoop
                logos={[
                  { node: <div className="flex items-center justify-center w-20 h-20 bg-purple-900/20 border border-purple-500/30 rounded-2xl text-purple-300 shadow-[0_0_20px_rgba(124,58,237,0.15)]"><SiReact size={40} /></div>, title: "React", href: "https://react.dev" },
                  { node: <div className="flex items-center justify-center w-20 h-20 bg-purple-900/20 border border-purple-500/30 rounded-2xl text-purple-300 shadow-[0_0_20px_rgba(124,58,237,0.15)]"><SiNextdotjs size={40} /></div>, title: "Next.js", href: "https://nextjs.org" },
                  { node: <div className="flex items-center justify-center w-20 h-20 bg-purple-900/20 border border-purple-500/30 rounded-2xl text-purple-300 shadow-[0_0_20px_rgba(124,58,237,0.15)]"><SiTypescript size={40} /></div>, title: "TypeScript", href: "https://www.typescriptlang.org" },
                  { node: <div className="flex items-center justify-center w-20 h-20 bg-purple-900/20 border border-purple-500/30 rounded-2xl text-purple-300 shadow-[0_0_20px_rgba(124,58,237,0.15)]"><SiTailwindcss size={40} /></div>, title: "Tailwind CSS", href: "https://tailwindcss.com" }
                ]}
                speed={100}
                direction="left"
                logoHeight={80}
                gap={50}
                hoverSpeed={0}
                scaleOnHover
                fadeOut
                fadeOutColor="#0d0b1a"
                ariaLabel="Technology partners"
              />
            </div>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>EXPLORE BY CATEGORY</p>
              <h2 className={styles.categoryTitle}>
                Find your next role in{' '}
                <span className={styles.underlineWord}>any field.</span>
              </h2>
            </div>
            <div className={styles.categoryGrid}>
              {categories.map((cat, index) => (
                <button
                  key={cat.label}
                  className={styles.categoryCard}
                  style={{ animationDelay: `${index * 60}ms` }}
                  onClick={() => router.push(`/offers/${cat.slug}`)}
                  type="button"
                >
                  <span
                    className={styles.categoryEmoji}
                    style={{ background: cat.bg }}
                  >
                    <span className={styles.categoryEmojiShine} />
                    {cat.emoji}
                  </span>
                  <div className={styles.categoryText}>
                    <span className={styles.categoryLabel}>{cat.label}</span>
                    <span className={styles.categoryDesc}>{cat.desc}</span>
                  </div>
                  <span className={styles.categoryArrow}>↗</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <hr className={styles.sectionLine} />

        <section className={`${styles.section} ${styles.reveal}`} id="roles" data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>ROLE STREAM</p>
              <h2 className={styles.titleLg}>High-signal opportunities this week.</h2>
            </div>

            <div className={styles.tabs} role="tablist" aria-label="Role filters">
              {(["all", "engineering", "design", "data", "operations", "success"] as RoleCategory[]).map((item) => (
                <button
                  key={item}
                  className={`${styles.tab} ${activeRoleFilter === item ? styles.tabActive : ""}`}
                  onClick={() => setActiveRoleFilter(item)}
                  role="tab"
                  aria-selected={activeRoleFilter === item}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className={styles.jobs}>
              {jobs.map((job, index) => {
                const visible = filteredJobs[index];
                const isOpen = openJob === index;
                return (
                  <article key={job.title} className={`${styles.jobItem} ${!visible ? styles.jobHidden : ""} ${isOpen ? styles.jobOpen : ""}`}>
                    <button className={styles.jobHead} onClick={() => setOpenJob(isOpen ? null : index)} aria-expanded={isOpen}>
                      <span>
                        <span className={styles.jobTitle}>{job.title}</span>
                        <span className={styles.jobMeta}>{job.company} · {job.city} · {job.mode}</span>
                      </span>
                      <span className={styles.salaryPill}>{job.salary}</span>
                    </button>
                    <div className={styles.jobDetail}>
                      <div className={styles.jobDetailInner}>
                        <p className={styles.jobCopy}>{job.description}</p>
                        <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/register">Apply now</Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <hr className={styles.sectionLine} />

        <section className={`${styles.section} ${styles.reveal}`} id="process" data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>PROCESS</p>
              <h2 className={styles.titleLg}>Seven steps from profile to placement.</h2>
            </div>
            <div className={styles.processWrap}>
              <div className={`${styles.processLine} ${styles.processLineAnimate}`} />
              <ol className={styles.steps}>
                {processSteps.map((step, index) => (
                  <li key={step} className={`${styles.step} ${styles.stepVisible} ${styles[`stepDelay${index + 1}`]}`}>
                    <span className={styles.stepDot}>{index + 1}</span>
                    <div>
                      <h3 className={styles.stepTitle}>{step}</h3>
                      <p className={styles.stepDesc}>Coditent keeps this phase clear, fast, and measurable.</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <hr className={styles.sectionLine} />

        <section className={`${styles.section} ${styles.reveal}`} id="faq" data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>FAQ</p>
              <h2 className={styles.titleLg}>Everything you need before you start.</h2>
            </div>
            <div className={styles.faqList}>
              {[
                "Do you sell my data to recruiters? (No. Never.)",
                "What if I’m a junior with no experience — still welcome?",
                "Can a small team (5 people) use Coditent, or is it enterprise-only?",
                "Why not just use LinkedIn / Indeed like everyone else?",
              ].map((question, index) => {
                const open = openFaq === index;
                return (
                  <article className={`${styles.faqItem} ${open ? styles.faqOpen : ""}`} key={question}>
                    <button className={styles.faqBtn} onClick={() => setOpenFaq(open ? -1 : index)} aria-expanded={open}>
                      <span className={styles.faqQ}>{question}</span>
                      <span className={styles.faqIcon}>+</span>
                    </button>
                    <div className={styles.faqPanel}>
                      <p className={styles.faqA}>
                        {index === 0 && "Never. Your profile is only visible to recruiters you apply to. We don’t sell, we don’t spam. Built because we hated that, too."}
                        {index === 1 && "Absolutely — set 0 years, add your school and 3 skills you’re proud of. Recruiters here look for potential, not just 10 years of experience."}
                        {index === 2 && "Perfect fit. Coditent was built for a 12-person startup hiring its first 5 engineers. OWNER/RECRUITER/HR roles work at any size."}
                        {index === 3 && "You can — but Coditent keeps your hiring in one place: profile, offers, tests, interviews. No context spread across 4 tools."}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className={`${styles.footer} ${styles.section} ${styles.contentLayer}`}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}>
              <div className={styles.brand}>
                <span className={styles.brandMark}>C</span>
                <span className={styles.brandWord}>Coditent</span>
              </div>
              <p className={styles.eyebrow}>TALENT WORKFLOW OS</p>
              <p className={styles.footerCopy}>Connect candidates and recruiters in one expressive workspace.</p>
              <div className={styles.footerSocials}>
                <a
                  href="https://www.coditent.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.footerSocialLink}
                >
                  🌐 coditent.com
                </a>
              </div>
            </div>
            <div>
              <h3 className={styles.footerTitle}>Product</h3>
              <ul className={styles.footerList}>
                <li>
                  <Link href="/dashboard" className={styles.footerLink}>
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard/recommendations" className={styles.footerLink}>
                    Recommendations
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard/profile" className={styles.footerLink}>
                    Profile Builder
                  </Link>
                </li>
                <li>
                  <Link href="/offers/all" className={styles.footerLink}>
                    Browse Offers
                  </Link>
                </li>
                <li>
                  <Link href="/recruiter/offers/new" className={styles.footerLink}>
                    Recruiter Hub
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className={styles.footerTitle}>For Candidates</h3>
              <ul className={styles.footerList}>
                <li>
                  <Link href="/dashboard/profile" className={styles.footerLink}>
                    Create Profile
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard/recommendations" className={styles.footerLink}>
                    My Recommendations
                  </Link>
                </li>
                <li>
                  <span className={styles.footerLinkDisabled}>
                    Track Momentum
                    <span className={styles.comingSoon}>Soon</span>
                  </span>
                </li>
                <li>
                  <span className={styles.footerLinkDisabled}>
                    Skill Positioning
                    <span className={styles.comingSoon}>Soon</span>
                  </span>
                </li>
                <li>
                  <span className={styles.footerLinkDisabled}>
                    Interview Prep
                    <span className={styles.comingSoon}>Soon</span>
                  </span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className={styles.footerTitle}>For Recruiters</h3>
              <ul className={styles.footerList}>
                <li>
                  <Link href="/recruiter/offers/new" className={styles.footerLink}>
                    Publish Offers
                  </Link>
                </li>
                <li>
                  <Link href="/recruiter" className={styles.footerLink}>
                    Recruiter Dashboard
                  </Link>
                </li>
                <li>
                  <span className={styles.footerLinkDisabled}>
                    Pipeline Speed
                    <span className={styles.comingSoon}>Soon</span>
                  </span>
                </li>
                <li>
                  <span className={styles.footerLinkDisabled}>
                    Candidate Review
                    <span className={styles.comingSoon}>Soon</span>
                  </span>
                </li>
                <li>
                  <span className={styles.footerLinkDisabled}>
                    Hiring Insights
                    <span className={styles.comingSoon}>Soon</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
          <div className={styles.footerMeta}>
            <span>© 2026 Coditent — crafted with mint tea in Casablanca. Not generated, just built.</span>
            <div className={styles.footerMetaRight}>
              <Link href="/privacy" className={styles.footerLink}>Privacy</Link>
              <Link href="/terms" className={styles.footerLink}>Terms</Link>
              <span className={styles.footerMetaDot}>•</span>
              <span>EN / FR / عربية — Morocco-first</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
