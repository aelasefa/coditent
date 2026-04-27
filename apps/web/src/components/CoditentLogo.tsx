import Image from "next/image";

export default function CoditentLogo({
  size = 48,
  color = "#7C3AED",
  className = "",
  useSvg = false,
}: {
  size?: number;
  color?: string;
  className?: string;
  useSvg?: boolean;
}) {
  if (!useSvg) {
    return (
      <Image
        src="/logo.jpeg"
        alt="Coditent"
        width={size * 2.2}
        height={size}
        className={className}
        priority
        style={{ objectFit: "contain" }}
      />
    );
  }

  return (
    <svg
      width={size * 2.2}
      height={size}
      viewBox="0 0 220 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Coditent logo"
    >
      <path
        d="M 58 30 C 58 30 20 30 20 60 C 20 90 58 90 58 90"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="110" cy="18" r="8" fill={color} />
      <line
        x1="110"
        y1="26"
        x2="110"
        y2="92"
        stroke={color}
        strokeWidth="11"
        strokeLinecap="round"
      />
      <circle cx="110" cy="60" r="32" stroke={color} strokeWidth="11" fill="none" />
      <path d="M 155 30 L 155 90" stroke={color} strokeWidth="12" strokeLinecap="round" fill="none" />
      <path
        d="M 155 30 C 155 30 200 30 200 60 C 200 90 155 90 155 90"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
