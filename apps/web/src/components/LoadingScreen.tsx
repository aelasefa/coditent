"use client";

import { useEffect, useState } from "react";

import CoditentLogo from "@/components/CoditentLogo";
import styles from "@/components/LoadingScreen.module.css";

export default function LoadingScreen() {
  const [phase, setPhase] = useState<"visible" | "fading" | "done">("visible");

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("fading"), 1800);
    const doneTimer = setTimeout(() => setPhase("done"), 2300);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (phase === "done") {
    return null;
  }

  return (
    <div className={`${styles.overlay} ${phase === "fading" ? styles.fading : ""}`}>
      <div className={styles.content}>
        <div className={styles.logoWrap}>
          <CoditentLogo size={90} color="#ffffff" useSvg className={styles.logo} />
        </div>
        <div className={styles.ring} />
        <div className={styles.ringOuter} />
        <div className={styles.barTrack}>
          <div className={styles.barFill} />
        </div>
        <p className={styles.wordmark}>CODITENT</p>
      </div>
    </div>
  );
}
