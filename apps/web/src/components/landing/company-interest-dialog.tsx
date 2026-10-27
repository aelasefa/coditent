"use client";

import { useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { submitCompanyInterest } from "@/lib/api";
import styles from "./company-interest-dialog.module.css";

type SubmitState = "idle" | "submitting" | "success";

interface CompanyInterestDialogProps { className?: string; }

export function CompanyInterestDialog({ className }: CompanyInterestDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string>();
  const emailRef = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    setState("idle");
    setError(undefined);
    setEmail("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;
    setState("submitting");
    setError(undefined);
    try {
      await submitCompanyInterest(email.trim());
      setState("success");
    } catch (requestError) {
      const detail = (requestError as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "We could not send your request. Please try again.");
      setState("idle");
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        data-scroll-reveal
        data-reveal-delay="3"
        onClick={() => setOpen(true)}
      >
        Start hiring <span aria-hidden="true">↗</span>
      </button>

      <Dialog
        open={open}
        onClose={close}
        title={state === "success" ? "Request received" : "Start hiring with Coditent"}
        description={state === "success" ? undefined : "Leave your company email and our team will review your request."}
        size="md"
        initialFocusRef={emailRef}
      >
        <div className={styles.dialogContent}>
          {state === "success" ? (
            <div className={styles.success} role="status" aria-live="polite">
              <svg className={styles.successMark} viewBox="0 0 64 64" aria-hidden="true">
                <circle className={styles.successRing} cx="32" cy="32" r="28" />
                <path className={styles.successCheck} d="M18 32.5 27.5 42 47 22" />
              </svg>
              <h3>Thank you.</h3>
              <p>Your request is with our admin team. We’ll contact you at {email} after review.</p>
              <button type="button" className={styles.doneButton} onClick={close}>Done</button>
            </div>
          ) : (
            <form className={styles.form} onSubmit={submit}>
              <Input
                ref={emailRef}
                label="Company email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                disabled={state === "submitting"}
              />
              <p className={styles.privacyNote}>
                We use this address only to review your company request and contact you about access.
              </p>
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              <div className={styles.formActions}>
                <button type="button" className={styles.cancelButton} onClick={close}>Cancel</button>
                <button type="submit" className={styles.submitButton} disabled={state === "submitting"}>
                  {state === "submitting" ? <LoadingSpinner size="small" tone="current" announce={false} /> : null}
                  {state === "submitting" ? "Sending…" : "Send request"}
                </button>
              </div>
            </form>
          )}
        </div>
      </Dialog>
    </>
  );
}
