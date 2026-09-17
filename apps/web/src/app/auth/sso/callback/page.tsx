"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { getAuthenticatedDestination } from "@/lib/auth-redirect";
import { getCandidateOnboarding, getMe } from "@/lib/api";
import { saveToken } from "@/lib/auth";
import {
  isOAuthPopupAck,
  OAUTH_POPUP_MESSAGE_TYPE,
  type OAuthPopupResult,
} from "@/lib/oauth-popup";

export default function SsoCallbackPage() {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isParsed, setIsParsed] = useState(false);
  const [standaloneToken, setStandaloneToken] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = fragment.get("token") ?? query.get("token");
    const callbackError = query.get("error") ?? (!token ? "invalid_sso_callback" : null);
    const opener = window.opener as Window | null;

    if (opener && !opener.closed) {
      const message: OAuthPopupResult = token
        ? {
            type: OAUTH_POPUP_MESSAGE_TYPE,
            status: "success",
            token,
            isNewRegistration: query.get("registration") === "new",
          }
        : {
            type: OAUTH_POPUP_MESSAGE_TYPE,
            status: "error",
            error: callbackError ?? "invalid_sso_callback",
          };
      let acknowledged = false;

      const handleAcknowledgement = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.source !== opener || !isOAuthPopupAck(event.data)) return;
        acknowledged = true;
        window.removeEventListener("message", handleAcknowledgement);
        window.close();
      };

      window.addEventListener("message", handleAcknowledgement);
      opener.postMessage(message, window.location.origin);

      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", handleAcknowledgement);
        if (!acknowledged) {
          setErrorCode("sso_parent_unavailable");
          setIsParsed(true);
        }
      }, 5000);

      return () => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", handleAcknowledgement);
      };
    }

    if (token) {
      saveToken(token);
      setStandaloneToken(token);
    }
    setErrorCode(callbackError);
    setIsParsed(true);
  }, []);

  const readableError = useMemo(() => {
    if (!errorCode) return null;
    if (errorCode === "sso_parent_unavailable") {
      return "Could not return sign-in to the original Coditent window. Close this window and try again.";
    }
    if (errorCode === "invalid_sso_callback") {
      return "The sign-in response was invalid. Close this window and try again.";
    }
    const normalized = errorCode.replace(/_/g, " ");
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}.`;
  }, [errorCode]);

  useEffect(() => {
    if (!isParsed || errorCode || !standaloneToken) return;
    let isMounted = true;
    async function finalizeLogin() {
      try {
        const user = await getMe();
        if (!isMounted) return;
        localStorage.setItem("user", JSON.stringify(user));
        if (user.role === "CANDIDATE") {
          const onboarding = await getCandidateOnboarding();
          if (!isMounted) return;
          if (!onboarding.onboarding_completed) {
            router.replace("/get-started");
            return;
          }
        }
        router.replace(
          getAuthenticatedDestination(user, {
            isNewRegistration: new URLSearchParams(window.location.search).get("registration") === "new",
          })
        );
      } catch {
        if (!isMounted) return;
        setErrorCode("sso_session_missing");
      }
    }
    finalizeLogin();
    return () => {
      isMounted = false;
    };
  }, [isParsed, errorCode, router, standaloneToken]);

  if (!isParsed) {
    return (
      <AuthLayout title="Preparing sign-in" subtitle="Reading SSO response.">
        <p role="status" className="text-sm text-muted-foreground">Loading…</p>
      </AuthLayout>
    );
  }

  if (readableError) {
    return (
      <AuthLayout title="SSO login failed" subtitle={readableError}>
        <Link href="/login" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
          Back to login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Completing SSO login" subtitle="Confirming session with API.">
      <p role="status" className="text-sm text-muted-foreground">Signing you in…</p>
      <Link href="/login" className="mt-4 inline-block text-sm font-medium text-muted-foreground underline">
        Back to login
      </Link>
    </AuthLayout>
  );
}
