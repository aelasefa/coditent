"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const LiquidEther = dynamic(() => import("@/app/LiquidEther"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-[radial-gradient(circle_at_20%_25%,rgba(82,39,255,0.24),rgba(255,159,252,0.18)_45%,rgba(245,238,229,0.12)_78%)]" />
  ),
});

export default function LiquidEtherHero() {
  const [mounted, setMounted] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mediaCompact = window.matchMedia("(max-width: 900px)");
    const mediaMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const updateFlags = () => {
      setIsCompact(mediaCompact.matches);
      setReduceMotion(mediaMotion.matches);
    };

    updateFlags();

    mediaCompact.addEventListener("change", updateFlags);
    mediaMotion.addEventListener("change", updateFlags);

    const delayId = window.setTimeout(() => {
      setMounted(true);
    }, 160);

    return () => {
      mediaCompact.removeEventListener("change", updateFlags);
      mediaMotion.removeEventListener("change", updateFlags);
      window.clearTimeout(delayId);
    };
  }, []);

  const effectProps = useMemo(() => {
    if (isCompact) {
      return {
        mouseForce: 14,
        cursorSize: 72,
        viscous: 22,
        iterationsViscous: 18,
        iterationsPoisson: 20,
        resolution: 0.32,
        autoIntensity: 1.5,
      };
    }

    return {
      mouseForce: 20,
      cursorSize: 100,
      viscous: 30,
      iterationsViscous: 32,
      iterationsPoisson: 32,
      resolution: 0.5,
      autoIntensity: 2.2,
    };
  }, [isCompact]);

  return (
    <div className="relative h-full w-full">
      {!mounted || reduceMotion ? (
        <div className="h-full w-full bg-[radial-gradient(circle_at_28%_28%,rgba(82,39,255,0.3),rgba(255,159,252,0.24)_44%,rgba(177,158,239,0.2)_68%,rgba(245,238,229,0.1)_88%)]" />
      ) : (
        <LiquidEther
          colors={["#5227FF", "#FF9FFC", "#B19EEF"]}
          mouseForce={effectProps.mouseForce}
          cursorSize={effectProps.cursorSize}
          isViscous
          viscous={effectProps.viscous}
          iterationsViscous={effectProps.iterationsViscous}
          iterationsPoisson={effectProps.iterationsPoisson}
          resolution={effectProps.resolution}
          isBounce={false}
          autoDemo
          autoSpeed={0.5}
          autoIntensity={effectProps.autoIntensity}
          takeoverDuration={0.25}
          autoResumeDelay={3000}
          autoRampDuration={0.6}
          color0="#5227FF"
          color1="#FF9FFC"
          color2="#B19EEF"
        />
      )}
    </div>
  );
}
