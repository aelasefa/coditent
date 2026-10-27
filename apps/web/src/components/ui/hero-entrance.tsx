"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./hero-entrance.module.css";

export function HeroEntrance({ className, children }: { className?: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`${styles.root}${className ? ` ${className}` : ""}`}
      data-entrance-ready={ready ? "true" : "false"}
    >
      {children}
    </div>
  );
}
