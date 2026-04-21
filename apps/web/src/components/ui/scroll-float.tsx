"use client";

import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";

import { cn } from "@/lib/cn";

import styles from "./scroll-float.module.css";

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }

  return "";
}

type ScrollFloatProps = {
  children: ReactNode;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  containerClassName?: string;
  textClassName?: string;
  animationDuration?: number;
  ease?: string;
  scrollStart?: string;
  scrollEnd?: string;
  stagger?: number;
};

export default function ScrollFloat({
  children,
  scrollContainerRef,
  containerClassName = "",
  textClassName = "",
  animationDuration = 1,
  ease = "back.inOut(2)",
  scrollStart = "center bottom+=50%",
  scrollEnd = "bottom bottom-=40%",
  stagger = 0.03,
}: ScrollFloatProps) {
  const containerRef = useRef<HTMLHeadingElement | null>(null);

  const splitText = useMemo(() => {
    const text = extractText(children).replace(/\s+/g, " ").trim();
    const segments = text.split(/(\s+)/);

    return segments.map((segment, index) => {
      if (segment.trim().length === 0) {
        return (
          <span className={styles.space} key={`space-${index}`}>
            {segment}
          </span>
        );
      }

      return (
        <span className={styles.word} key={`word-${segment}-${index}`}>
          {Array.from(segment).map((char, charIndex) => (
            <span className={styles.char} key={`char-${char}-${index}-${charIndex}`}>
              {char}
            </span>
          ))}
        </span>
      );
    });
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const scroller = scrollContainerRef?.current ?? window;
    const charElements = el.querySelectorAll(`.${styles.char}`);

    if (charElements.length === 0) {
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

      const tween = gsap.fromTo(
        charElements,
        {
          willChange: "opacity, transform",
          opacity: 0,
          yPercent: 120,
          scaleY: 2.3,
          scaleX: 0.7,
          transformOrigin: "50% 0%",
        },
        {
          duration: animationDuration,
          ease,
          opacity: 1,
          yPercent: 0,
          scaleY: 1,
          scaleX: 1,
          stagger,
          scrollTrigger: {
            trigger: el,
            scroller,
            start: scrollStart,
            end: scrollEnd,
            scrub: true,
            invalidateOnRefresh: true,
          },
        }
      );

      ScrollTrigger.refresh();

      teardown = () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    };

    run().catch(() => {
      // Keep static text when animation runtime is unavailable.
    });

    return () => {
      disposed = true;
      teardown?.();
    };
  }, [scrollContainerRef, animationDuration, ease, scrollStart, scrollEnd, stagger]);

  return (
    <h2 className={cn(styles.scrollFloat, containerClassName)} ref={containerRef}>
      <span className={cn(styles.scrollFloatText, textClassName)}>{splitText}</span>
    </h2>
  );
}
