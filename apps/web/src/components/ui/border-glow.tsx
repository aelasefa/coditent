"use client";

import {
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";

import styles from "@/components/ui/border-glow.module.css";

type AnimateOptions = {
  start?: number;
  end?: number;
  duration?: number;
  delay?: number;
  ease?: (value: number) => number;
  onUpdate: (value: number) => void;
  onEnd?: () => void;
};

interface BorderGlowProps extends HTMLAttributes<HTMLDivElement> {
  edgeSensitivity?: number;
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  animated?: boolean;
  colors?: string[];
  fillOpacity?: number;
}

function parseHSL(hslValue: string): { h: number; s: number; l: number } {
  const cleaned = hslValue.replace(/,/g, " ").trim();
  const match = cleaned.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);

  if (!match) {
    return { h: 40, s: 80, l: 80 };
  }

  return {
    h: Number(match[1]),
    s: Number(match[2]),
    l: Number(match[3]),
  };
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function easeInCubic(value: number): number {
  return value ** 3;
}

function animateValue({
  start = 0,
  end = 100,
  duration = 1000,
  delay = 0,
  ease = easeOutCubic,
  onUpdate,
  onEnd,
}: AnimateOptions): void {
  const startTime = performance.now() + delay;

  function tick(): void {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(Math.max(elapsed / duration, 0), 1);
    onUpdate(start + (end - start) * ease(progress));

    if (progress < 1) {
      requestAnimationFrame(tick);
      return;
    }

    if (onEnd) {
      onEnd();
    }
  }

  window.setTimeout(() => {
    requestAnimationFrame(tick);
  }, delay);
}

function buildGlowVars(glowColor: string, intensity: number): Record<string, string> {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ["", "-60", "-50", "-40", "-30", "-20", "-10"];
  const vars: Record<string, string> = {};

  for (let index = 0; index < opacities.length; index += 1) {
    const alpha = Math.min(opacities[index] * intensity, 100);
    vars[`--glow-color${keys[index]}`] = `hsl(${base} / ${alpha}%)`;
  }

  return vars;
}

const gradientPositions = [
  "80% 55%",
  "69% 34%",
  "8% 6%",
  "41% 38%",
  "86% 85%",
  "82% 18%",
  "51% 4%",
];
const gradientKeys = [
  "--gradient-one",
  "--gradient-two",
  "--gradient-three",
  "--gradient-four",
  "--gradient-five",
  "--gradient-six",
  "--gradient-seven",
];
const colorMap = [0, 1, 2, 0, 1, 2, 1];

function buildGradientVars(colors: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  const palette = colors.length > 0 ? colors : ["#c084fc", "#f472b6", "#38bdf8"];

  for (let index = 0; index < 7; index += 1) {
    const color = palette[Math.min(colorMap[index], palette.length - 1)];
    vars[gradientKeys[index]] = `radial-gradient(at ${gradientPositions[index]}, ${color} 0px, transparent 50%)`;
  }

  vars["--gradient-base"] = `linear-gradient(${palette[0]} 0 100%)`;
  return vars;
}

export default function BorderGlow({
  children,
  className = "",
  edgeSensitivity = 30,
  glowColor = "40 80 80",
  backgroundColor = "#120F17",
  borderRadius = 28,
  glowRadius = 40,
  glowIntensity = 1,
  coneSpread = 25,
  animated = false,
  colors = ["#c084fc", "#f472b6", "#38bdf8"],
  fillOpacity = 0.5,
  ...props
}: BorderGlowProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  const getCenter = useCallback((element: HTMLDivElement): [number, number] => {
    const { width, height } = element.getBoundingClientRect();
    return [width / 2, height / 2];
  }, []);

  const getEdgeProximity = useCallback(
    (element: HTMLDivElement, x: number, y: number): number => {
      const [centerX, centerY] = getCenter(element);
      const deltaX = x - centerX;
      const deltaY = y - centerY;

      let ratioX = Number.POSITIVE_INFINITY;
      let ratioY = Number.POSITIVE_INFINITY;

      if (deltaX !== 0) {
        ratioX = centerX / Math.abs(deltaX);
      }

      if (deltaY !== 0) {
        ratioY = centerY / Math.abs(deltaY);
      }

      const normalized = 1 / Math.min(ratioX, ratioY);
      return Math.min(Math.max(normalized, 0), 1);
    },
    [getCenter]
  );

  const getCursorAngle = useCallback(
    (element: HTMLDivElement, x: number, y: number): number => {
      const [centerX, centerY] = getCenter(element);
      const deltaX = x - centerX;
      const deltaY = y - centerY;

      if (deltaX === 0 && deltaY === 0) {
        return 0;
      }

      const radians = Math.atan2(deltaY, deltaX);
      let degrees = radians * (180 / Math.PI) + 90;

      if (degrees < 0) {
        degrees += 360;
      }

      return degrees;
    },
    [getCenter]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const card = cardRef.current;
      if (!card) {
        return;
      }

      const bounds = card.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const edge = getEdgeProximity(card, x, y);
      const angle = getCursorAngle(card, x, y);

      card.style.setProperty("--edge-proximity", `${(edge * 100).toFixed(3)}`);
      card.style.setProperty("--cursor-angle", `${angle.toFixed(3)}deg`);
    },
    [getEdgeProximity, getCursorAngle]
  );

  useEffect(() => {
    if (!animated || !cardRef.current) {
      return;
    }

    const card = cardRef.current;
    const angleStart = 110;
    const angleEnd = 465;

    card.classList.add(styles.sweepActive);
    card.style.setProperty("--cursor-angle", `${angleStart}deg`);

    animateValue({
      duration: 500,
      onUpdate: (value) => card.style.setProperty("--edge-proximity", `${value}`),
    });

    animateValue({
      ease: easeInCubic,
      duration: 1500,
      end: 50,
      onUpdate: (value) => {
        const angle = (angleEnd - angleStart) * (value / 100) + angleStart;
        card.style.setProperty("--cursor-angle", `${angle}deg`);
      },
    });

    animateValue({
      ease: easeOutCubic,
      delay: 1500,
      duration: 2250,
      start: 50,
      end: 100,
      onUpdate: (value) => {
        const angle = (angleEnd - angleStart) * (value / 100) + angleStart;
        card.style.setProperty("--cursor-angle", `${angle}deg`);
      },
    });

    animateValue({
      ease: easeInCubic,
      delay: 2500,
      duration: 1500,
      start: 100,
      end: 0,
      onUpdate: (value) => card.style.setProperty("--edge-proximity", `${value}`),
      onEnd: () => {
        card.classList.remove(styles.sweepActive);
      },
    });
  }, [animated]);

  const styleVars = {
    "--card-bg": backgroundColor,
    "--edge-sensitivity": edgeSensitivity,
    "--border-radius": `${borderRadius}px`,
    "--glow-padding": `${glowRadius}px`,
    "--cone-spread": coneSpread,
    "--fill-opacity": fillOpacity,
    ...buildGlowVars(glowColor, glowIntensity),
    ...buildGradientVars(colors),
  } as CSSProperties;

  return (
    <div
      ref={cardRef}
      className={`${styles.borderGlowCard} ${className}`.trim()}
      onPointerMove={handlePointerMove}
      style={styleVars}
      {...props}
    >
      <span className={styles.edgeLight} />
      <div className={styles.borderGlowInner}>{children}</div>
    </div>
  );
}
