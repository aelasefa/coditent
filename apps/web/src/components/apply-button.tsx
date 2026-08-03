"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { MdButton } from "@/components/ui/md-button";
import { applyToOffer } from "@/lib/api";

interface ApplyButtonProps {
  offerId: string;
  size?: "sm" | "md" | "lg";
  initialApplied?: boolean;
  coverLetter?: string;
  onAppliedChange?: (applied: boolean) => void;
}

export function ApplyButton({
  offerId,
  size = "sm",
  initialApplied = false,
  coverLetter,
  onAppliedChange,
}: ApplyButtonProps) {
  const queryClient = useQueryClient();
  const [applied, setApplied] = useState<boolean>(initialApplied);
  const [pending, setPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);

    try {
      await applyToOffer(offerId, coverLetter ? { cover_letter: coverLetter } : {});
      setApplied(true);
      onAppliedChange?.(true);
      queryClient.invalidateQueries({ queryKey: ["my-applications"] });
    } catch (err) {
      const status = (err as { response?: { status?: number; data?: { detail?: string } } })
        ?.response?.status;
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;

      if (status === 401) {
        setError("Please sign in to apply");
      } else if (status === 409) {
        setError(detail ?? "Offer not available");
      } else if (typeof detail === "string" && detail.includes("already")) {
        setApplied(true);
        onAppliedChange?.(true);
      } else {
        setError(detail ?? "Failed to apply. Try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <MdButton
        disabled={pending}
        onClick={handleClick}
        size={size}
        variant={applied ? "tonal" : "filled"}
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
            Sending...
          </span>
        ) : applied ? (
          <>
            <span aria-hidden>✓</span>
            Applied
          </>
        ) : (
          <>Apply</>
        )}
      </MdButton>
      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
    </div>
  );
}

