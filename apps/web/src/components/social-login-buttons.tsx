import type { ReactNode } from "react";

const googleIcon = (
  <svg viewBox="0 0 48 48" className="h-4 w-4" role="img" aria-label="Google">
    <path
      fill="#EA4335"
      d="M24 9.5c3.62 0 6.64 1.48 9.05 3.9l6.1-6.1C35.31 3.78 30.1 1.5 24 1.5 14.77 1.5 6.86 6.7 3.02 14.34l7.1 5.52C12.06 13.76 17.6 9.5 24 9.5z"
    />
    <path
      fill="#34A853"
      d="M46.2 24.6c0-1.64-.15-3.22-.42-4.74H24v9h12.5c-.54 2.9-2.16 5.35-4.6 7l7.1 5.52C43.1 37.7 46.2 31.6 46.2 24.6z"
    />
    <path
      fill="#FBBC05"
      d="M10.12 28.86A14.6 14.6 0 0 1 9.3 24c0-1.69.3-3.31.82-4.86l-7.1-5.52A23.46 23.46 0 0 0 0 24c0 3.88.94 7.53 2.6 10.78l7.52-5.92z"
    />
    <path
      fill="#4285F4"
      d="M24 46.5c6.1 0 11.3-2.02 15.07-5.52l-7.1-5.52c-2.02 1.35-4.6 2.15-7.97 2.15-6.4 0-11.94-4.26-13.88-10.3l-7.52 5.92C6.86 41.3 14.77 46.5 24 46.5z"
    />
  </svg>
);

const linkedInIcon = (
  <svg viewBox="0 0 34 34" className="h-4 w-4" role="img" aria-label="LinkedIn">
    <path
      fill="#0A66C2"
      d="M27.96 0H6.03C2.7 0 0 2.7 0 6.03v21.94C0 31.3 2.7 34 6.03 34h21.94C31.3 34 34 31.3 34 27.97V6.03C34 2.7 31.3 0 27.97 0h-.01z"
    />
    <path
      fill="#fff"
      d="M10.06 27.12H5.17V12.1h4.89v15.02zM7.62 10.1a2.83 2.83 0 1 1 0-5.66 2.83 2.83 0 0 1 0 5.66zM28.82 27.12h-4.88v-7.3c0-1.74-.03-3.98-2.43-3.98-2.43 0-2.8 1.9-2.8 3.86v7.42h-4.88V12.1h4.69v2.05h.07c.66-1.25 2.27-2.56 4.66-2.56 4.99 0 5.91 3.29 5.91 7.57v7.96z"
    />
  </svg>
);

interface SocialLoginButtonsProps {
  className?: string;
  separator?: ReactNode;
}

export function SocialLoginButtons({
  className,
  separator = "OR",
}: SocialLoginButtonsProps) {
  const ssoBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";
  const baseButtonClass =
    "inline-flex h-11 w-full items-center justify-center gap-3 rounded-full px-4 text-sm font-semibold transition-all duration-300 ease-md active:scale-95";

  return (
    <div className={className}>
      <div className="grid gap-3">
        <a
          className={`${baseButtonClass} border border-md-outline/30 bg-white text-slate-900 hover:border-md-primary/40 hover:shadow-sm`}
          href={`${ssoBaseUrl}/auth/sso/google/start`}
        >
          <span aria-hidden className="flex h-5 w-5 items-center justify-center">
            {googleIcon}
          </span>
          Continue with Google
        </a>
        <a
          className={`${baseButtonClass} bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90`}
          href={`${ssoBaseUrl}/auth/sso/linkedin/start`}
        >
          <span aria-hidden className="flex h-5 w-5 items-center justify-center">
            {linkedInIcon}
          </span>
          Continue with LinkedIn
        </a>
      </div>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-md-outline/30" />
        <span className="text-xs uppercase tracking-[0.12em] text-md-onSurfaceVariant">
          {separator}
        </span>
        <div className="h-px flex-1 bg-md-outline/30" />
      </div>
    </div>
  );
}
