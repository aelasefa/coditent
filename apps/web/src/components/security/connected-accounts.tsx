"use client";

import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  disconnectGoogleIdentity,
  getLinkedIdentities,
  getTwoFactorStatus,
  startGoogleIdentityLink,
} from "@/lib/api";
import {
  isOAuthPopupResult,
  OAUTH_LINK_SUCCESS,
  OAUTH_POPUP_ACK,
  oauthChannelName,
  oauthPopupAttemptKey,
  type OAuthPopupResult,
} from "@/lib/oauth-popup";

function errorText(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (!error.response) return "Cannot reach the server. Try again.";
  }
  return "The connected-account operation could not be completed.";
}

function oauthErrorText(code: string): string {
  const messages: Record<string, string> = {
    sso_provider_error: "Google cancelled or could not complete the connection.",
    invalid_sso_state: "This connection attempt expired or was already used.",
    sso_link_email_mismatch: "Choose the Google account with the same verified email as your Coditent account.",
    sso_identity_already_linked: "That Google account is already connected to another Coditent account.",
    sso_provider_already_linked: "A Google account is already connected to this Coditent account.",
    sso_link_session_invalid: "Your Coditent session expired. Sign in and try again.",
    sso_link_session_mismatch: "This connection attempt belongs to a different session.",
    sso_nonce_invalid: "The Google response could not be matched to this connection attempt.",
    sso_id_token_invalid: "Google returned an identity response that could not be verified.",
  };
  return messages[code] ?? "Google could not be connected. Start a new connection attempt.";
}

export function ConnectedAccounts() {
  return <div className="space-y-5"><ProviderAccount provider="google" /><ProviderAccount provider="linkedin" /></div>;
}

