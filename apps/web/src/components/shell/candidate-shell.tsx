"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getCandidateOnboarding, getMe } from "@/lib/api";
import { CandidateTopShell } from "./candidate-top-shell";

function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("coditent_token");
    document.cookie = "coditent_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/login";
  }
}

export function CandidateShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  const { data: onboarding, isLoading } = useQuery({
    queryKey: ["candidate-onboarding"],
    queryFn: getCandidateOnboarding,
    enabled: me?.role === "CANDIDATE",
    staleTime: 60_000,
  });

  useEffect(() => {
    if (onboarding && !onboarding.onboarding_completed) router.replace("/get-started");
  }, [onboarding, router]);

  if (me?.role === "CANDIDATE" && (isLoading || onboarding?.onboarding_completed === false)) return null;

  return (
    <div className="candidate-theme">
    <CandidateTopShell
      user={{
        name: me?.full_name || "Candidate",
        email: me?.email,
        avatarUrl: me?.avatar_url,
      }}
      onLogout={logout}
    >
      {children}
    </CandidateTopShell>
    </div>
  );
}
