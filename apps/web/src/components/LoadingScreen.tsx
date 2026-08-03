"use client";

import { useEffect, useState } from "react";

import CoditentLogo from "@/components/CoditentLogo";
import styles from "@/components/LoadingScreen.module.css";

const STORAGE_KEY = "coditent:loading-seen";

export default function LoadingScreen() {
  const [phase, setPhase] = useState<"visible" | "fading" | "done">("done");

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (sessionStorage.getItem(STORAGE_KEY)) {
        setPhase("done");
        return;
      }
    } catch {
      setPhase("done");
      return;
    }

    setPhase("visible");

    const fadeTimer = window.setTimeout(() => setPhase("fading"), 1100);
    const doneTimer = window.setTimeout(() => {
      setPhase("done");
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // ignore
      }
    }, 1500);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
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
