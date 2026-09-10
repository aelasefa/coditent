"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { acceptCompanyInvite } from "@/lib/api";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

const errorMap: Record<string, string> = {
  "Invalid or used token": "This invitation is invalid or no longer available.",
  "Token expired": "This invitation has expired. Ask your administrator for a new invitation.",
};

function CompanyInviteInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") || "";
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <AuthLayout title="Invitation missing" subtitle="Open the link from your email.">
        <p role="alert" className="text-sm font-medium text-danger">Missing invitation token.</p>
      </AuthLayout>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setIsError(false);
    try {
      await acceptCompanyInvite({ token, password, full_name: fullName });
      setMsg("Company created — redirecting to login...");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      const detail = e?.response?.data?.detail || "Failed";
      setMsg(errorMap[detail] || detail);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Company invitation" subtitle="You become owner of the invited company. Details come from invitation.">
      <form onSubmit={onSubmit} className="space-y-3">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" required autoComplete="name" />
        <div>
          <Input label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" required autoComplete="new-password" />
          <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} className="mt-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
            {showPassword ? "Hide password" : "Show password"}
          </button>
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Accept invitation
        </Button>
        {msg && (
          <p role={isError ? "alert" : "status"} className={isError ? "text-sm font-medium text-danger" : "text-sm text-muted-foreground"}>
            {msg}
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
export default function CompanyInvitePage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm">Loading...</main>}>
      <CompanyInviteInner />
    </Suspense>
  );
}