function ProviderAccount({ provider }: { provider: "google" | "linkedin" }) {
  const label = provider === "google" ? "Google" : "LinkedIn";
  const queryClient = useQueryClient();
  const identitiesQ = useQuery({ queryKey: ["linked-identities"], queryFn: getLinkedIdentities });
  const twoFactorQ = useQuery({ queryKey: ["two-factor-status"], queryFn: getTwoFactorStatus });
  const popupRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const attemptRef = useRef<string | null>(null);
  const handledRef = useRef(false);
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const google = identitiesQ.data?.identities.find((item) => item.provider === provider);
  const passwordEnabled = identitiesQ.data?.password_enabled ?? false;
  const twoFactorEnabled = Boolean(twoFactorQ.data?.is_2fa_enabled);

  useEffect(() => () => {
    channelRef.current?.close();
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  function acknowledge(attemptId: string) {
    const message = { type: OAUTH_POPUP_ACK, attemptId } as const;
    try { popupRef.current?.postMessage(message, window.location.origin); } catch { /* COOP may detach opener. */ }
    channelRef.current?.postMessage(message);
  }

  async function handleResult(result: OAuthPopupResult) {
    if (result.attemptId !== attemptRef.current || handledRef.current) return;
    handledRef.current = true;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    localStorage.removeItem(oauthPopupAttemptKey(result.attemptId));
    acknowledge(result.attemptId);
    channelRef.current?.close();
    channelRef.current = null;
    popupRef.current = null;
    setBusy(null);
    if (result.type !== OAUTH_LINK_SUCCESS) {
      setError(result.type === "CODITENT_OAUTH_ERROR" ? oauthErrorText(result.error) : "Unexpected OAuth result.");
      return;
    }
    setPassword("");
    setTwoFactorCode("");
    setNotice(`${label} was connected to this Coditent account.`);
    await queryClient.invalidateQueries({ queryKey: ["linked-identities"] });
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null); setNotice(null); setBusy("connect");
    const attemptId = crypto.randomUUID();
    attemptRef.current = attemptId;
    handledRef.current = false;
    localStorage.setItem(oauthPopupAttemptKey(attemptId), String(Date.now()));
    const width = 520, height = 650;
    // Open synchronously from the click so browser popup protection does not
    // mistake the later, authenticated API round trip for an unsolicited popup.
    const popup = window.open(
      "about:blank",
      `coditent_oauth_link_${provider}`,
      `popup=yes,width=${width},height=${height},resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      localStorage.removeItem(oauthPopupAttemptKey(attemptId));
      setBusy(null);
      setError("The Google popup was blocked. Allow popups and try again.");
      return;
    }
    popupRef.current = popup;
    try {
      const result = await startGoogleIdentityLink({
        current_password: password,
        two_factor_code: twoFactorCode || undefined,
        popup_origin: window.location.origin,
        attempt_id: attemptId,
      }, provider);
      popup.location.href = result.authorization_url;
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel(oauthChannelName(attemptId));
        channel.onmessage = (message: MessageEvent) => {
          if (isOAuthPopupResult(message.data)) void handleResult(message.data);
        };
        channelRef.current = channel;
      }
      const onMessage = (message: MessageEvent) => {
        if (message.origin !== window.location.origin || message.source !== popup) return;
        if (!isOAuthPopupResult(message.data)) return;
        window.removeEventListener("message", onMessage);
        void handleResult(message.data);
      };
      window.addEventListener("message", onMessage);
      timeoutRef.current = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        if (!handledRef.current) {
          localStorage.removeItem(oauthPopupAttemptKey(attemptId));
          setBusy(null);
          setError("Google connection timed out. Close the popup and try again.");
          channelRef.current?.close();
        }
      }, 120_000);
      popup.focus();
    } catch (err) {
      popup.close();
      popupRef.current = null;
      localStorage.removeItem(oauthPopupAttemptKey(attemptId));
      setBusy(null);
      setError(err instanceof Error && err.message.includes("popup") ? err.message : errorText(err));
    }
  }

  async function disconnect() {
    if (busy || !window.confirm(`Disconnect ${label} from this Coditent account?`)) return;
    setError(null); setNotice(null); setBusy("disconnect");
    try {
      const result = await disconnectGoogleIdentity({
        current_password: password,
        two_factor_code: twoFactorCode || undefined,
      }, provider);
      setPassword(""); setTwoFactorCode(""); setNotice(result.detail);
      await queryClient.invalidateQueries({ queryKey: ["linked-identities"] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5" aria-labelledby={`connected-accounts-${provider}`}>
      <div>
        <h2 id={`connected-accounts-${provider}`} className="font-semibold text-foreground">{label} connection</h2>
        <p className="text-sm text-muted-foreground">Connect {label} as an additional secure way to sign in to this same account.</p>
      </div>
      {identitiesQ.isLoading ? <p className="text-sm text-muted-foreground">Loading connected accounts…</p> : null}
      {identitiesQ.isError ? <p role="alert" className="text-sm text-danger">Could not load connected accounts.</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-danger-background p-3 text-sm text-danger">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-success-background p-3 text-sm text-success">{notice}</p> : null}
      {google ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-foreground">{label}</p>
            <p className="text-sm text-muted-foreground">
              {google.connected ? `Connected as ${google.email}` : "Not connected"}
              {google.connected && google.linked_at ? ` · ${new Date(google.linked_at).toLocaleDateString()}` : ""}
            </p>
          </div>
          {!passwordEnabled ? <p className="text-sm text-muted-foreground">Set a local password through password recovery before changing connected login methods.</p> : null}
        </div>
      ) : null}
      {passwordEnabled ? (
        <form className="space-y-3" onSubmit={google?.connected ? (event) => { event.preventDefault(); void disconnect(); } : connect}>
          <Input label="Current password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {twoFactorEnabled ? <Input label="Authenticator or recovery code" autoComplete="one-time-code" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.slice(0, 20))} required /> : null}
          <Button type="submit" variant={google?.connected ? "outline" : "primary"} loading={busy !== null}>
            {google?.connected ? `Disconnect ${label}` : `Connect ${label}`}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
