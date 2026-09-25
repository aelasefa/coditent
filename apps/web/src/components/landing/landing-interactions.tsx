"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./landing-page.module.css";

const HERO_STATES = [
  { label: "Discover", title: "Relevant opportunities", detail: "Roles aligned to your field and goals." },
  { label: "Demonstrate", title: "Practical evaluations", detail: "Show how you work beyond the CV." },
  { label: "Progress", title: "A clear next step", detail: "Follow each stage of your application." },
];

const STORY_STEPS = [
  { title: "Build your profile", description: "Summarize experience, skills and goals in one place.", preview: "Your experience, in one place" },
  { title: "Discover relevant opportunities", description: "Get openings tailored to your field and preferences.", preview: "Opportunities worth exploring" },
  { title: "Prove your skills", description: "Complete practical assessments tied to real hiring processes.", preview: "Your work can speak for itself" },
  { title: "Get evaluated", description: "Recruiters review demonstrated ability alongside your profile.", preview: "A fuller view of your ability" },
  { title: "Connect with recruiters", description: "Communication opens as your application advances.", preview: "A conversation at the right stage" },
];

export function HeroDemo() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const sync = () => {
      stop();
      if (visible && !reduced.matches && !document.hidden) {
        timer = window.setInterval(() => setActive((current) => (current + 1) % HERO_STATES.length), 4200);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }, { threshold: 0.25 });
    observer.observe(element);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      observer.disconnect();
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div ref={ref} className={styles.heroDemo} aria-hidden="true">
      <div className={styles.demoTopline}>
        <span>YOUR PATH</span>
        <span>0{active + 1} / 03</span>
      </div>
      <div key={active} className={styles.demoContent}>
        <span className={styles.demoLabel}>{HERO_STATES[active].label}</span>
        <strong>{HERO_STATES[active].title}</strong>
        <p>{HERO_STATES[active].detail}</p>
      </div>
      <div className={styles.demoProgress}>
        {HERO_STATES.map((state, index) => (
          <span key={state.label} className={index === active ? styles.demoProgressActive : undefined} />
        ))}
      </div>
    </div>
  );
}

export function ScrollTextReveals() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing-root]");
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-scroll-reveal]"));
    root.dataset.revealReady = "true";

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.revealed = "true";
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 }
    );

    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      delete root.dataset.revealReady;
    };
  }, []);

  return null;
}

export function StorySteps() {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (!visible.length) return;
        const nearest = visible.sort(
          (a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top)
        )[0];
        setActive(Number((nearest.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-32% 0px -42% 0px", threshold: 0 }
    );
    items.current.forEach((item) => item && observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.storyGrid}>
      <div className={styles.storyVisual} aria-hidden="true">
        <div className={styles.storyVisualTop}>
          <span>CODITENT / CANDIDATE JOURNEY</span>
          <span>0{active + 1} / 05</span>
        </div>
        <div key={active} className={styles.storyVisualContent}>
          <span className={styles.storyVisualMarker}>0{active + 1}</span>
          <p>{STORY_STEPS[active].preview}</p>
          <div className={styles.storyMockup}>
            <span className={styles.storyMockupAvatar}>C</span>
            <span className={styles.storyMockupLines}>
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
        <div className={styles.storyVisualTrack}>
          {STORY_STEPS.map((step, index) => (
            <span key={step.title} className={index <= active ? styles.storyVisualTrackActive : undefined} />
          ))}
        </div>
      </div>
      <div className={styles.storyContent}>
        <ol className={styles.storyList}>
          {STORY_STEPS.map((step, index) => (
            <li
              key={step.title}
              ref={(node) => { items.current[index] = node; }}
              data-step={index}
              className={active === index ? styles.storyStepActive : undefined}
            >
              <span className={styles.storyNumber}>0{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/register" className={styles.inlineLink}>
          Create candidate account <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </div>
  );
}
