"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./candidate-pages.module.css";

export function ProfileArtwork() {
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionAllowed(!preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  return (
    <div className={styles.profileArtwork} aria-hidden="true">
      <Image
        src="/images/candidate/profile-builder.png"
        alt=""
        fill
        sizes="(max-width: 1100px) calc(100vw - 3rem), 45vw"
      />
      {motionAllowed && !videoFailed ? (
        <video
          className={`${styles.profileArtworkVideo} ${videoReady ? styles.profileArtworkVideoReady : ""}`}
          autoPlay
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
