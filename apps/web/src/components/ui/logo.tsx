import { cn } from "@/lib/cn";

interface LogoProps {
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: { mark: 28, width: 84, text: "text-base" },
  md: { mark: 32, width: 110, text: "text-lg" },
  lg: { mark: 40, width: 140, text: "text-xl" },
};

function Mark({ px, color }: { px: number; color: string }) {
  const h = px * 0.55;
  return (
    <svg
      width={px * 1.1}
      height={h}
      viewBox="0 0 220 120"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path d="M 58 30 C 58 30 20 30 20 60 C 20 90 58 90 58 90" stroke={color} strokeWidth="12" strokeLinecap="round" />
      <circle cx="110" cy="18" r="8" fill={color} />
      <line x1="110" y1="26" x2="110" y2="92" stroke={color} strokeWidth="11" strokeLinecap="round" />
      <circle cx="110" cy="60" r="32" stroke={color} strokeWidth="11" />
      <path d="M 155 30 L 155 90" stroke={color} strokeWidth="12" strokeLinecap="round" />
      <path d="M 155 30 C 155 30 200 30 200 60 C 200 90 155 90 155 90" stroke={color} strokeWidth="12" strokeLinecap="round" />
    </svg>
  );
}

// Canonical logo. Vector only. No /logo.jpeg in product UI.
export function Logo({ variant = "full", size = "md", className }: LogoProps) {
  const s = sizes[size];
  return (
    <span className={cn("inline-flex items-center gap-2", className)} role="img" aria-label="Coditent">
      <span className="text-primary">
        <Mark px={s.mark} color="currentColor" />
      </span>
      {variant === "full" ? (
        <span className={cn("font-extrabold tracking-tight text-foreground", s.text)}>Coditent</span>
      ) : null}
    </span>
  );
}
