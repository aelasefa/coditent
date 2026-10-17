"use client";

import Image from "next/image";
import type { AnimationItem } from "lottie-web";
import { useEffect, useRef, useState } from "react";
import styles from "./landing-page.module.css";

export function LandingFinalArtwork() {
  const artworkRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [animationReady, setAnimationReady] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionAllowed(!preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const artwork = artworkRef.current;
    if (!artwork) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.15;
        setIsInView(visible);
        if (visible) setShouldLoad(true);
      },
      { threshold: [0, 0.15] }
    );
    observer.observe(artwork);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!shouldLoad || !motionAllowed || !playerRef.current) return;

    const controller = new AbortController();
    let disposed = false;
    let animation: AnimationItem | undefined;

    const load = async () => {
      try {
        // SVG-only player: this artwork needs neither expressions nor canvas rendering.
        const [lottie, response] = await Promise.all([
          import("lottie-web/build/player/lottie_light"),
          fetch("/images/landing/company-collaboration.json", { signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error("Animation unavailable");
        const animationData = await response.json();
        if (disposed || !playerRef.current) return;

        animation = lottie.default.loadAnimation({
          container: playerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: false,
          animationData,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        animationRef.current = animation;
        animation.addEventListener("DOMLoaded", () => {
          if (!disposed) setAnimationReady(true);
        });
        animation.addEventListener("error", () => {
          if (!disposed) {
            setAnimationReady(false);
            animation?.destroy();
            animationRef.current = null;
          }
        });
      } catch {
        // Retain the matching vector poster if loading fails or is cancelled.
        if (!disposed) setAnimationReady(false);
      }
    };
    void load();

    return () => {
      disposed = true;
      controller.abort();
      animation?.destroy();
      animationRef.current = null;
      setAnimationReady(false);
    };
  }, [motionAllowed, shouldLoad]);

  useEffect(() => {
    const animation = animationRef.current;
    if (!animationReady || !animation) return;
    if (motionAllowed && isInView && pageVisible) animation.play();
    else animation.pause();
  }, [animationReady, isInView, motionAllowed, pageVisible]);

  return (
    <div ref={artworkRef} className={styles.finalMedia} aria-hidden="true">
      <div className={styles.finalArtwork}>
        <Image
          src="/images/landing/company-collaboration-poster.svg"
          alt=""
          fill
          className={styles.finalPoster}
          style={{ visibility: motionAllowed && animationReady ? "hidden" : "visible" }}
        />
        <div
          ref={playerRef}
          className={styles.finalAnimation}
          style={{ visibility: motionAllowed && animationReady ? "visible" : "hidden" }}
        />
      </div>
    </div>
  );
}
