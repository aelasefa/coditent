"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import styles from "./hero-headline.module.css";

const REST_WORDS = ["career", "is", "more", "than", "a", "CV."];
const EDIT_START_MS = 950;
const LAND_START_MS = 1830;
const INK_START_MS = 2610;
const COMPLETE_MS = 3130;
const REFLOW_DURATION_MS = 660;

type HeadlinePhase = "initial" | "editing" | "landing" | "inking" | "complete";

export function HeroHeadline({ className, eyebrowClassName }: {
  className?: string;
  eyebrowClassName?: string;
}) {
  const [phase, setPhase] = useState<HeadlinePhase>("initial");
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const leadRef = useRef<HTMLSpanElement>(null);
  const landed = phase === "landing" || phase === "inking" || phase === "complete";
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const previousRects = useRef<DOMRect[]>([]);
  const reflowAnimations = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    if (!landed || previousRects.current.length === 0) return;

    reflowAnimations.current = wordRefs.current.flatMap((word, index) => {
      if (!word || !previousRects.current[index]) return [];

      const next = word.getBoundingClientRect();
      const previous = previousRects.current[index];
      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;

      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return [];

      return [
        word.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: "translate(0, 0)" },
          ],
          {
            duration: REFLOW_DURATION_MS,
            delay: index * 16,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          },
        ),
      ];
    });

    previousRects.current = [];
  }, [landed]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setPhase("complete");
      return;
    }

    const editTimer = window.setTimeout(() => {
      const eyebrow = eyebrowRef.current?.getBoundingClientRect();
      const lead = leadRef.current?.getBoundingClientRect();

      if (eyebrow && lead) {
        // Align the small replacement with the eyebrow, including responsive spacing.
        const startY = eyebrow.top + eyebrow.height / 2 - lead.top - lead.height / 2;
        leadRef.current?.style.setProperty("--proof-start-y", `${startY}px`);
      }
      setPhase("editing");
    }, EDIT_START_MS);

    const landTimer = window.setTimeout(() => {
      previousRects.current = wordRefs.current.flatMap((word) =>
        word ? [word.getBoundingClientRect()] : [],
      );
      flushSync(() => setPhase("landing"));
    }, LAND_START_MS);

    const inkTimer = window.setTimeout(() => {
      setPhase("inking");
    }, INK_START_MS);

    const completeTimer = window.setTimeout(() => {
      setPhase("complete");
    }, COMPLETE_MS);

    return () => {
      window.clearTimeout(editTimer);
      window.clearTimeout(landTimer);
      window.clearTimeout(inkTimer);
      window.clearTimeout(completeTimer);
      reflowAnimations.current.forEach((animation) => animation.cancel());
    };
  }, []);

  return (
    <>
      <p ref={eyebrowRef} className={eyebrowClassName} data-entrance-step="0">
        <span className={styles.eyebrowText} data-phase={phase}>A clearer way forward</span>
      </p>
      <h1
        id="hero-title"
        className={className}
        aria-label="Your career is more than a CV."
        data-entrance-step="1"
      >
        <span className={styles.visual} data-phase={phase} aria-hidden="true">
          <span className={styles.openingPhrase}>
            <span ref={leadRef} className={styles.leadStage}>
              <span className={styles.leadSizer}>{landed ? "Your" : "A"}</span>
              <span className={styles.initialLead}>
                <span className={styles.initialLetter}>A</span>
                <svg className={styles.strike} viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path className={styles.strikePath} pathLength="1" d="M 4 82 L 96 18" />
                </svg>
              </span>
              <span className={styles.proofLead}>Your</span>
              <span className={styles.finalLead}>Your</span>
            </span>{" "}
            {REST_WORDS.slice(0, 2).map((word, index) => (
              <Fragment key={word}>
                {index > 0 ? " " : null}
                <span
                  ref={(element) => {
                    wordRefs.current[index] = element;
                  }}
                  className={styles.restWord}
                >
                  {word}
                </span>
              </Fragment>
            ))}
          </span>{" "}
          {REST_WORDS.slice(2).map((word, index) => (
            <Fragment key={word}>
              {index > 0 ? " " : null}
              <span
                ref={(element) => {
                  wordRefs.current[index + 2] = element;
                }}
                className={styles.restWord}
              >
                {word === "CV." ? <em>{word}</em> : word}
              </span>
            </Fragment>
          ))}
        </span>
      </h1>
    </>
  );
}
