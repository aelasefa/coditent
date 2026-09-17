"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { exchangeOAuthHandoff, getMe } from "@/lib/api";
import { saveToken } from "@/lib/auth";
import { getPostAuthDestination } from "@/lib/candidate-onboarding";
import {
  isOAuthPopupAck,
  OAUTH_POPUP_ERROR,
  OAUTH_POPUP_SUCCESS,
  oauthChannelName,
  type OAuthPopupResult,
} from "@/lib/oauth-popup";
import authStyles from "../../../(auth)/login/login-page.module.css";
import styles from "./sso-callback.module.css";

type CallbackState = "loading" | "success" | "error";

const errorMessages: Record<string, string> = {
  invalid_sso_callback: "The sign-in response was incomplete or malformed.",
  invalid_sso_state: "This sign-in attempt expired or could not be verified.",
  invalid_sso_origin: "This sign-in attempt came from an unrecognized Coditent page.",
  sso_provider_error: "The provider cancelled or could not complete sign-in.",
  sso_code_or_state_missing: "The provider returned an incomplete sign-in response.",
  sso_handoff_expired: "This sign-in result expired or was already used.",
  sso_parent_unavailable: "We could not securely return sign-in to the original Coditent window.",
  sso_session_missing: "The secure Coditent session could not be established.",
};

export default function SsoCallbackPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const callbackParamsRef = useRef<{
    handoffCode: string | null;
    attemptId: string;
    callbackError: string | null;
    provider: string | null;
    isNewRegistration: boolean;
  } | null>(null);
  const [state, setState] = useState<CallbackState>("loading");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let closeTimer: number | null = null;
    let responseTimer: number | null = null;
    let channel: BroadcastChannel | null = null;
    if (!callbackParamsRef.current) {
      const query = new URLSearchParams(window.location.search);
      callbackParamsRef.current = {
        handoffCode: query.get("handoff"),
        attemptId: query.get("attempt") ?? "",
        callbackError: query.get("error"),
        provider: query.get("provider"),
        isNewRegistration: query.get("registration") === "new",
      };
    }
    const {
      handoffCode,
      attemptId,
      callbackError,
      provider: currentProvider,
      isNewRegistration,
    } = callbackParamsRef.current;
    const opener = window.opener as Window | null;
    const isNamedPopup = window.name.startsWith("coditent_oauth_");
    setProvider(currentProvider);

    // Remove the one-time handoff from browser history immediately after parsing it.
    window.history.replaceState(null, "", window.location.pathname);

    function cleanup() {
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      if (responseTimer !== null) window.clearTimeout(responseTimer);
      window.removeEventListener("message", handleAcknowledgement);
      channel?.close();
    }

    function finishClose() {
      if (responseTimer !== null) {
        window.clearTimeout(responseTimer);
        responseTimer = null;
      }
      setState("success");
      closeTimer = window.setTimeout(() => window.close(), 650);
    }

    function handleAcknowledgement(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== opener) return;
      if (isOAuthPopupAck(event.data, attemptId)) finishClose();
    }

    function handleChannelAcknowledgement(event: MessageEvent) {
      if (isOAuthPopupAck(event.data, attemptId)) finishClose();
    }

    function sendToParent(message: OAuthPopupResult): boolean {
      let sent = false;
      if (opener && !opener.closed) {
        opener.postMessage(message, window.location.origin);
        sent = true;
      }
      if (attemptId && "BroadcastChannel" in window) {
        channel = new BroadcastChannel(oauthChannelName(attemptId));
        channel.onmessage = handleChannelAcknowledgement;
        channel.postMessage(message);
        sent = true;
      }
      return sent;
    }

    async function finishStandalone() {
      if (!handoffCode) {
        setErrorCode(callbackError ?? "invalid_sso_callback");
        setState("error");
        return;
      }
      try {
        const session = await exchangeOAuthHandoff(handoffCode);
        if (!active) return;
        saveToken(session.token);
        const user = await getMe();
        localStorage.setItem("user", JSON.stringify(user));
        router.replace(
          await getPostAuthDestination(queryClient, user, {
            isNewRegistration: session.is_new_registration,
          })
        );
      } catch {
        if (!active) return;
        setErrorCode("sso_session_missing");
        setState("error");
      }
    }

    if (callbackError) {
      if (attemptId) {
        sendToParent({
          type: OAUTH_POPUP_ERROR,
          attemptId,
          error: callbackError,
        });
      }
      setErrorCode(callbackError);
      setState("error");
      return cleanup;
    }

    if (!handoffCode || !attemptId) {
      void finishStandalone();
      return cleanup;
    }

    if (!isNamedPopup && (!opener || opener.closed)) {
      void finishStandalone();
      return cleanup;
    }

    window.addEventListener("message", handleAcknowledgement);
    const sent = sendToParent({
      type: OAUTH_POPUP_SUCCESS,
      attemptId,
      handoffCode,
      isNewRegistration,
    });
    setState("success");
    if (!sent) {
      setErrorCode("sso_parent_unavailable");
      setState("error");
    } else {
      responseTimer = window.setTimeout(() => {
        if (!active) return;
        setErrorCode("sso_parent_unavailable");
        setState("error");
      }, 10_000);
    }

    return () => {
      active = false;
      cleanup();
    };
  }, [queryClient, router]);

  const errorMessage = useMemo(
    () => errorMessages[errorCode ?? ""] ?? "Social sign-in could not be completed. Please try again.",
    [errorCode]
  );

  function tryAgain() {
    if (window.opener && !window.opener.closed) {
      window.opener.focus();
      window.close();
      return;
    }
    router.replace(provider === "linkedin" ? "/login" : "/login");
  }

  return (
    <main className={authStyles.page}>
      <video
        className={authStyles.backgroundVideo}
        autoPlay
        muted
        playsInline
        preload="metadata"
        poster="/images/auth/sign-in-background.png"
        aria-hidden="true"
        tabIndex={-1}
      >
        <source src="/images/auth/Create-a-subtle-polished-3-second-silen.mp4" type="video/mp4" />
      </video>
      <div className={authStyles.loginContent}>
        <header className={authStyles.header}>
          <Link href="/" aria-label="Coditent home"><Logo size="md" /></Link>
          <Link href="/login" className={authStyles.headerLink}>Back to sign in</Link>
        </header>
        <div className={authStyles.shell}>
          <section className={authStyles.formColumn} aria-live="polite">
            <div className={`${authStyles.formInner} ${styles.card}`}>
              <div className={state === "error" ? styles.errorIcon : state === "success" ? styles.successIcon : styles.loadingIcon} aria-hidden>
                {state === "error" ? "!" : state === "success" ? "✓" : <span />}
              </div>
              <p className={authStyles.eyebrow}>Secure authentication</p>
              <h1 className={styles.title}>
                {state === "loading" ? "Signing you in" : state === "success" ? "Signed in successfully" : "Couldn’t sign you in"}
              </h1>
              <p className={styles.subtitle}>
                {state === "loading"
                  ? "Finishing your secure sign-in…"
                  : state === "success"
                    ? "Returning you to Coditent…"
                    : errorMessage}
              </p>
              {state === "error" ? (
                <div className={styles.actions}>
                  <button type="button" className={styles.primaryButton} onClick={tryAgain}>Try again</button>
                  <Link href="/login" className={styles.secondaryButton}>Back to sign in</Link>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
