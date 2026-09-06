"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, Suspense } from "react";

export const dynamic = "force-dynamic";

function AcceptRedirectInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") || sp.get("t") || "";
  const type = sp.get("type"); // company or employee

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    // Default to employee; company invites use /invite/company
    if (type === "company") {
      router.replace(`/invite/company?token=${encodeURIComponent(token)}`);
    } else {
      router.replace(`/invite/employee?token=${encodeURIComponent(token)}`);
    }
  }, [token, type, router]);

  return <main className="p-6 text-sm text-zinc-500">Redirecting to invitation...</main>;
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm">Loading...</main>}>
      <AcceptRedirectInner />
    </Suspense>
  );
}
