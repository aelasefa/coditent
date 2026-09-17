"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getAuthenticatedDestination, safeNextDestination } from "@/lib/auth-redirect";
import { exchangeOAuthHandoff, getApiBaseUrl, getCandidateOnboarding, getMe } from "@/lib/api";
import { removeToken, saveToken } from "@/lib/auth";
import {
  isOAuthPopupResult,
  OAUTH_POPUP_ACK,
  oauthChannelName,
  type OAuthPopupResult,
} from "@/lib/oauth-popup";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const popupRef = useRef<Window | null>(null);
  const closePollRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const handledRef = useRef(false);
  const [popupError, setPopupError] = useState<string | null>(null);
  const ssoBaseUrl = getApiBaseUrl();
  const baseButtonClass =
    "inline-flex h-11 w-full items-center justify-center gap-3 rounded-full px-4 text-sm font-semibold transition-all duration-300 ease-md active:scale-95";

  useEffect(() => {
    function clearClosePoll() {
      if (closePollRef.current !== null) {
        window.clearInterval(closePollRef.current);
        closePollRef.current = null;
      }
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    function closeChannel() {
      channelRef.current?.close();
      channelRef.current = null;
    }

    function acknowledge(attemptId: string) {
      const acknowledgement = { type: OAUTH_POPUP_ACK, attemptId } as const;
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.postMessage(acknowledgement, window.location.origin);
      }
      channelRef.current?.postMessage(acknowledgement);
    }

    async function handleResult(result: OAuthPopupResult) {
      if (result.attemptId !== attemptIdRef.current) return;

      if (handledRef.current) {
        acknowledge(result.attemptId);
        return;
      }

      handledRef.current = true;
      clearClosePoll();

      if (result.type === "CODITENT_OAUTH_ERROR") {
        setPopupError(readableOAuthError(result.error));
        popupRef.current = null;
        closeChannel();
        return;
      }

      try {
        const session = await exchangeOAuthHandoff(result.handoffCode);
        saveToken(session.token);
        const user = await getMe();
        localStorage.setItem("user", JSON.stringify(user));
        const next = safeNextDestination(searchParams.get("next"));
        acknowledge(result.attemptId);
        window.setTimeout(() => {
          popupRef.current = null;
          closeChannel();
        }, 700);
        if (user.role === "CANDIDATE" && !next) {
          const onboarding = await getCandidateOnboarding();
          if (!onboarding.onboarding_completed) {
            router.replace("/get-started");
            return;
          }
        }
        router.replace(
          getAuthenticatedDestination(user, {
            next,
            isNewRegistration: session.is_new_registration,
          })
        );
      } catch {
        acknowledge(result.attemptId);
        popupRef.current = null;
        closeChannel();
        removeToken();
        setPopupError("Authentication completed, but the Coditent session could not be verified. Please try again.");
      }
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!popupRef.current || event.source !== popupRef.current) return;
      if (!isOAuthPopupResult(event.data)) return;
      void handleResult(event.data);
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      clearClosePoll();
      closeChannel();
    };
  }, [router, searchParams]);

  function openOAuthPopup(provider: "google" | "linkedin") {
    setPopupError(null);
    handledRef.current = false;

    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }

    const width = 520;
    const height = 650;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const features = [
      "popup=yes",
      `width=${width}`,
      `height=${height}`,
      `left=${Math.round(left)}`,
      `top=${Math.round(top)}`,
      "resizable=yes",
      "scrollbars=yes",
    ].join(",");
    const attemptId = crypto.randomUUID();
    attemptIdRef.current = attemptId;
    channelRef.current?.close();
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(oauthChannelName(attemptId));
      channel.onmessage = (event: MessageEvent) => {
        if (isOAuthPopupResult(event.data) && event.data.attemptId === attemptId) {
          window.dispatchEvent(new MessageEvent("message", {
            data: event.data,
            origin: window.location.origin,
            source: popupRef.current,
          }));
        }
      };
      channelRef.current = channel;
    }
    const startUrl = new URL(
      `${ssoBaseUrl}/auth/sso/${provider}/start`,
      window.location.origin
    );
    startUrl.searchParams.set("popup_origin", window.location.origin);
    startUrl.searchParams.set("attempt_id", attemptId);
    const popup = window.open(
      startUrl.toString(),
      `coditent_oauth_${provider}`,
      features
    );

    if (!popup || popup.closed) {
      setPopupError("The sign-in popup was blocked. Allow popups for Coditent and try again.");
      channelRef.current?.close();
      channelRef.current = null;
      return;
    }

    popupRef.current = popup;
    popup.focus();
    closePollRef.current = window.setInterval(() => {
      if (popup.closed) {
        if (closePollRef.current !== null) window.clearInterval(closePollRef.current);
        closePollRef.current = null;
        popupRef.current = null;
        if (!handledRef.current) {
          setPopupError("The sign-in window was closed before authentication finished.");
          channelRef.current?.close();
          channelRef.current = null;
        }
      }
    }, 400);
    timeoutRef.current = window.setTimeout(() => {
      if (!handledRef.current) {
        setPopupError("Social sign-in took too long. Close the sign-in window and try again.");
        channelRef.current?.close();
        channelRef.current = null;
      }
    }, 120_000);
  }

  return (
    <div className={className}>
      <div className="grid gap-3">
        <button
          type="button"
          className={`${baseButtonClass} border border-md-outline/30 bg-white text-slate-900 hover:border-md-primary/40 hover:shadow-sm`}
          onClick={() => openOAuthPopup("google")}
        >
          <span aria-hidden className="flex h-5 w-5 items-center justify-center">
            {googleIcon}
          </span>
          Continue with Google
        </button>
        <button
          type="button"
          className={`${baseButtonClass} bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90`}
          onClick={() => openOAuthPopup("linkedin")}
        >
          <span aria-hidden className="flex h-5 w-5 items-center justify-center">
            {linkedInIcon}
          </span>
          Continue with LinkedIn
        </button>
      </div>

      {popupError ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {popupError}
        </p>
      ) : null}

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

function readableOAuthError(error: string): string {
  const messages: Record<string, string> = {
    invalid_sso_callback: "The sign-in response was invalid. Please try again.",
    invalid_sso_state: "The sign-in session was invalid or expired. Please try again.",
    sso_provider_error: "The provider did not complete sign-in. Please try again.",
    sso_code_or_state_missing: "The provider returned an incomplete sign-in response. Please try again.",
  };
  return messages[error] ?? "Social sign-in failed. Please try again.";
}
