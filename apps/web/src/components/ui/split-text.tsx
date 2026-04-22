"use client";

import { useEffect, useMemo, useRef, type ElementType } from "react";

import { cn } from "@/lib/cn";

type SplitTextProps = {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  ease?: string;
  splitType?: "chars" | "words" | "lines" | string;
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
  threshold?: number;
  rootMargin?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  tag?: ElementType;
  onLetterAnimationComplete?: () => void;
};

function getStart(threshold: number, rootMargin: string): string {
  const startPct = (1 - threshold) * 100;
  const marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin);
  const marginValue = marginMatch ? Number.parseFloat(marginMatch[1]) : 0;
  const marginUnit = marginMatch ? marginMatch[2] || "px" : "px";
  const sign =
    marginValue === 0
      ? ""
      : marginValue < 0
        ? `-=${Math.abs(marginValue)}${marginUnit}`
        : `+=${marginValue}${marginUnit}`;

  return `top ${startPct}%${sign}`;
}

export default function SplitText({
  text,
  className = "",
  delay = 50,
  duration = 1.25,
  ease = "power3.out",
  splitType = "chars",
  from = { opacity: 0, y: 40 },
  to = { opacity: 1, y: 0 },
  threshold = 0.1,
  rootMargin = "-100px",
  textAlign = "center",
  tag = "p",
  onLetterAnimationComplete,
}: SplitTextProps) {
  const ref = useRef<HTMLElement | null>(null);

  const setRef = (node: Element | null) => {
    ref.current = node as HTMLElement | null;
  };

  const segments = useMemo(() => {
    if (splitType.includes("words") && !splitType.includes("chars")) {
      return text.split(/(\s+)/).map((part, index) =>
        part.trim().length === 0 ? (
          <span className="split-space whitespace-pre" key={`space-${index}`}>
            {part}
          </span>
        ) : (
          <span className="split-word inline-block whitespace-nowrap" key={`word-${part}-${index}`}>
            {part}
          </span>
        )
      );
    }

    if (splitType.includes("chars")) {
      return text.split(/(\s+)/).map((part, index) => {
        if (part.trim().length === 0) {
          return (
            <span className="split-space whitespace-pre" key={`space-${index}`}>
              {part}
            </span>
          );
        }

        return (
          <span className="split-word inline-block whitespace-nowrap" key={`word-${part}-${index}`}>
            {Array.from(part).map((char, charIndex) => (
              <span className="split-char inline-block" key={`char-${char}-${index}-${charIndex}`}>
                {char}
              </span>
            ))}
          </span>
        );
      });
    }

    return text;
  }, [text, splitType]);

  useEffect(() => {
    const el = ref.current;

    if (!el || !text) {
      return;
    }

    let disposed = false;
    let teardown: (() => void) | undefined;

    const run = async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);

      if (disposed) {
        return;
      }

      gsap.registerPlugin(ScrollTrigger);

      const start = getStart(threshold, rootMargin);

      let selector = ".split-char";
      if (splitType.includes("words") && !splitType.includes("chars")) {
        selector = ".split-word";
      }
      if (splitType.includes("lines")) {
        selector = ".split-line";
      }

      let targets = el.querySelectorAll(selector);

      if (targets.length === 0) {
        targets = el.querySelectorAll(".split-char, .split-word, .split-line");
      }

      if (targets.length === 0) {
        return;
      }

      const tween = gsap.fromTo(
        targets,
        {
          ...from,
          willChange: "transform, opacity",
        },
        {
          ...to,
          duration,
          ease,
          stagger: delay / 1000,
          scrollTrigger: {
            trigger: el,
            start,
            once: true,
            fastScrollEnd: true,
            anticipatePin: 0.4,
          },
          onComplete: () => {
            onLetterAnimationComplete?.();
          },
          force3D: true,
          overwrite: "auto",
        }
      );

      teardown = () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    };

    run().catch(() => {
      // Keep a static heading if animation libraries fail to load.
    });

    return () => {
      disposed = true;
      teardown?.();
    };
  }, [
    text,
    delay,
    duration,
    ease,
    splitType,
    from,
    to,
    threshold,
    rootMargin,
    onLetterAnimationComplete,
  ]);

  const Tag = tag;

  return (
    <Tag
      className={cn("split-parent", className)}
      ref={setRef}
      style={{
        textAlign,
        overflow: "visible",
        display: "block",
        whiteSpace: "normal",
        overflowWrap: "normal",
        wordBreak: "normal",
      }}
    >
      {segments}
    </Tag>
  );
}
