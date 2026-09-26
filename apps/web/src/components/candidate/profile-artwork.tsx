"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./candidate-pages.module.css";

export function ProfileArtwork() {
  const artworkRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

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
        setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.5);
      },
      { threshold: [0, 0.5, 1] }
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
    const video = videoRef.current;
    if (!video || !videoReady) return;

    if (motionAllowed && isInView && pageVisible) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [isInView, motionAllowed, pageVisible, videoReady]);

  return (
    <div ref={artworkRef} className={styles.profileArtwork} aria-hidden="true">
      <Image
        src="/images/candidate/profile-builder.png"
        alt=""
        fill
        priority
        sizes="(max-width: 1100px) calc(100vw - 3rem), 45vw"
      />
      {motionAllowed && !videoFailed ? (
        <video
          ref={videoRef}
          className={`${styles.profileArtworkVideo} ${videoReady ? styles.profileArtworkVideoReady : ""}`}
          loop
          muted
          playsInline
          preload="auto"
          onLoadedData={() => setVideoReady(true)}
          onError={() => setVideoFailed(true)}
        >
          <source src="/images/candidate/profile-builder-motion.mp4" type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
