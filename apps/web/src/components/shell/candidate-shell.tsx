"use client";

import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/api";
import { AppShell } from "./app-shell";
import { candidateBottomNav, candidateNavSections } from "./nav-config";

function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("coditent_token");
    document.cookie = "coditent_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/login";
  }
}

export function CandidateShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });

  return (
    <AppShell
      navSections={candidateNavSections}
      bottomNav={candidateBottomNav}
      logoHref="/dashboard"
      user={{
        name: me?.full_name || "Candidate",
        email: me?.email,
        roleLabel: me?.role,
      }}
      userMenuItems={[{ label: "Profile", href: "/profile" }]}
      onLogout={logout}
    >
      {children}
    </AppShell>
  );
}
